use crate::models::{ServerProfile, ServerStatus, ServerStatusState};
use crate::security::SecurityPolicy;
use anyhow::{Result, anyhow};
use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub struct RunningProcess {
    pub child: Child,
    pub stdin: std::process::ChildStdin,
    pub log_buffer: Arc<Mutex<VecDeque<String>>>,
    pub status: Arc<RwLock<ServerStatus>>,
}

#[derive(Clone)]
pub struct ServerLifecycleManager {
    processes: Arc<Mutex<HashMap<String, RunningProcess>>>,
    log_buffers: Arc<Mutex<HashMap<String, Arc<Mutex<VecDeque<String>>>>>>,
}

impl ServerLifecycleManager {
    pub fn new() -> Self {
        ServerLifecycleManager {
            processes: Arc::new(Mutex::new(HashMap::new())),
            log_buffers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Gets current server status
    pub fn get_status(&self, server_id: &str, default_port: u16) -> ServerStatus {
        let procs = self.processes.lock().unwrap();
        if let Some(proc) = procs.get(server_id) {
            proc.status.read().unwrap().clone()
        } else {
            ServerStatus {
                state: ServerStatusState::Stopped,
                pid: None,
                port: default_port,
                online_players: None,
                max_players: None,
                memory_used_mb: None,
                cpu_percent: None,
                exit_code: None,
                error_message: None,
            }
        }
    }

    /// Gets in-memory log buffer for the server (last 500 lines)
    pub fn get_logs(&self, server_id: &str) -> Vec<String> {
        let buffers = self.log_buffers.lock().unwrap();
        if let Some(buf) = buffers.get(server_id) {
            let b = buf.lock().unwrap();
            b.iter().cloned().collect()
        } else {
            Vec::new()
        }
    }

    /// Prepares EULA file if accepted
    pub fn ensure_eula(server_dir: &Path, accepted: bool) -> Result<()> {
        let eula_path = server_dir.join("eula.txt");
        if accepted {
            let content = format!(
                "# By changing the setting below to TRUE you are indicating your agreement to our EULA (https://aka.ms/MinecraftEULA).\n# {}\neula=true\n",
                chrono::Utc::now().to_rfc3339()
            );
            std::fs::write(eula_path, content)?;
        }
        Ok(())
    }

    /// Starts a Minecraft server process
    pub fn start_server(&self, app: AppHandle, profile: &ServerProfile) -> Result<()> {
        let mut procs = self.processes.lock().unwrap();

        // Check if any existing process record has already terminated/crashed, and clean it up
        let mut should_remove = false;
        let mut is_still_active = false;

        if let Some(proc) = procs.get_mut(&profile.id) {
            if let Ok(Some(exit)) = proc.child.try_wait() {
                let mut st = proc.status.write().unwrap();
                st.state = ServerStatusState::Stopped;
                st.exit_code = exit.code();
                should_remove = true;
            } else {
                let st = proc.status.read().unwrap();
                if st.state == ServerStatusState::Crashed || st.state == ServerStatusState::Stopped
                {
                    let _ = proc.child.kill();
                    should_remove = true;
                } else {
                    is_still_active = true;
                }
            }
        }

        if is_still_active {
            return Err(anyhow!("Server '{}' is already running", profile.name));
        }

        if should_remove {
            procs.remove(&profile.id);
        }

        let clean_server_dir = profile
            .server_dir
            .strip_prefix(r"\\?\")
            .unwrap_or(&profile.server_dir);
        let server_dir = PathBuf::from(clean_server_dir);
        if !server_dir.exists() {
            std::fs::create_dir_all(&server_dir)?;
        }

        // Validate memory
        SecurityPolicy::validate_memory(profile.min_ram_mb, profile.max_ram_mb)?;

        // Ensure EULA
        Self::ensure_eula(&server_dir, profile.eula_accepted)?;

        let raw_java = if let Some(ref custom_java) = profile.java_path {
            custom_java.clone()
        } else {
            // Find system default java
            #[cfg(target_os = "windows")]
            let def_java = "java.exe".to_string();
            #[cfg(not(target_os = "windows"))]
            let def_java = "java".to_string();
            def_java
        };

        let java_binary = raw_java
            .strip_prefix(r"\\?\")
            .unwrap_or(&raw_java)
            .to_string();

        // Determine jar path / startup script
        let mut active_target = profile.jar_file.clone();
        let mut jar_path = server_dir.join(&active_target);

        if !jar_path.exists() {
            // Check for modern Forge / NeoForge launch script or generated server jar
            #[cfg(target_os = "windows")]
            let script_name = "run.bat";
            #[cfg(not(target_os = "windows"))]
            let script_name = "run.sh";

            let script_path = server_dir.join(script_name);
            if script_path.exists() {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    if let Ok(meta) = std::fs::metadata(&script_path) {
                        let mut perms = meta.permissions();
                        perms.set_mode(0o755);
                        let _ = std::fs::set_permissions(&script_path, perms);
                    }
                }
                active_target = script_name.to_string();
                jar_path = script_path;
            } else if server_dir.join("run.bat").exists() {
                active_target = "run.bat".to_string();
                jar_path = server_dir.join("run.bat");
            } else if server_dir.join("run.sh").exists() {
                let run_sh = server_dir.join("run.sh");
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    if let Ok(meta) = std::fs::metadata(&run_sh) {
                        let mut perms = meta.permissions();
                        perms.set_mode(0o755);
                        let _ = std::fs::set_permissions(&run_sh, perms);
                    }
                }
                active_target = "run.sh".to_string();
                jar_path = run_sh;
            } else if let Ok(entries) = std::fs::read_dir(&server_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_file() && p.extension().map(|e| e == "jar").unwrap_or(false) {
                        let name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
                        if (name.contains("forge") || name.contains("neoforge") || name.contains("server"))
                            && !name.ends_with("-installer.jar")
                        {
                            active_target = name;
                            jar_path = p;
                            break;
                        }
                    }
                }
            }
        }

        if !jar_path.exists() {
            return Err(anyhow!(
                "Server launch target not found at: {:?}. Please install a server jar or launch script into the server directory.",
                jar_path
            ));
        }

        // For Forge / NeoForge, ensure user_jvm_args.txt has the configured memory settings
        let user_jvm_args_path = server_dir.join("user_jvm_args.txt");
        if user_jvm_args_path.exists()
            || active_target.ends_with(".bat")
            || active_target.ends_with(".sh")
        {
            let user_jvm_content = format!(
                "# Generated by MCSet\n-Xms{}M\n-Xmx{}M\n{}\n",
                profile.min_ram_mb,
                profile.max_ram_mb,
                profile.jvm_flags.trim()
            );
            let _ = std::fs::write(&user_jvm_args_path, user_jvm_content);
        }

        let is_batch = active_target.ends_with(".bat") || active_target.ends_with(".cmd");
        let is_sh = active_target.ends_with(".sh");

        let mut cmd = if is_batch {
            #[cfg(target_os = "windows")]
            {
                let mut c = Command::new("cmd.exe");
                c.current_dir(&server_dir);
                c.args(["/c", &active_target, "nogui"]);
                c
            }
            #[cfg(not(target_os = "windows"))]
            {
                let mut c = Command::new("sh");
                c.current_dir(&server_dir);
                let sh_target = if server_dir.join("run.sh").exists() {
                    "run.sh"
                } else {
                    &active_target
                };
                c.args([sh_target, "nogui"]);
                c
            }
        } else if is_sh {
            let mut c = Command::new("sh");
            c.current_dir(&server_dir);
            c.args([&active_target, "nogui"]);
            c
        } else {
            let mut cmd = Command::new(&java_binary);
            cmd.current_dir(&server_dir);
            cmd.arg(format!("-Xms{}M", profile.min_ram_mb));
            cmd.arg(format!("-Xmx{}M", profile.max_ram_mb));

            // Additional JVM flags
            if !profile.jvm_flags.trim().is_empty() {
                for flag in profile.jvm_flags.split_whitespace() {
                    cmd.arg(flag);
                }
            }

            cmd.arg("-jar");
            cmd.arg(&active_target);
            cmd.arg("nogui");
            cmd
        };

        // Prepend Java runtime directory to PATH and set JAVA_HOME so run scripts use the exact matching Java
        if let Some(java_parent) = std::path::Path::new(&java_binary).parent() {
            let current_path = std::env::var("PATH").unwrap_or_default();
            #[cfg(target_os = "windows")]
            let new_path = format!("{};{}", java_parent.display(), current_path);
            #[cfg(not(target_os = "windows"))]
            let new_path = format!("{}:{}", java_parent.display(), current_path);

            cmd.env("PATH", new_path);
            if let Some(java_home) = java_parent.parent() {
                cmd.env("JAVA_HOME", java_home);
            }
        }

        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        // Fast-fail if the server port is already locked by another application
        let port = profile.port;
        let is_v4_avail = std::net::TcpListener::bind(("0.0.0.0", port)).is_ok()
            || std::net::TcpListener::bind(("127.0.0.1", port)).is_ok();
        if !is_v4_avail {
            return Err(anyhow!(
                "Port {} is already locked by another process or lingering server. Please free port {} or change the port in server settings.",
                port,
                port
            ));
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| anyhow!("Failed to spawn Java process '{}': {}", java_binary, e))?;

        crate::process_guard::guard_child_process(&child);

        let pid = child.id();
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| anyhow!("Failed to open child stdin"))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow!("Failed to open child stdout"))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| anyhow!("Failed to open child stderr"))?;

        let status = Arc::new(RwLock::new(ServerStatus {
            state: ServerStatusState::Starting,
            pid: Some(pid),
            port: profile.port,
            online_players: Some(0),
            max_players: None,
            memory_used_mb: None,
            cpu_percent: None,
            exit_code: None,
            error_message: None,
        }));

        let log_buffer = {
            let mut buffers = self.log_buffers.lock().unwrap();
            buffers
                .entry(profile.id.clone())
                .or_insert_with(|| Arc::new(Mutex::new(VecDeque::with_capacity(1000))))
                .clone()
        };

        let server_id = profile.id.clone();
        let status_clone = status.clone();
        let app_handle = app.clone();
        let log_buffer_stdout = log_buffer.clone();

        // Background reader for stdout
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line_res in reader.lines() {
                if let Ok(line) = line_res {
                    // Check for state changes in log line
                    let lower = line.to_lowercase();
                    if lower.contains("done (") && lower.contains("for help, type") {
                        let mut st = status_clone.write().unwrap();
                        st.state = ServerStatusState::Running;
                    } else if lower.contains("failed to bind to port")
                        || lower.contains("address already in use")
                    {
                        let mut st = status_clone.write().unwrap();
                        st.state = ServerStatusState::Crashed;
                        st.error_message = Some(
                            "Port conflict: Another application is already using this port."
                                .to_string(),
                        );
                    } else if lower
                        .contains("has been compiled by a more recent version of the java runtime")
                    {
                        let mut st = status_clone.write().unwrap();
                        st.state = ServerStatusState::Crashed;
                        st.error_message = Some("Java version incompatibility: Server jar requires a newer Java version.".to_string());
                    } else if lower.contains("outofmemoryerror")
                        || lower.contains("could not reserve enough space")
                    {
                        let mut st = status_clone.write().unwrap();
                        st.state = ServerStatusState::Crashed;
                        st.error_message = Some(
                            "Out of Memory: The server exceeded allocated JVM RAM.".to_string(),
                        );
                    }

                    // Append to log buffer (deduplicate identical consecutive mirrored line)
                    let should_emit = {
                        let mut buf = log_buffer_stdout.lock().unwrap();
                        if let Some(last) = buf.back() {
                            if last == &line {
                                false
                            } else {
                                if buf.len() >= 1000 {
                                    buf.pop_front();
                                }
                                buf.push_back(line.clone());
                                true
                            }
                        } else {
                            buf.push_back(line.clone());
                            true
                        }
                    };

                    if should_emit {
                        // Emit event to frontend
                        let _ = app_handle.emit(
                            &format!("server-console:{}", server_id),
                            serde_json::json!({
                                "server_id": server_id,
                                "line": line,
                                "is_error": false,
                            }),
                        );
                    }
                }
            }
        });

        // Background reader for stderr
        let server_id_err = profile.id.clone();
        let app_handle_err = app.clone();
        let log_buffer_stderr = log_buffer.clone();

        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line_res in reader.lines() {
                if let Ok(line) = line_res {
                    let should_emit = {
                        let mut buf = log_buffer_stderr.lock().unwrap();
                        if let Some(last) = buf.back() {
                            if last == &line {
                                false
                            } else {
                                if buf.len() >= 1000 {
                                    buf.pop_front();
                                }
                                buf.push_back(line.clone());
                                true
                            }
                        } else {
                            buf.push_back(line.clone());
                            true
                        }
                    };

                    if should_emit {
                        let _ = app_handle_err.emit(
                            &format!("server-console:{}", server_id_err),
                            serde_json::json!({
                                "server_id": server_id_err,
                                "line": line,
                                "is_error": true,
                            }),
                        );
                    }
                }
            }
        });

        procs.insert(
            profile.id.clone(),
            RunningProcess {
                child,
                stdin,
                log_buffer,
                status: status.clone(),
            },
        );

        // Spawn a watcher thread to reap the child process when it terminates or crashes
        let processes_reaper = self.processes.clone();
        let server_id_reaper = profile.id.clone();
        let status_reaper = status;
        let app_reaper = app;

        std::thread::spawn(move || {
            loop {
                std::thread::sleep(Duration::from_millis(1000));
                let mut procs = processes_reaper.lock().unwrap();
                if let Some(proc) = procs.get_mut(&server_id_reaper) {
                    match proc.child.try_wait() {
                        Ok(Some(exit)) => {
                            let mut st = status_reaper.write().unwrap();
                            if st.state != ServerStatusState::Crashed {
                                st.state = ServerStatusState::Stopped;
                            }
                            st.exit_code = exit.code();
                            procs.remove(&server_id_reaper);
                            let _ = app_reaper.emit("server-status-changed", &*st);
                            break;
                        }
                        Ok(None) => {
                            // Still running
                        }
                        Err(_) => {
                            procs.remove(&server_id_reaper);
                            break;
                        }
                    }
                } else {
                    break;
                }
            }
        });

        Ok(())
    }

    /// Sends a console command to the running server stdin
    pub fn send_command(&self, server_id: &str, command: &str) -> Result<()> {
        let mut procs = self.processes.lock().unwrap();
        if let Some(proc) = procs.get_mut(server_id) {
            writeln!(proc.stdin, "{}", command.trim())?;
            proc.stdin.flush()?;
            Ok(())
        } else {
            Err(anyhow!("Server is not currently running"))
        }
    }

    /// Stops a running server gracefully
    pub fn stop_server(&self, server_id: &str) -> Result<()> {
        let mut procs = self.processes.lock().unwrap();
        if let Some(mut proc) = procs.remove(server_id) {
            {
                let mut st = proc.status.write().unwrap();
                st.state = ServerStatusState::Stopping;
            }

            // Attempt graceful shutdown via `stop\n`
            let _ = writeln!(proc.stdin, "stop");
            let _ = proc.stdin.flush();

            // Wait up to 10 seconds in a worker thread, or terminate
            std::thread::spawn(move || {
                for _ in 0..20 {
                    std::thread::sleep(Duration::from_millis(500));
                    if let Ok(Some(exit)) = proc.child.try_wait() {
                        let mut st = proc.status.write().unwrap();
                        st.state = ServerStatusState::Stopped;
                        st.exit_code = exit.code();
                        return;
                    }
                }

                // If still running after 10s, kill
                let _ = proc.child.kill();
                let _ = proc.child.wait();
                let mut st = proc.status.write().unwrap();
                st.state = ServerStatusState::Stopped;
            });

            Ok(())
        } else {
            Err(anyhow!("Server is not running"))
        }
    }

    /// Restarts a running server
    pub fn restart_server(&self, app: AppHandle, profile: &ServerProfile) -> Result<()> {
        let _ = self.stop_server(&profile.id);
        std::thread::sleep(Duration::from_millis(1500));
        self.start_server(app, profile)
    }

    /// Gets list of currently running server IDs
    pub fn get_running_server_ids(&self) -> Vec<String> {
        let procs = self.processes.lock().unwrap();
        procs.keys().cloned().collect()
    }

    /// Stops all running servers cleanly for application shutdown
    pub fn stop_all(&self) {
        let mut procs = self.processes.lock().unwrap();
        if procs.is_empty() {
            return;
        }

        log::info!(
            "Terminating {} running server(s) for application shutdown",
            procs.len()
        );

        // Step 1: Send "stop" command to all active servers
        for (_id, proc) in procs.iter_mut() {
            let _ = writeln!(proc.stdin, "stop");
            let _ = proc.stdin.flush();
        }

        // Step 2: Brief grace period for worlds to write chunk headers
        std::thread::sleep(Duration::from_millis(800));

        // Step 3: Unconditionally kill any processes that have not stopped
        for (server_id, mut proc) in procs.drain() {
            log::info!("Terminating server '{}' process", server_id);
            let _ = proc.child.kill();
            let _ = proc.child.wait();
            if let Ok(mut st) = proc.status.write() {
                st.state = ServerStatusState::Stopped;
            }
        }
    }
}
