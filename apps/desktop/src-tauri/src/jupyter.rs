// Optional Jupyter integration for the Jupyter MCP server: the bundled `uv`
// sidecar provisions an ISOLATED environment (own managed Python — nothing on
// the user's machine is touched) under app data, and the app manages a
// headless jupyter-lab process the MCP server connects to.
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;
use zerowall_acp::AcpMcpServer;

use crate::runtime::{free_port, workspace_dir};

// Pinned per datalayer/jupyter-mcp-server's documented requirements, plus the
// core scientific stack: this env is now the DEFAULT interpreter for the app's
// own notebook Run button (kernel::python_bin), so `import numpy/pandas` must
// work out of the box — an empty jupyter-only env would make the unified kernel
// useless for real work.
const PIP_SPEC: &[&str] = &[
    "jupyterlab==4.4.1",
    "jupyter-collaboration==4.0.2",
    // Pinned: an unpinned range silently pulled 1.1.2, whose `serve` defaults
    // START_NEW_RUNTIME=true and starts a kernel synchronously at launch,
    // blocking the stdio MCP handshake (see setup.ts, where we set it false).
    "jupyter-mcp-server==1.1.2",
    // Cap the MCP SDK below 2.0: jupyter-mcp-server 1.1.2 imports
    // `mcp.server.fastmcp`, a submodule mcp 2.0.0 removed. Left uncapped, a
    // fresh install resolves mcp 2.x and the Jupyter MCP server dies at launch
    // with `No module named 'mcp.server.fastmcp'`.
    "mcp<2",
    "ipykernel",
    "numpy",
    "pandas",
    "matplotlib",
];

#[derive(Default)]
pub struct JupyterState {
    child: Mutex<Option<CommandChild>>,
    running: Mutex<bool>,
    /// Serializes start / re-root so overlapping workspace switches can never
    /// leave two jupyter-lab processes fighting over the fixed port.
    lifecycle: Mutex<()>,
}

/// ACP receives the Jupyter MCP descriptor only while the app-managed server
/// is installed and running. The full status check is performed by the command
/// below; this helper deliberately returns None when no safe descriptor exists.
pub(crate) fn acp_mcp_server(app: &AppHandle) -> Option<AcpMcpServer> {
    let state = app.state::<JupyterState>();
    let status = status_of(app, &state);
    if !status.installed || !status.running {
        return None;
    }
    let meta = load_meta(app)?;
    let token = load_token(app)?;
    Some(AcpMcpServer {
        name: "jupyter".to_string(),
        command: status.mcp_command?,
        args: Vec::new(),
        env: vec![
            (
                "JUPYTER_URL".to_string(),
                format!("http://127.0.0.1:{}", meta.port),
            ),
            ("JUPYTER_TOKEN".to_string(), token),
            ("START_NEW_RUNTIME".to_string(), "false".to_string()),
            ("ALLOW_IMG_OUTPUT".to_string(), "true".to_string()),
        ],
    })
}

fn env_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("runtime")
        .join("jupyter-env"))
}

fn server_meta_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(env_dir(app)?.join("server.json"))
}

/// Where we record the managed jupyter-lab's PID, so a later run can kill an
/// orphan left by a crash/force-quit before rebinding the fixed port.
fn pid_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(env_dir(app)?.join("jupyter.pid"))
}

/// Kill an orphaned jupyter-lab from a previous app run (a crash or force quit
/// leaves one behind; two instances then fight over the fixed port). Best-effort
/// and precise: never touches unrelated processes.
fn kill_orphan_jupyter(app: &AppHandle) {
    // Unix: match the env's own jupyter-lab path — scoped, proven, no PID reuse risk.
    // SIGKILL, not SIGTERM: a wedged orphan survives TERM (observed in the field —
    // jupyter's graceful shutdown hangs on dead kernels) and these are our own
    // headless processes from a dead app run, so there is nothing to save.
    #[cfg(unix)]
    if let Ok(dir) = env_dir(app) {
        let pattern = format!("{}/bin/jupyter-lab", dir.to_string_lossy());
        let _ = std::process::Command::new("pkill").args(["-9", "-f", &pattern]).output();
        std::thread::sleep(std::time::Duration::from_millis(400));
    }
    // Windows: taskkill the recorded PID, filtered to python.exe so a recycled
    // PID belonging to some other process is spared.
    #[cfg(windows)]
    if let Ok(path) = pid_path(app) {
        if let Ok(pid) = std::fs::read_to_string(&path).map(|s| s.trim().to_string()) {
            if !pid.is_empty() && pid.chars().all(|c| c.is_ascii_digit()) {
                let _ = crate::runtime::quiet_command("taskkill")
                    .args([
                        "/FI",
                        &format!("PID eq {pid}"),
                        "/FI",
                        "IMAGENAME eq python.exe",
                        "/F",
                        "/T",
                    ])
                    .output();
                std::thread::sleep(std::time::Duration::from_millis(400));
            }
        }
    }
}

fn bin(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = env_dir(app)?;
    #[cfg(windows)]
    return Ok(dir.join("Scripts").join(format!("{name}.exe")));
    #[cfg(not(windows))]
    Ok(dir.join("bin").join(name))
}

/// The managed env's Python, if provisioned. Doubles as the local kernel's
/// DEFAULT interpreter (kernel::python_bin), so the app's Run button and the
/// agent's Jupyter MCP share one Python — same packages, same results.
pub(crate) fn env_python(app: &AppHandle) -> Option<PathBuf> {
    bin(app, "python").ok().filter(|p| p.exists())
}

/// The non-secret server port is persisted. The token lives only in the OS
/// keychain and is materialized inside Rust when launching Jupyter or MCP.
#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct ServerMeta {
    port: u16,
}

#[derive(serde::Deserialize)]
struct StoredServerMeta {
    port: u16,
    #[serde(default)]
    token: Option<String>,
}

fn load_meta(app: &AppHandle) -> Option<ServerMeta> {
    let path = server_meta_path(app).ok()?;
    let text = std::fs::read_to_string(&path).ok()?;
    let stored = serde_json::from_str::<StoredServerMeta>(&text).ok()?;
    let meta = ServerMeta { port: stored.port };
    if let Some(token) = stored.token.filter(|value| !value.trim().is_empty()) {
        if crate::secret_store::persist_connector_secret_for_app(
            app,
            "jupyter",
            "JUPYTER_TOKEN",
            &token,
        )
        .is_ok()
        {
            if let Ok(json) = serde_json::to_string(&meta) {
                let _ = std::fs::write(&path, json);
                crate::runtime::tighten_private(&path);
            }
        }
    }
    Some(meta)
}

fn load_token(app: &AppHandle) -> Option<String> {
    crate::secret_store::connector_secret_for_app(app, "jupyter", "JUPYTER_TOKEN")
        .ok()
        .flatten()
}

fn ensure_token(app: &AppHandle) -> Result<String, String> {
    if let Some(token) = load_token(app) {
        return Ok(token);
    }
    let token = random_token();
    crate::secret_store::persist_connector_secret_for_app(
        app,
        "jupyter",
        "JUPYTER_TOKEN",
        &token,
    )?;
    Ok(token)
}

// CSPRNG on every platform — the old Windows fallback (pid + nanos) was
// guessable, and this token is the only thing between localhost and the
// Jupyter server.
fn random_token() -> String {
    crate::runtime::random_hex(16)
}

#[derive(serde::Serialize)]
pub struct JupyterStatus {
    pub installed: bool,
    pub running: bool,
    pub url: Option<String>,
    /// Absolute jupyter-mcp-server path for the MCP config entry.
    pub mcp_command: Option<String>,
}

fn status_of(app: &AppHandle, state: &JupyterState) -> JupyterStatus {
    let installed = bin(app, "jupyter-lab").map(|p| p.exists()).unwrap_or(false);
    let running = *state.running.lock().unwrap();
    let meta = load_meta(app);
    JupyterStatus {
        installed,
        running,
        url: meta.as_ref().map(|m| format!("http://127.0.0.1:{}", m.port)),
        mcp_command: bin(app, "jupyter-mcp-server")
            .ok()
            .filter(|p| p.exists())
            .map(|p| p.to_string_lossy().to_string()),
    }
}

#[tauri::command]
pub fn jupyter_status(app: AppHandle, state: State<'_, JupyterState>) -> JupyterStatus {
    status_of(&app, &state)
}

/// Provision the isolated Jupyter environment with the bundled uv. First run
/// downloads a managed Python + JupyterLab (a few hundred MB into app data);
/// takes a few minutes. Streams progress as `setup-progress` events and fails
/// with a readable error when a download stalls (see uv::run_uv).
#[tauri::command]
pub async fn setup_jupyter(app: AppHandle) -> Result<(), String> {
    let dir = env_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // Same Windows lock-avoidance as setup_science_mcp (#10): `uv venv`
    // rewrites the env's interpreter even with --allow-existing, and a running
    // jupyter-lab holds python.exe — re-running Setup would fail. Only create
    // the venv when its interpreter is missing; pip install is incremental.
    if env_python(&app).is_none() {
        crate::uv::create_venv(&app, "jupyter", &dir).await?;
    }

    let py = bin(&app, "python")?;
    let mut args = vec![
        "pip".to_string(),
        "install".to_string(),
        "--python".to_string(),
        py.to_string_lossy().to_string(),
    ];
    args.extend(PIP_SPEC.iter().map(|s| s.to_string()));
    crate::uv::run_uv(&app, "jupyter", args, "uv pip install").await?;

    // Fix the port once; the token is keychain-backed and never written here.
    if load_meta(&app).is_none() {
        let meta = ServerMeta { port: free_port() };
        std::fs::write(
            server_meta_path(&app)?,
            serde_json::to_string(&meta).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
    }
    ensure_token(&app)?;
    Ok(())
}

/// Start the managed headless jupyter-lab (idempotent). Root dir = workspace,
/// so the agent and the app's Notebooks page see the same files. `async`: the
/// orphan cleanup alone (taskkill + settle delay) would freeze the UI thread.
#[tauri::command(async)]
pub fn start_jupyter(app: AppHandle, state: State<'_, JupyterState>) -> Result<JupyterStatus, String> {
    let _guard = state.lifecycle.lock().unwrap();
    if *state.running.lock().unwrap() {
        return Ok(status_of(&app, &state));
    }
    spawn_lab(&app, &state)
}

/// Spawn jupyter-lab rooted in the CURRENT active workspace. Caller holds the
/// lifecycle lock and has ensured no managed instance is running.
fn spawn_lab(app: &AppHandle, state: &JupyterState) -> Result<JupyterStatus, String> {
    let lab = bin(app, "jupyter-lab")?;
    if !lab.exists() {
        return Err("Jupyter is not set up yet".into());
    }
    let meta = load_meta(app).ok_or("Jupyter setup is incomplete (no server meta)")?;
    let token = ensure_token(app)?;
    let workspace = workspace_dir(app)?;

    kill_orphan_jupyter(app);

    let cmd = app
        .shell()
        .command(lab.to_string_lossy().to_string())
        .args([
            "--no-browser".to_string(),
            "--ip".to_string(),
            "127.0.0.1".to_string(),
            "--port".to_string(),
            meta.port.to_string(),
            format!("--IdentityProvider.token={token}"),
            format!("--ServerApp.root_dir={}", workspace.to_string_lossy()),
        ])
        .current_dir(workspace);
    let (mut rx, child) = cmd.spawn().map_err(|e| format!("failed to start jupyter: {e}"))?;
    tauri::async_runtime::spawn(async move { while rx.recv().await.is_some() {} });
    // Record the PID so a future run can kill this process if it is orphaned.
    if let Ok(path) = pid_path(app) {
        let _ = std::fs::write(path, child.pid().to_string());
    }
    *state.child.lock().unwrap() = Some(child);
    *state.running.lock().unwrap() = true;
    Ok(status_of(app, state))
}

fn encode_url_path_segment(value: &str) -> String {
    value
        .as_bytes()
        .iter()
        .map(|byte| {
            if byte.is_ascii_alphanumeric() || matches!(*byte, b'-' | b'_' | b'.' | b'~') {
                (*byte as char).to_string()
            } else {
                format!("%{byte:02X}")
            }
        })
        .collect()
}

fn jupyter_lab_url(base_url: &str, token: &str, notebook: Option<&str>) -> Result<String, String> {
    if !base_url.starts_with("http://127.0.0.1:") || token.is_empty() {
        return Err("invalid Jupyter session endpoint".into());
    }
    let rel = notebook.unwrap_or_default().trim().trim_start_matches('/');
    let mut tree = String::new();
    if !rel.is_empty() {
        let segments = rel.split('/').collect::<Vec<_>>();
        if segments.iter().any(|segment| segment.is_empty() || *segment == "..") {
            return Err("notebook path must remain inside the active workspace".into());
        }
        tree.push_str("/tree/");
        tree.push_str(
            &segments
                .into_iter()
                .map(encode_url_path_segment)
                .collect::<Vec<_>>()
                .join("/"),
        );
    }
    Ok(format!("{base_url}/lab{tree}?token={token}"))
}

/// Open JupyterLab without returning its token to the renderer.
#[tauri::command]
pub fn open_jupyter_lab(app: AppHandle, notebook: Option<String>) -> Result<bool, String> {
    let state = app.state::<JupyterState>();
    let _guard = state.lifecycle.lock().unwrap();
    if !bin(&app, "jupyter-lab")?.exists() {
        return Ok(false);
    }
    if !*state.running.lock().unwrap() {
        spawn_lab(&app, &state)?;
    }
    let meta = load_meta(&app).ok_or("Jupyter setup is incomplete")?;
    let token = ensure_token(&app)?;
    let url = jupyter_lab_url(
        &format!("http://127.0.0.1:{}", meta.port),
        &token,
        notebook.as_deref(),
    )?;
    opener::open(&url).map_err(|e| format!("open JupyterLab failed: {e}"))?;
    Ok(true)
}

/// Follow a workspace switch: a running jupyter-lab keeps the root_dir it was
/// born with, so it must be restarted rooted in the NEW active workspace —
/// otherwise the agent's jupyter MCP keeps writing notebooks into the old
/// folder, invisible to the Notebooks page and previews. Port and token are
/// fixed in server meta, so the MCP config entry stays valid across the
/// restart. Runs in the background: a session switch must not wait on it.
pub fn reroot_jupyter(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<JupyterState>();
        let _guard = state.lifecycle.lock().unwrap();
        if !*state.running.lock().unwrap() {
            return;
        }
        kill_jupyter(&state);
        if let Err(e) = spawn_lab(&app, &state) {
            eprintln!("jupyter re-root failed: {e}");
        }
    });
}

pub fn kill_jupyter(state: &JupyterState) {
    if let Some(child) = state.child.lock().unwrap().take() {
        let _ = child.kill();
    }
    *state.running.lock().unwrap() = false;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_status_does_not_serialize_jupyter_token() {
        let status = JupyterStatus {
            installed: true,
            running: true,
            url: Some("http://127.0.0.1:9000".into()),
            mcp_command: Some("jupyter-mcp-server".into()),
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(!json.contains("token"));
    }

    #[test]
    fn persisted_server_meta_contains_port_only_and_accepts_legacy_token_for_migration() {
        let json = serde_json::to_string(&ServerMeta { port: 9000 }).unwrap();
        assert_eq!(json, r#"{"port":9000}"#);
        let legacy: StoredServerMeta =
            serde_json::from_str(r#"{"port":9000,"token":"legacy-secret"}"#).unwrap();
        assert_eq!(legacy.token.as_deref(), Some("legacy-secret"));
    }

    #[test]
    fn jupyter_lab_url_encodes_relative_notebook_path_without_exposing_raw_secrets() {
        let url = jupyter_lab_url(
            "http://127.0.0.1:9000",
            "aabbccdd",
            Some("folder/my notebook.ipynb"),
        )
        .unwrap();
        assert_eq!(
            url,
            "http://127.0.0.1:9000/lab/tree/folder/my%20notebook.ipynb?token=aabbccdd"
        );
        assert!(jupyter_lab_url("http://127.0.0.1:9000", "aabbccdd", Some("../secret"))
            .is_err());
    }
}
