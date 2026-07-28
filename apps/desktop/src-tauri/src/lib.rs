// ZeroWall Science — Tauri 2 entry. Hosts the React frontend and supervises the
// bundled OpenCode sidecar (isolated config/data + dedicated port; killed on exit).
mod artifact_file;
mod annotation_store;
mod browser;
mod debug_log;
mod examples;
mod gateway;
mod git_snapshot;
mod bio_check;
mod goal;
mod harness;
mod compute;
mod jupyter;
mod kernel;
mod large_file;
mod memory_store;
mod method_check;
mod modal;
mod model_probe;
mod opencode_config;
mod preview_server;
mod project;
mod provenance;
mod research_graph;
mod review_store;
mod runs;
mod runs_index;
mod runtime;
pub mod science_db;
mod science_mcp;
pub mod science_store;
mod secret_store;
mod sub2api;
mod tools;
#[cfg(target_os = "macos")]
mod macos;
mod updates;
mod uv;

use jupyter::JupyterState;
use kernel::KernelState;
use preview_server::PreviewState;
use provenance::ProvenanceState;
use runtime::RuntimeState;
use tauri::Manager;

/// Bring the main window back from the tray: show, unminimize, and focus it.
fn reveal_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single instance MUST be the first plugin. A second launch (or a reinstall
        // while the app is still running) focuses the existing window instead of
        // starting a second OpenCode on the same data dir (which deadlocks the DB).
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .manage(RuntimeState::default())
        .manage(KernelState::default())
        .manage(JupyterState::default())
        .manage(PreviewState::default())
        .manage(ProvenanceState::default())
        .manage(runs::RunState::default())
        .manage(gateway::GatewayState::default())
        .manage(sub2api::Sub2ApiState::default())
        .setup(|app| {
            // Watch the active workspace so changes made outside the app (an
            // external editor, a detached process) still enqueue a debounced
            // snapshot. Re-pointed on every workspace switch in set_workspace.
            if let Ok(ws) = runtime::workspace_dir(app.handle()) {
                science_db::open_science_db(&ws).map_err(std::io::Error::other)?;
                git_snapshot::watch_workspace(&ws);
            }
            // Bring the remote-access gateway back up if the user left it enabled.
            gateway::autostart(app.handle());

            // System tray. Closing the window hides to the tray (see the
            // CloseRequested handler); left-click or the "Show" item restores it,
            // and "Quit" is the explicit exit.
            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

                let show = MenuItem::with_id(app, "tray_show", "Show ZeroWall Science", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "tray_quit", "Quit", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show, &quit])?;

                let mut builder = TrayIconBuilder::new()
                    .tooltip("ZeroWall Science")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "tray_show" => reveal_main_window(app),
                        "tray_quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            reveal_main_window(tray.app_handle());
                        }
                    });
                if let Some(icon) = app.default_window_icon().cloned() {
                    builder = builder.icon(icon);
                }
                builder.build(app)?;
            }
            Ok(())
        })
        // The transparent + vibrancy window loses tao's traffic-light inset on
        // some machines (tao only re-applies it from drawRect). Re-pin on the
        // events that cover launch, resize, and the in-app theme switch.
        .on_window_event(|window, event| {
            // Closing the window hides it to the system tray instead of quitting;
            // the tray menu's "Quit" is the only way to actually exit. Keeps the
            // app (and the sidecar) alive so relaunch is instant.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
            #[cfg(target_os = "macos")]
            if matches!(
                event,
                tauri::WindowEvent::Focused(true)
                    | tauri::WindowEvent::Resized(_)
                    | tauri::WindowEvent::ThemeChanged(_)
            ) {
                macos::reapply_traffic_light_inset(window);
            }
        })
        .invoke_handler(tauri::generate_handler![
            runtime::start_runtime,
            runtime::runtime_password,
            gateway::gateway_status,
            gateway::set_gateway_config,
            gateway::regenerate_gateway_token,
            runtime::stop_runtime,
            runtime::workspace_path,
            runtime::workspace_base,
            runtime::set_workspace_base,
            runtime::open_workspace_base,
            runtime::set_workspace,
            runtime::mark_session,
            runtime::new_dated_workspace,
            goal::goal_state,
            goal::goal_update,
            project::create_project,
            project::import_project,
            project::list_projects,
            project::rename_project,
            project::set_project_pinned,
            project::delete_project,
            project::open_project_folder,
            runtime::pick_folder,
            runtime::import_opencode_login,
            model_probe::probe_endpoint_models,
            secret_store::set_provider_secret,
            secret_store::remove_provider_secret,
            secret_store::provider_secret_exists,
            secret_store::set_connector_secret,
            secret_store::remove_connector_secret,
            science_db::workspace_science_db,
            sub2api::sub2api_send_code,
            sub2api::sub2api_register,
            sub2api::sub2api_login,
            sub2api::sub2api_restore_session,
            sub2api::sub2api_account,
            sub2api::sub2api_logout,
            sub2api::sub2api_fetch_groups,
            sub2api::sub2api_provision_group,
            sub2api::sub2api_provision_groups,
            sub2api::sub2api_balance,
            sub2api::sub2api_checkout_info,
            sub2api::sub2api_create_order,
            sub2api::sub2api_order_status,
            sub2api::sub2api_list_orders,
            runtime::remove_config_entry,
            jupyter::jupyter_status,
            jupyter::setup_jupyter,
            jupyter::start_jupyter,
            runtime::get_approval_mode,
            runtime::set_approval_mode,
            runtime::get_proxy_setting,
            runtime::set_proxy_setting,
            runtime::get_mirror_setting,
            runtime::set_mirror_setting,
            browser::agent_browser_bin,
            browser::agent_browser_profiles,
            browser::detect_chrome,
            browser::setup_browser_chrome,
            kernel::kernel_execute,
            kernel::kernel_reset,
            kernel::python_interpreter,
            kernel::set_python_path,
            artifact_file::read_artifact,
            artifact_file::open_path,
            artifact_file::reveal_path,
            artifact_file::absolute_path,
            artifact_file::resolve_artifact,
            artifact_file::save_text_file,
            artifact_file::open_url,
            artifact_file::add_files_to_workspace,
            artifact_file::add_text_to_workspace,
            artifact_file::add_binary_to_workspace,
            artifact_file::add_paths_to_workspace,
            artifact_file::read_workspace_file_base64,
            artifact_file::read_local_file_base64,
            artifact_file::list_notebooks,
            artifact_file::list_dir,
            artifact_file::write_workspace_file,
            provenance::record_provenance,
            provenance::list_provenance,
            provenance::read_env_lockfile,
            provenance::provenance_summary,
            review_store::review_sync,
            review_store::review_resolve,
            review_store::review_reopen,
            method_check::method_check_evaluate,
            bio_check::bio_check_evaluate,
            memory_store::create_memory,
            memory_store::list_memories,
            memory_store::set_memory_disabled,
            memory_store::delete_memory,
            memory_store::record_compaction_archive,
            memory_store::list_compaction_archives,
            annotation_store::create_annotation_cmd,
            annotation_store::list_annotations_cmd,
            annotation_store::list_annotations_for_version_cmd,
            annotation_store::update_annotation_cmd,
            annotation_store::delete_annotation_cmd,
            research_graph::research_graph_cmd,
            runs::record_run,
            runs::list_runs,
            runs::read_run_log,
            runs_index::query_runs_cmd,
            science_mcp::science_mcp_python,
            science_mcp::setup_science_mcp,
            git_snapshot::commit_workspace_snapshot,
            compute::list_ssh_hosts,
            compute::compute_machines,
            compute::add_compute_machine,
            compute::remove_compute_machine,
            compute::compute_probe,
            compute::compute_jobs,
            compute::compute_cancel,
            modal::modal_status,
            preview_server::preview_url,
            large_file::probe_large_file,
            tools::detect_tools,
            updates::latest_release,
            debug_log::log_debug
        ])
        .build(tauri::generate_context!())
        .expect("error while building ZeroWall Science")
        .run(|app, event| {
            // Clean up on exit. macOS Cmd+Q / Quit terminates via RunEvent::Exit
            // (ExitRequested is not always delivered), so handle BOTH — otherwise
            // the OpenCode sidecar / kernel / Jupyter orphan on every quit. The
            // cleanup is idempotent, so running on both is safe.
            if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
                runtime::kill_child(&app.state::<RuntimeState>());
                kernel::kill_kernel(&app.state::<KernelState>());
                jupyter::kill_jupyter(&app.state::<JupyterState>());
                gateway::shutdown(app.state::<gateway::GatewayState>().inner());
            }
        });
}
