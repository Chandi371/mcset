use std::collections::{HashMap, VecDeque};
use std::fs;
use std::io::{BufRead, BufReader};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;

use anyhow::{anyhow, Result};
use regex::Regex;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use crate::models::{PortalServerStatus, PortalTunnelState, ServerProfile};

/// Represents an actively running Portal tunnel process
struct RunningTunnel {
    child: Child,
    #[allow(dead_code)]
    server_id: String,
}

/// Thread-safe manager for gosuda/portal-tunnel instances
#[derive(Clone)]
pub struct PortalManager {
    data_dir: PathBuf,
    statuses: Arc<RwLock<HashMap<String, PortalServerStatus>>>,
    logs: Arc<Mutex<HashMap<String, VecDeque<String>>>>,
    processes: Arc<Mutex<HashMap<String, RunningTunnel>>>,
}

impl PortalManager {
    /// Initializes a new PortalManager instance
    pub fn new(data_dir: &Path) -> Self {
        let portal_dir = data_dir.join("portal");
        let _ = fs::create_dir_all(&portal_dir);
        let bin_dir = data_dir.join("bin");
        let _ = fs::create_dir_all(&bin_dir);

        Self {
            data_dir: data_dir.to_path_buf(),
            statuses: Arc::new(RwLock::new(HashMap::new())),
            logs: Arc::new(Mutex::new(HashMap::new())),
            processes: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Locates the portal executable, checking standard locations and copying from Downloads if available
    pub fn find_portal_binary(&self) -> Result<PathBuf> {
        let candidates = [
            self.data_dir.join("bin").join("portal.exe"),
            PathBuf::from("portal.exe"),
            PathBuf::from("C:\\Users\\hanis\\AppData\\Roaming\\mcset\\bin\\portal.exe"),
            PathBuf::from("C:\\Users\\hanis\\Downloads\\portal-windows-amd64.exe"),
        ];

        for candidate in &candidates {
            if candidate.is_file() {
                // If found in downloads, ensure it's copied to data_dir/bin for persistence
                let target_bin = self.data_dir.join("bin").join("portal.exe");
                if candidate != &target_bin && !target_bin.is_file() {
                    let _ = fs::copy(candidate, &target_bin);
                }
                return Ok(candidate.clone());
            }
        }

        // Try current executable directory
        if let Ok(curr) = std::env::current_exe() {
            if let Some(parent) = curr.parent() {
                let p1 = parent.join("portal.exe");
                if p1.is_file() {
                    return Ok(p1);
                }
            }
        }

        Err(anyhow!(
            "portal-tunnel executable not found. Please install portal.exe or portal-windows-amd64.exe in mcset bin directory."
        ))
    }

    /// Checks whether local server is listening on the target TCP port
    pub fn check_local_server_running(port: u16) -> bool {
        let addr = format!("127.0.0.1:{}", port);
        if let Ok(socket_addrs) = addr.to_socket_addrs() {
            for sa in socket_addrs {
                if TcpStream::connect_timeout(&sa, Duration::from_millis(500)).is_ok() {
                    return true;
                }
            }
        }
        false
    }

    /// Probes remote connectivity for the allocated public endpoint
    pub fn verify_public_endpoint(endpoint: &str) -> bool {
        let parts: Vec<&str> = endpoint.split(':').collect();
        if parts.len() != 2 {
            return false;
        }
        let host = parts[0];
        let Ok(port) = parts[1].parse::<u16>() else {
            return false;
        };

        let addr_str = format!("{}:{}", host, port);
        if let Ok(socket_addrs) = addr_str.to_socket_addrs() {
            for addr in socket_addrs {
                if TcpStream::connect_timeout(&addr, Duration::from_millis(3000)).is_ok() {
                    return true;
                }
            }
        }

        false
    }

    /// Sanitizes sensitive fields from log lines
    pub fn sanitize_log_line(line: &str) -> String {
        let secret_regex = Regex::new(r#"(?i)(key|secret|password|token)[:=\s]+([a-zA-Z0-9_\-]{16,})"#).unwrap();
        secret_regex.replace_all(line, "$1: [REDACTED]").to_string()
    }

    /// Parses the allocated raw TCP endpoint from Portal tunnel logs (JSON or text)
    pub fn parse_portal_endpoint(line: &str) -> Option<(String, Option<String>)> {
        let trimmed = line.trim();

        // 1. Try parsing structured JSON looking specifically for tcp_addr
        if trimmed.starts_with('{') && trimmed.ends_with('}') {
            if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
                if let Some(tcp_addr) = val.get("tcp_addr").and_then(|v| v.as_str()) {
                    let cleaned = tcp_addr.trim().to_string();
                    let relay_url = val.get("relay_url").and_then(|v| v.as_str()).map(|s| s.to_string());
                    if Self::is_valid_endpoint(&cleaned) {
                        return Some((cleaned, relay_url));
                    }
                }
            }
        }

        // 2. Text fallback regex: tcp_addr=hostname:port or tcp://hostname:port
        let text_re = Regex::new(r#"(?:tcp_addr=|tcp://)([a-zA-Z0-9\.\-]+\.[a-z]{2,}:[0-9]{1,5})"#).unwrap();
        if let Some(caps) = text_re.captures(trimmed) {
            let addr = caps.get(1)?.as_str().trim().to_string();
            if Self::is_valid_endpoint(&addr) {
                return Some((addr, None));
            }
        }

        None
    }

    /// Validates endpoint format: hostname:port
    /// Raw TCP game forwarding endpoints must have a valid non-web port (not 80 or 443).
    pub fn is_valid_endpoint(endpoint: &str) -> bool {
        let parts: Vec<&str> = endpoint.split(':').collect();
        if parts.len() != 2 {
            return false;
        }
        let host = parts[0];
        if host.is_empty() || !host.contains('.') {
            return false;
        }
        if let Ok(port) = parts[1].parse::<u16>() {
            return port > 0 && port != 80 && port != 443;
        }
        false
    }

    /// Prepares server-specific identity path to preserve domain and key across restarts
    pub fn get_identity_path(&self, server_id: &str) -> PathBuf {
        let server_portal_dir = self.data_dir.join("servers").join(server_id).join("portal");
        let _ = fs::create_dir_all(&server_portal_dir);
        server_portal_dir.join("identity.json")
    }

    /// Resolves the actual Minecraft server port from server.properties if available,
    /// falling back to the configured profile port.
    pub fn resolve_server_port(server: &ServerProfile) -> u16 {
        let clean_dir = server.server_dir.strip_prefix(r"\\?\").unwrap_or(&server.server_dir);
        let props_path = Path::new(clean_dir).join("server.properties");
        if props_path.is_file() {
            if let Ok(content) = fs::read_to_string(&props_path) {
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with('#') || trimmed.starts_with('!') {
                        continue;
                    }
                    if let Some((k, v)) = trimmed.split_once('=') {
                        if k.trim() == "server-port" {
                            if let Ok(p) = v.trim().parse::<u16>() {
                                if p > 0 {
                                    return p;
                                }
                            }
                        }
                    }
                }
            }
        }
        if server.port > 0 {
            server.port
        } else {
            25565
        }
    }

    /// Builds process arguments array for portal expose:
    /// portal expose localhost:<PORT> --name minecraft --tcp ...
    pub fn build_portal_args(local_port: u16, identity_path: &Path) -> Vec<String> {
        vec![
            "expose".to_string(),
            format!("localhost:{}", local_port),
            "--name".to_string(),
            "minecraft".to_string(),
            "--tcp".to_string(),
            "--identity-path".to_string(),
            identity_path.to_string_lossy().to_string(),
            "--log-format".to_string(),
            "json".to_string(),
        ]
    }

    /// Gets current tunnel status for a server
    pub fn get_status(&self, server_id: &str, local_port: u16) -> PortalServerStatus {
        let statuses = self.statuses.read().unwrap();
        if let Some(status) = statuses.get(server_id) {
            status.clone()
        } else {
            PortalServerStatus {
                server_id: server_id.to_string(),
                status: PortalTunnelState::Stopped,
                local_port,
                public_address: None,
                relay_url: None,
                is_running: false,
                is_verified: false,
                last_verified_at: None,
                last_error: None,
            }
        }
    }

    /// Updates status and emits Tauri event
    fn update_status<F>(&self, server_id: &str, app: Option<&AppHandle>, updater: F) -> PortalServerStatus
    where
        F: FnOnce(&mut PortalServerStatus),
    {
        let mut statuses = self.statuses.write().unwrap();
        let status = statuses.entry(server_id.to_string()).or_insert_with(|| PortalServerStatus {
            server_id: server_id.to_string(),
            status: PortalTunnelState::Stopped,
            local_port: 25565,
            public_address: None,
            relay_url: None,
            is_running: false,
            is_verified: false,
            last_verified_at: None,
            last_error: None,
        });

        updater(status);
        let cloned = status.clone();

        if let Some(app_handle) = app {
            let _ = app_handle.emit("portal-status-changed", &cloned);
        }

        cloned
    }

    /// Appends sanitized log line
    fn append_log(&self, server_id: &str, line: String) {
        let sanitized = Self::sanitize_log_line(&line);
        let mut logs = self.logs.lock().unwrap();
        let buf = logs.entry(server_id.to_string()).or_insert_with(|| VecDeque::with_capacity(500));
        if buf.len() >= 500 {
            buf.pop_front();
        }
        buf.push_back(sanitized);
    }

    /// Gets in-memory logs for a server
    pub fn get_logs(&self, server_id: &str) -> Vec<String> {
        let logs = self.logs.lock().unwrap();
        if let Some(buf) = logs.get(server_id) {
            buf.iter().cloned().collect()
        } else {
            Vec::new()
        }
    }

    /// Starts a Portal raw TCP tunnel for a Minecraft server
    pub fn start_tunnel(&self, app: AppHandle, server: &ServerProfile) -> Result<PortalServerStatus> {
        let server_id = server.id.clone();
        let local_port = Self::resolve_server_port(server);

        // Verify portal binary availability
        let binary_path = match self.find_portal_binary() {
            Ok(p) => p,
            Err(e) => {
                let err_msg = format!("{}", e);
                log::error!("[Portal] Binary not found: {}", err_msg);
                return Ok(self.update_status(&server_id, Some(&app), |s| {
                    s.status = PortalTunnelState::Error {
                        stage: "binary_missing".to_string(),
                        message: err_msg.clone(),
                    };
                    s.is_running = false;
                    s.is_verified = false;
                    s.last_error = Some(err_msg);
                }));
            }
        };

        log::info!("[Portal] Using binary at {:?}", binary_path);

        // Prevent duplicate tunnels for the same server
        {
            let procs = self.processes.lock().unwrap();
            if procs.contains_key(&server_id) {
                log::warn!("[Portal] Tunnel is already running for server '{}'", server_id);
                return Ok(self.get_status(&server_id, local_port));
            }
        }

        // Validate local Minecraft server port
        if local_port == 0 {
            let err_msg = "Invalid Minecraft server port (0)".to_string();
            return Ok(self.update_status(&server_id, Some(&app), |s| {
                s.status = PortalTunnelState::Error {
                    stage: "invalid_port".to_string(),
                    message: err_msg.clone(),
                };
                s.is_running = false;
                s.last_error = Some(err_msg);
            }));
        }

        // Check if server is running locally
        if !Self::check_local_server_running(local_port) {
            log::warn!("[Portal] Local server on port {} is not listening yet. Standby mode.", local_port);
        }

        let identity_path = self.get_identity_path(&server_id);
        let portal_args = Self::build_portal_args(local_port, &identity_path);

        self.update_status(&server_id, Some(&app), |s| {
            s.local_port = local_port;
            s.status = PortalTunnelState::Starting;
            s.is_running = true;
            s.is_verified = false;
            s.public_address = None;
            s.relay_url = None;
            s.last_error = None;
        });

        // Spawn child process using argument array (never shell string)
        let mut cmd = Command::new(&binary_path);
        cmd.args(&portal_args);
        cmd.stdin(Stdio::null());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let err_msg = format!("Failed to spawn portal process: {}", e);
                log::error!("{}", err_msg);
                return Ok(self.update_status(&server_id, Some(&app), |s| {
                    s.status = PortalTunnelState::Error {
                        stage: "spawn".to_string(),
                        message: err_msg.clone(),
                    };
                    s.is_running = false;
                    s.last_error = Some(err_msg);
                }));
            }
        };

        crate::process_guard::guard_child_process(&child);

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        {
            let mut procs = self.processes.lock().unwrap();
            procs.insert(
                server_id.clone(),
                RunningTunnel {
                    child,
                    server_id: server_id.clone(),
                },
            );
        }

        self.update_status(&server_id, Some(&app), |s| {
            s.status = PortalTunnelState::Connecting;
        });

        // Readers for stdout & stderr
        let this_clone = self.clone();
        let s_id_clone = server_id.clone();
        let app_clone = app.clone();
        let l_port = local_port;

        let handle_line = move |line: String| {
            this_clone.append_log(&s_id_clone, line.clone());

            // Parse allocated endpoint
            if let Some((endpoint, relay)) = Self::parse_portal_endpoint(&line) {
                this_clone.verify_and_publish_tunnel(&s_id_clone, &app_clone, endpoint, relay, l_port);
            }
        };

        if let Some(out) = stdout {
            let hl = handle_line.clone();
            std::thread::spawn(move || {
                let reader = BufReader::new(out);
                for line in reader.lines().map_while(Result::ok) {
                    hl(line);
                }
            });
        }

        if let Some(err) = stderr {
            let hl = handle_line;
            std::thread::spawn(move || {
                let reader = BufReader::new(err);
                for line in reader.lines().map_while(Result::ok) {
                    hl(line);
                }
            });
        }

        // Monitor background process termination
        let this_mon = self.clone();
        let s_id_mon = server_id.clone();
        let app_mon = app.clone();

        std::thread::spawn(move || {
            loop {
                std::thread::sleep(Duration::from_millis(500));
                let mut procs = this_mon.processes.lock().unwrap();
                if let Some(tunnel) = procs.get_mut(&s_id_mon) {
                    match tunnel.child.try_wait() {
                        Ok(Some(status)) => {
                            let exit_code = status.code();
                            log::info!("[Portal] Process for server '{}' exited with code {:?}", s_id_mon, exit_code);
                            procs.remove(&s_id_mon);
                            drop(procs);

                            let msg = if !status.success() {
                                format!("Portal tunnel process exited (code: {:?})", exit_code)
                            } else {
                                "Portal tunnel closed".to_string()
                            };

                            this_mon.update_status(&s_id_mon, Some(&app_mon), |s| {
                                s.is_running = false;
                                s.is_verified = false;
                                s.public_address = None;
                                if status.success() {
                                    s.status = PortalTunnelState::Stopped;
                                } else {
                                    s.status = PortalTunnelState::Error {
                                        stage: "process_exit".to_string(),
                                        message: msg.clone(),
                                    };
                                    s.last_error = Some(msg);
                                }
                            });
                            break;
                        }
                        Ok(None) => {}
                        Err(e) => {
                            log::error!("[Portal] Error monitoring process: {}", e);
                            procs.remove(&s_id_mon);
                            break;
                        }
                    }
                } else {
                    break;
                }
            }
        });

        Ok(self.get_status(&server_id, local_port))
    }

    /// Publishes public address immediately and tests reachability in background
    pub fn verify_and_publish_tunnel(
        &self,
        server_id: &str,
        app: &AppHandle,
        public_address: String,
        relay_url: Option<String>,
        local_port: u16,
    ) {
        log::info!("[Portal] Allocated endpoint: '{}'. Publishing to UI...", public_address);

        // Immediate update to state so UI shows address with zero latency
        self.update_status(server_id, Some(app), |s| {
            s.public_address = Some(public_address.clone());
            s.relay_url = relay_url.clone();
            s.local_port = local_port;
            s.last_error = None;
            s.status = PortalTunnelState::Ready {
                public_address: public_address.clone(),
                relay_url: relay_url.clone(),
            };
        });

        // Dedicated OS thread for connectivity probe
        let this_clone = self.clone();
        let s_id = server_id.to_string();
        let app_handle = app.clone();
        let endpoint = public_address.clone();
        let relay = relay_url;

        std::thread::spawn(move || {
            let mut is_connected = false;
            for attempt in 1..=4 {
                if Self::verify_public_endpoint(&endpoint) {
                    is_connected = true;
                    log::info!("[Portal] Endpoint '{}' verified reachable on attempt {}", endpoint, attempt);
                    break;
                }
                std::thread::sleep(Duration::from_millis(1500));
            }

            let now = chrono::Utc::now().timestamp();

            this_clone.update_status(&s_id, Some(&app_handle), |s| {
                s.public_address = Some(endpoint.clone());
                s.local_port = local_port;
                s.is_verified = is_connected;
                s.relay_url = relay.clone();
                s.last_error = None;
                if is_connected {
                    s.last_verified_at = Some(now);
                    s.status = PortalTunnelState::Connected {
                        public_address: endpoint.clone(),
                        local_port,
                        relay_url: relay,
                        last_verified_at: now,
                    };
                } else {
                    s.status = PortalTunnelState::Ready {
                        public_address: endpoint.clone(),
                        relay_url: relay,
                    };
                }
            });
        });
    }

    /// Manually triggers a reachability probe for an active tunnel
    pub fn verify_connectivity_for_server(
        &self,
        app: AppHandle,
        server: &ServerProfile,
    ) -> Result<PortalServerStatus> {
        let server_id = &server.id;
        let local_port = server.port;

        if !Self::check_local_server_running(local_port) {
            let err_msg = format!("Local Minecraft server is not running on port {}", local_port);
            return Ok(self.update_status(server_id, Some(&app), |s| {
                s.is_verified = false;
                s.last_error = Some(err_msg.clone());
            }));
        }

        let (public_address, relay_url) = {
            let statuses = self.statuses.read().unwrap();
            let s = statuses.get(server_id);
            (s.and_then(|st| st.public_address.clone()), s.and_then(|st| st.relay_url.clone()))
        };

        if let Some(addr) = public_address {
            self.verify_and_publish_tunnel(server_id, &app, addr, relay_url, local_port);
            Ok(self.get_status(server_id, local_port))
        } else {
            Err(anyhow!("No Portal public address allocated yet."))
        }
    }

    /// Stops a running tunnel
    pub fn stop_tunnel(&self, server_id: &str, app: Option<&AppHandle>) -> PortalServerStatus {
        let mut procs = self.processes.lock().unwrap();
        if let Some(mut tunnel) = procs.remove(server_id) {
            log::info!("[Portal] Terminating tunnel process for server '{}'", server_id);
            let _ = tunnel.child.kill();
            let _ = tunnel.child.wait();
        }

        let local_port = self.statuses.read().unwrap().get(server_id).map(|s| s.local_port).unwrap_or(25565);

        self.update_status(server_id, app, |s| {
            s.status = PortalTunnelState::Stopped;
            s.is_running = false;
            s.is_verified = false;
            s.public_address = None;
            s.relay_url = None;
            s.last_error = None;
        });

        self.get_status(server_id, local_port)
    }

    /// Stops all running tunnels (e.g. on application exit)
    pub fn stop_all(&self) {
        let mut procs = self.processes.lock().unwrap();
        for (server_id, mut tunnel) in procs.drain() {
            log::info!("[Portal] Stopping tunnel on shutdown for server '{}'", server_id);
            let _ = tunnel.child.kill();
            let _ = tunnel.child.wait();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_portal_endpoint_json() {
        let line = r#"{"level":"info","address":"0x8ACD90ad6A7e58E6B40601f1FE10436476D1062B","tcp_addr":"minecraft-8acd90ad6a7e58e6b40601f1fe10436476d1062b.gosunuts.xyz:40003","time":"2026-10-20T11:58:20+05:30","message":"raw transport endpoints allocated"}"#;
        let result = PortalManager::parse_portal_endpoint(line);
        assert!(result.is_some());
        let (endpoint, _) = result.unwrap();
        assert_eq!(endpoint, "minecraft-8acd90ad6a7e58e6b40601f1fe10436476d1062b.gosunuts.xyz:40003");
    }

    #[test]
    fn test_parse_portal_endpoint_text() {
        let line = "10:33AM INF raw transport endpoints allocated address=0x23AF8E7A5bA2Ec7e725546084C58Ff7Efc46A0DD tcp_addr=minecraft-23af8e7a5ba2ec7e725546084c58ff7efc46a0dd.gosunuts.xyz:40003";
        let result = PortalManager::parse_portal_endpoint(line);
        assert!(result.is_some());
        let (endpoint, _) = result.unwrap();
        assert_eq!(endpoint, "minecraft-23af8e7a5ba2ec7e725546084c58ff7efc46a0dd.gosunuts.xyz:40003");
    }

    #[test]
    fn test_build_portal_args() {
        let id_path = PathBuf::from("C:\\test\\identity.json");
        let args = PortalManager::build_portal_args(25565, &id_path);
        assert_eq!(args[0], "expose");
        assert_eq!(args[1], "localhost:25565");
        assert_eq!(args[2], "--name");
        assert_eq!(args[3], "minecraft");
        assert_eq!(args[4], "--tcp");
        assert!(args.contains(&"--identity-path".to_string()));
        assert!(args.contains(&"--log-format".to_string()));
        assert!(args.contains(&"json".to_string()));
    }

    #[test]
    fn test_sanitize_log_line() {
        let line = "Authentication token: secret_key_1234567890abcdef for session";
        let sanitized = PortalManager::sanitize_log_line(line);
        assert!(!sanitized.contains("secret_key_1234567890abcdef"));
        assert!(sanitized.contains("[REDACTED]"));
    }
}
