pub mod ai_agent;
pub mod backup_manager;
pub mod commands;
pub mod config_manager;
pub mod database;
pub mod extension_manager;
pub mod java_manager;
pub mod mcp_tools;
pub mod models;
pub mod modpack_manager;
pub mod portal_manager;
pub mod process_guard;
pub mod security;
pub mod server_lifecycle;
pub mod software_manager;

use std::sync::Arc;
use tauri::Manager;
use commands::AppState;
use database::Database;
use mcp_tools::McpToolEngine;
use portal_manager::PortalManager;
use server_lifecycle::ServerLifecycleManager;
use ai_agent::AiAgent;
use software_manager::SoftwareProviderManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Panic hook to catch any unexpected Rust panics and write to crash.log
    std::panic::set_hook(Box::new(|info| {
        let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic payload".to_string()
        };
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_default();
        let log_msg = format!(
            "[{}] CRASH PANIC at {}: {}\n",
            chrono::Utc::now().to_rfc3339(),
            location,
            payload
        );
        eprintln!("{}", log_msg);
        if let Some(dir) = dirs::data_dir().map(|p| p.join("mcset")) {
            let _ = std::fs::create_dir_all(&dir);
            let _ = std::fs::write(dir.join("crash.log"), &log_msg);
        }
    }));

    let app = tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Determine data directory (per-user app data or local directory)
            let data_dir = dirs::data_dir()
                .map(|p| p.join("mcset"))
                .unwrap_or_else(|| std::env::current_dir().unwrap().join(".mcset_data"));
            std::fs::create_dir_all(&data_dir).expect("Failed to create app data directory");

            let db_path = data_dir.join("mcset.sqlite");
            let db = Database::new(db_path).expect("Failed to initialize SQLite database");
            let lifecycle = ServerLifecycleManager::new();

            let software_manager = Arc::new(SoftwareProviderManager::new(data_dir.join("cache")));
            let portal_manager = Arc::new(PortalManager::new(&data_dir));
            let modpack_manager = Arc::new(modpack_manager::ModpackManager::new(data_dir.clone()));
            let mcp_engine = Arc::new(McpToolEngine::new(
                db.clone(),
                lifecycle.clone(),
                software_manager.clone(),
                portal_manager.clone(),
                modpack_manager.clone(),
                app.handle().clone(),
            ));
            let ai_agent = Arc::new(AiAgent::new(mcp_engine.clone()));

            app.manage(AppState {
                db,
                lifecycle,
                mcp_engine,
                ai_agent,
                software_manager,
                portal_manager,
                modpack_manager,
                data_dir,
            });

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(state) = window.try_state::<AppState>() {
                    log::info!("Window close requested - stopping all servers and tunnels");
                    state.lifecycle.stop_all();
                    state.portal_manager.stop_all();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_servers,
            commands::get_server,
            commands::create_server,
            commands::update_server_profile,
            commands::delete_server,
            commands::start_server,
            commands::stop_server,
            commands::restart_server,
            commands::send_console_command,
            commands::get_server_status,
            commands::get_server_logs,
            commands::detect_java_runtimes,
            commands::download_java_runtime,
            commands::auto_fix_server_java,
            commands::get_server_config,
            commands::apply_server_config,
            commands::propose_server_config,
            commands::read_raw_config,
            commands::write_raw_config,
            commands::list_extensions,
            commands::toggle_extension,
            commands::remove_extension,
            commands::search_modrinth,
            commands::get_modrinth_versions,
            commands::install_modrinth_extension,
            commands::list_backups,
            commands::create_backup,
            commands::restore_backup,
            commands::delete_backup,
            commands::list_operations,
            commands::execute_mcp_tool,
            commands::get_mcp_tools,
            commands::get_ai_config,
            commands::save_ai_config,
            commands::chat_with_ai,
            commands::stop_ai,
            commands::get_minecraft_versions,
            commands::get_minecraft_required_java,
            commands::resolve_provider_build,
            commands::open_server_directory,
            commands::open_browser_url,
            commands::get_network_addresses,
            commands::start_portal_tunnel,
            commands::stop_portal_tunnel,
            commands::get_portal_status,
            commands::get_portal_logs,
            commands::verify_portal_connectivity,
            commands::approve_console_command,
            commands::reject_console_command,
            commands::list_pending_approvals,
            commands::search_modpacks,
            commands::get_modpack_versions,
            commands::install_modpack_server,
            commands::cancel_modpack_install,
            commands::pick_local_file,
            commands::install_local_extension,
            commands::get_server_player_data,
            commands::toggle_server_whitelist,
            commands::add_server_whitelist,
            commands::remove_server_whitelist,
            commands::add_server_op,
            commands::remove_server_op,
            commands::ban_server_player,
            commands::unban_server_player,
            commands::kick_server_player,
            commands::get_world_info,
            commands::reset_dimension,
            commands::import_world_archive,
            commands::list_server_dir,
            commands::read_text_file,
            commands::save_text_file,
            commands::delete_server_path,
            commands::create_server_folder,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        match event {
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                if let Some(state) = app_handle.try_state::<AppState>() {
                    log::info!("Application exiting - stopping all servers and tunnels");
                    state.lifecycle.stop_all();
                    state.portal_manager.stop_all();
                }
            }
            _ => {}
        }
    });
}
