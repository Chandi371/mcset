use std::collections::{HashMap, VecDeque};
use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;

use anyhow::{Result, anyhow};
use regex::Regex;
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

use crate::models::{PortalServerStatus, PortalTunnelState, ServerProfile};

/// Pinned official Portal release version and metadata
pub const PINNED_PORTAL_VERSION: &str = "v2.6.4";

/// Official release asset metadata for supported operating systems and architectures
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PortalPlatformAsset {
    pub asset_name: &'static str,
    pub executable_name: &'static str,
    pub sha256_hash: &'static str,
}

/// Resolves target OS and architecture to official pinned release asset
pub fn resolve_platform_asset(os: &str, arch: &str) -> Result<PortalPlatformAsset> {
    match (os, arch) {
        ("windows", "x86_64") => Ok(PortalPlatformAsset {
            asset_name: "portal-windows-amd64.exe",
            executable_name: "portal.exe",
            sha256_hash: "925b07552420c31b1445aa8ea9ea246b0060abea1e367b2401de7c33a8dca988",
        }),
        ("windows", "aarch64") => Ok(PortalPlatformAsset {
            asset_name: "portal-windows-arm64.exe",
            executable_name: "portal.exe",
            sha256_hash: "b307beb6c286be245ec4373487f5dc29467fe423a54eccdc4cdc62d2c4188fb9",
        }),
        ("linux", "x86_64") => Ok(PortalPlatformAsset {
            asset_name: "portal-linux-amd64",
            executable_name: "portal",
            sha256_hash: "ff9a8315b9f503360a12a4fabc416510842171fa63077555f2601291d7fe8aee",
        }),
        ("linux", "aarch64") => Ok(PortalPlatformAsset {
            asset_name: "portal-linux-arm64",
            executable_name: "portal",
            sha256_hash: "6bf408e14a3e25ce93aa09c63cef6290e33d3f85d0ad5976b129a4622969e0ad",
        }),
        ("macos", "x86_64") => Ok(PortalPlatformAsset {
            asset_name: "portal-darwin-amd64",
            executable_name: "portal",
            sha256_hash: "5de971b628349afad022fa08620e8dc8384de18ea07927e264a8e03ca4064235",
        }),
        ("macos", "aarch64") => Ok(PortalPlatformAsset {
            asset_name: "portal-darwin-arm64",
            executable_name: "portal",
            sha256_hash: "76d245e307f1a080c97d9247cc724907d2c0b0052702a5097ae866a87c5292ad",
        }),
        _ => Err(anyhow!(
            "Unsupported platform or architecture for Portal Tunnel: {}-{}. Official binaries are provided for x86_64 and arm64 on Windows, Linux, and macOS.",
            os,
            arch
        )),
    }
}

/// Verifies whether a file matches the expected SHA-256 hash
pub fn verify_file_sha256(path: &Path, expected_hash: &str) -> Result<bool> {
    if !path.is_file() {
        return Ok(false);
    }
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    let computed = format!("{:x}", hasher.finalize());
    Ok(computed.eq_ignore_ascii_case(expected_hash))
}

/// Ensures executable permissions on Unix systems (chmod 0o755)
pub fn ensure_executable_permissions(path: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let metadata = fs::metadata(path)?;
        let mut perms = metadata.permissions();
        perms.set_mode(0o755);
        fs::set_permissions(path, perms)?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

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

    /// Locates or provisions the verified Portal binary for the current operating system and architecture
    pub fn find_portal_binary(&self) -> Result<PathBuf> {
        let asset = resolve_platform_asset(std::env::consts::OS, std::env::consts::ARCH)?;
        let bin_dir = self.data_dir.join("bin");
        let _ = fs::create_dir_all(&bin_dir);

        let target_bin = bin_dir.join(asset.executable_name);

        // 1. Check primary persistent location in mcset data bin directory
        if target_bin.is_file() {
            match verify_file_sha256(&target_bin, asset.sha256_hash) {
                Ok(true) => {
                    let _ = ensure_executable_permissions(&target_bin);
                    return Ok(target_bin);
                }
                Ok(false) => {
                    log::warn!(
                        "[Portal] Binary at {:?} failed checksum verification. Re-provisioning...",
                        target_bin
                    );
                    let _ = fs::remove_file(&target_bin);
                }
                Err(e) => {
                    log::warn!(
                        "[Portal] Failed to hash existing binary {:?}: {}",
                        target_bin,
                        e
                    );
                }
            }
        }

        // 2. Check candidate locations without personal machine-specific assumptions
        let mut candidates = Vec::new();

        // Check relative to current running executable
        if let Ok(curr) = std::env::current_exe() {
            if let Some(parent) = curr.parent() {
                candidates.push(parent.join(asset.executable_name));
                candidates.push(parent.join(asset.asset_name));
                candidates.push(parent.join("bin").join(asset.executable_name));
            }
        }

        // Check current working directory
        candidates.push(PathBuf::from(asset.executable_name));
        candidates.push(PathBuf::from(asset.asset_name));

        for candidate in candidates {
            if candidate.is_file() {
                if let Ok(true) = verify_file_sha256(&candidate, asset.sha256_hash) {
                    log::info!(
                        "[Portal] Found verified binary at {:?}. Copying to persistent bin directory...",
                        candidate
                    );
                    if candidate != target_bin {
                        if let Err(e) = fs::copy(&candidate, &target_bin) {
                            log::warn!("[Portal] Failed to copy binary to {:?}: {}", target_bin, e);
                            let _ = ensure_executable_permissions(&candidate);
                            return Ok(candidate);
                        }
                    }
                    let _ = ensure_executable_permissions(&target_bin);
                    return Ok(target_bin);
                } else {
                    log::debug!(
                        "[Portal] Candidate {:?} skipped (hash did not match expected {})",
                        candidate,
                        asset.sha256_hash
                    );
                }
            }
        }

        // 3. Fallback: Download official release binary directly and verify hash
        self.download_portal_binary(&asset, &target_bin)
    }

    /// Downloads and atomically installs the official pinned Portal binary with SHA-256 verification
    pub fn download_portal_binary(
        &self,
        asset: &PortalPlatformAsset,
        target_path: &Path,
    ) -> Result<PathBuf> {
        let download_url = format!(
            "https://github.com/gosuda/portal-tunnel/releases/download/{}/{}",
            PINNED_PORTAL_VERSION, asset.asset_name
        );
        log::info!(
            "[Portal] Downloading verified Portal binary from {}",
            download_url
        );

        let parent_dir = target_path
            .parent()
            .ok_or_else(|| anyhow!("Target path has no parent directory"))?;
        fs::create_dir_all(parent_dir)?;

        let temp_path = parent_dir.join(format!(
            "{}.{}.part",
            asset.executable_name,
            uuid::Uuid::new_v4()
        ));

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()?;

        let bytes = if let Ok(handle) = tokio::runtime::Handle::try_current() {
            tokio::task::block_in_place(|| {
                handle.block_on(async {
                    let resp = client.get(&download_url).send().await?;
                    if !resp.status().is_success() {
                        return Err(anyhow!(
                            "Failed to download portal-tunnel: HTTP {} from {}",
                            resp.status(),
                            download_url
                        ));
                    }
                    let b = resp.bytes().await?;
                    Ok::<_, anyhow::Error>(b)
                })
            })?
        } else {
            let rt = tokio::runtime::Runtime::new()?;
            rt.block_on(async {
                let resp = client.get(&download_url).send().await?;
                if !resp.status().is_success() {
                    return Err(anyhow!(
                        "Failed to download portal-tunnel: HTTP {} from {}",
                        resp.status(),
                        download_url
                    ));
                }
                let b = resp.bytes().await?;
                Ok::<_, anyhow::Error>(b)
            })?
        };

        // Compute SHA-256 of downloaded payload
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let computed_hash = format!("{:x}", hasher.finalize());

        if !computed_hash.eq_ignore_ascii_case(asset.sha256_hash) {
            return Err(anyhow!(
                "Security violation: portal-tunnel checksum verification failed! Expected {}, got {}. Binary rejected.",
                asset.sha256_hash,
                computed_hash
            ));
        }

        // Write verified binary to atomic temp file
        fs::write(&temp_path, &bytes)?;
        ensure_executable_permissions(&temp_path)?;

        // Atomic rename to final path
        if target_path.exists() {
            let _ = fs::remove_file(target_path);
        }
        fs::rename(&temp_path, target_path)?;

        log::info!(
            "[Portal] Successfully installed verified binary at {:?}",
            target_path
        );
        Ok(target_path.to_path_buf())
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
        let secret_regex =
            Regex::new(r#"(?i)(key|secret|password|token)[:=\s]+([a-zA-Z0-9_\-]{16,})"#).unwrap();
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
                    let relay_url = val
                        .get("relay_url")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    if Self::is_valid_endpoint(&cleaned) {
                        return Some((cleaned, relay_url));
                    }
                }
            }
        }

        // 2. Text fallback regex: tcp_addr=hostname:port or tcp://hostname:port
        let text_re =
            Regex::new(r#"(?:tcp_addr=|tcp://)([a-zA-Z0-9\.\-]+\.[a-z]{2,}:[0-9]{1,5})"#).unwrap();
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
        let clean_dir = server
            .server_dir
            .strip_prefix(r"\\?\")
            .unwrap_or(&server.server_dir);
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
        if server.port > 0 { server.port } else { 25565 }
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
    fn update_status<F>(
        &self,
        server_id: &str,
        app: Option<&AppHandle>,
        updater: F,
    ) -> PortalServerStatus
    where
        F: FnOnce(&mut PortalServerStatus),
    {
        let mut statuses = self.statuses.write().unwrap();
        let status = statuses
            .entry(server_id.to_string())
            .or_insert_with(|| PortalServerStatus {
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
        let buf = logs
            .entry(server_id.to_string())
            .or_insert_with(|| VecDeque::with_capacity(500));
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
    pub fn start_tunnel(
        &self,
        app: AppHandle,
        server: &ServerProfile,
    ) -> Result<PortalServerStatus> {
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
                log::warn!(
                    "[Portal] Tunnel is already running for server '{}'",
                    server_id
                );
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
            log::warn!(
                "[Portal] Local server on port {} is not listening yet. Standby mode.",
                local_port
            );
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
                this_clone.verify_and_publish_tunnel(
                    &s_id_clone,
                    &app_clone,
                    endpoint,
                    relay,
                    l_port,
                );
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
                            log::info!(
                                "[Portal] Process for server '{}' exited with code {:?}",
                                s_id_mon,
                                exit_code
                            );
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
        // Requirement 10: Ensure the tunnel process is actually still healthy and alive
        {
            let mut procs = self.processes.lock().unwrap();
            if let Some(tunnel) = procs.get_mut(server_id) {
                if let Ok(Some(exit_status)) = tunnel.child.try_wait() {
                    log::warn!(
                        "[Portal] Process exited prematurely with status {:?}; cannot publish ready status",
                        exit_status
                    );
                    return;
                }
            } else {
                log::warn!(
                    "[Portal] Tunnel process for server '{}' is not registered; cannot publish ready status",
                    server_id
                );
                return;
            }
        }

        log::info!(
            "[Portal] Allocated endpoint: '{}'. Publishing to UI...",
            public_address
        );

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
                    log::info!(
                        "[Portal] Endpoint '{}' verified reachable on attempt {}",
                        endpoint,
                        attempt
                    );
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
            let err_msg = format!(
                "Local Minecraft server is not running on port {}",
                local_port
            );
            return Ok(self.update_status(server_id, Some(&app), |s| {
                s.is_verified = false;
                s.last_error = Some(err_msg.clone());
            }));
        }

        let (public_address, relay_url) = {
            let statuses = self.statuses.read().unwrap();
            let s = statuses.get(server_id);
            (
                s.and_then(|st| st.public_address.clone()),
                s.and_then(|st| st.relay_url.clone()),
            )
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
            log::info!(
                "[Portal] Terminating tunnel process for server '{}'",
                server_id
            );
            let _ = tunnel.child.kill();
            let _ = tunnel.child.wait();
        }

        let local_port = self
            .statuses
            .read()
            .unwrap()
            .get(server_id)
            .map(|s| s.local_port)
            .unwrap_or(25565);

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

    /// Gets list of currently running tunnel server IDs
    pub fn get_running_tunnel_ids(&self) -> Vec<String> {
        let procs = self.processes.lock().unwrap();
        procs.keys().cloned().collect()
    }

    /// Stops all running tunnels (e.g. on application exit)
    pub fn stop_all(&self) {
        let mut procs = self.processes.lock().unwrap();
        for (server_id, mut tunnel) in procs.drain() {
            log::info!(
                "[Portal] Stopping tunnel on shutdown for server '{}'",
                server_id
            );
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
        assert_eq!(
            endpoint,
            "minecraft-8acd90ad6a7e58e6b40601f1fe10436476d1062b.gosunuts.xyz:40003"
        );
    }

    #[test]
    fn test_parse_portal_endpoint_text() {
        let line = "10:33AM INF raw transport endpoints allocated address=0x23AF8E7A5bA2Ec7e725546084C58Ff7Efc46A0DD tcp_addr=minecraft-23af8e7a5ba2ec7e725546084c58ff7efc46a0dd.gosunuts.xyz:40003";
        let result = PortalManager::parse_portal_endpoint(line);
        assert!(result.is_some());
        let (endpoint, _) = result.unwrap();
        assert_eq!(
            endpoint,
            "minecraft-23af8e7a5ba2ec7e725546084c58ff7efc46a0dd.gosunuts.xyz:40003"
        );
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

    #[test]
    fn test_resolve_platform_asset_all_supported_architectures() {
        // Windows x86_64
        let win64 = resolve_platform_asset("windows", "x86_64").expect("win64 must be supported");
        assert_eq!(win64.asset_name, "portal-windows-amd64.exe");
        assert_eq!(win64.executable_name, "portal.exe");
        assert_eq!(win64.sha256_hash.len(), 64);

        // Windows arm64
        let win_arm =
            resolve_platform_asset("windows", "aarch64").expect("win arm64 must be supported");
        assert_eq!(win_arm.asset_name, "portal-windows-arm64.exe");
        assert_eq!(win_arm.executable_name, "portal.exe");

        // Linux x86_64
        let lin64 = resolve_platform_asset("linux", "x86_64").expect("lin64 must be supported");
        assert_eq!(lin64.asset_name, "portal-linux-amd64");
        assert_eq!(lin64.executable_name, "portal");

        // Linux arm64
        let lin_arm =
            resolve_platform_asset("linux", "aarch64").expect("lin arm64 must be supported");
        assert_eq!(lin_arm.asset_name, "portal-linux-arm64");
        assert_eq!(lin_arm.executable_name, "portal");

        // macOS x86_64 & arm64
        let mac_intel =
            resolve_platform_asset("macos", "x86_64").expect("mac intel must be supported");
        assert_eq!(mac_intel.asset_name, "portal-darwin-amd64");
        assert_eq!(mac_intel.executable_name, "portal");

        let mac_apple = resolve_platform_asset("macos", "aarch64")
            .expect("mac apple silicon must be supported");
        assert_eq!(mac_apple.asset_name, "portal-darwin-arm64");
        assert_eq!(mac_apple.executable_name, "portal");

        // Unsupported combinations must fail with clear error
        assert!(resolve_platform_asset("windows", "x86").is_err());
        assert!(resolve_platform_asset("freebsd", "x86_64").is_err());
        assert!(resolve_platform_asset("solaris", "sparc").is_err());
    }

    #[test]
    fn test_verify_file_sha256_valid_and_tampered() {
        let temp_dir = std::env::temp_dir().join(format!("portal_test_{}", uuid::Uuid::new_v4()));
        let _ = fs::create_dir_all(&temp_dir);
        let test_file = temp_dir.join("test_file.bin");

        let sample_bytes = b"Hello, secure portal tunnel verification!";
        fs::write(&test_file, sample_bytes).expect("must write test file");

        // Compute expected hash of sample_bytes
        let mut hasher = Sha256::new();
        hasher.update(sample_bytes);
        let expected = format!("{:x}", hasher.finalize());

        // Valid hash verification
        assert!(verify_file_sha256(&test_file, &expected).unwrap());

        // Tampered / incorrect hash must return false
        assert!(
            !verify_file_sha256(
                &test_file,
                "0000000000000000000000000000000000000000000000000000000000000000"
            )
            .unwrap()
        );

        // Non-existent file must return false
        let fake_file = temp_dir.join("non_existent.bin");
        assert!(!verify_file_sha256(&fake_file, &expected).unwrap());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_is_valid_endpoint_rejects_web_ports_and_malformed() {
        // Valid Minecraft raw TCP game endpoints
        assert!(PortalManager::is_valid_endpoint(
            "minecraft-abc.gosunuts.xyz:40003"
        ));
        assert!(PortalManager::is_valid_endpoint("play.example.com:25565"));
        assert!(PortalManager::is_valid_endpoint("192.168.1.50:25565"));

        // HTTPS and HTTP ports must be rejected (never confuse raw TCP game forwarding with web port)
        assert!(!PortalManager::is_valid_endpoint(
            "minecraft-abc.gosunuts.xyz:443"
        ));
        assert!(!PortalManager::is_valid_endpoint(
            "minecraft-abc.gosunuts.xyz:80"
        ));

        // Port 0 and out of bounds
        assert!(!PortalManager::is_valid_endpoint(
            "minecraft-abc.gosunuts.xyz:0"
        ));
        assert!(!PortalManager::is_valid_endpoint(
            "minecraft-abc.gosunuts.xyz:70000"
        ));

        // Malformed endpoints
        assert!(!PortalManager::is_valid_endpoint("just-a-hostname"));
        assert!(!PortalManager::is_valid_endpoint(":25565"));
        assert!(!PortalManager::is_valid_endpoint("hostname:not-a-port"));
        assert!(!PortalManager::is_valid_endpoint(""));
    }
}
