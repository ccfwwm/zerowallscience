// Manages the bundled OpenCode sidecar so it never interferes with any OpenCode
// the user already has: it runs the *bundled* binary, on a *dedicated free port*,
// with an *app-private* XDG config/data dir, and is killed on app exit.
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

use crate::opencode_config::merge_config;

#[derive(Default)]
struct RuntimeLifecycle {
    child: Option<CommandChild>,
    url: Option<String>,
    port: Option<u16>,
}

/// One lock owns every sidecar lifecycle field. Keeping child/url/port in
/// separate mutexes allowed two concurrent `start_runtime` calls to both see
/// "stopped", spawn on the same port, and overwrite each other's child handle.
#[derive(Default)]
pub struct RuntimeState {
    lifecycle: Mutex<RuntimeLifecycle>,
}

/// App-private runtime root, e.g. ~/Library/Application Support/com.zerowall.science/runtime
pub(crate) fn runtime_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("runtime"))
}

/// Resolve the app-data directory used by releases with the previous bundle id.
/// Tauri app-data paths end in the configured identifier on Windows, macOS, and
/// Linux, so the legacy installation is a sibling of the current directory.
fn legacy_app_data_dir(current: &Path) -> Option<PathBuf> {
    current
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .map(|parent| parent.join("com.ai4s.workbench"))
}

/// Copy a legacy app-data tree into the current tree without replacing anything
/// already created by ZeroWall. `create_new` makes the new installation win even
/// if two startup paths race. Symlinks and type conflicts are skipped: following
/// a legacy link could escape app-data, while an existing destination is always
/// authoritative.
fn copy_missing_tree(source: &Path, destination: &Path) -> Result<(), String> {
    if destination.exists() && !destination.is_dir() {
        return Ok(());
    }
    std::fs::create_dir_all(destination)
        .map_err(|e| format!("could not create {}: {e}", destination.display()))?;
    for entry in std::fs::read_dir(source)
        .map_err(|e| format!("could not read {}: {e}", source.display()))?
    {
        let entry = entry.map_err(|e| format!("could not read legacy app-data entry: {e}"))?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        let file_type = entry
            .file_type()
            .map_err(|e| format!("could not inspect {}: {e}", source_path.display()))?;
        if file_type.is_dir() {
            copy_missing_tree(&source_path, &destination_path)?;
        } else if file_type.is_file() && !destination_path.exists() {
            use std::io::Write;
            let mut input = std::fs::File::open(&source_path)
                .map_err(|e| format!("could not open {}: {e}", source_path.display()))?;
            let mut output = match std::fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&destination_path)
            {
                Ok(file) => file,
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(format!("could not create {}: {e}", destination_path.display())),
            };
            if let Err(e) = std::io::copy(&mut input, &mut output).and_then(|_| output.flush()) {
                drop(output);
                let _ = std::fs::remove_file(&destination_path);
                return Err(format!("could not copy {}: {e}", source_path.display()));
            }
            if let Ok(metadata) = std::fs::metadata(&source_path) {
                let _ = std::fs::set_permissions(&destination_path, metadata.permissions());
            }
        }
    }
    Ok(())
}

/// Import app-private state from the old bundle-id directory. The source is kept
/// for rollback, missing files are copied recursively, and current files always
/// win. The destination is app-data itself, never a tracked research workspace.
pub(crate) fn migrate_legacy_app_data(current: &Path) -> Result<(), String> {
    let Some(legacy) = legacy_app_data_dir(current) else {
        return Ok(());
    };
    if !legacy.is_dir() {
        return Ok(());
    }
    copy_missing_tree(&legacy, current)
}

/// The running sidecar's base URL (`http://127.0.0.1:<port>`), or None when the
/// runtime is not started yet. The gateway proxies agent calls here, adding the
/// per-run Basic-auth password (`server_password`) itself.
pub(crate) fn sidecar_url(state: &RuntimeState) -> Option<String> {
    state.lifecycle.lock().unwrap().url.clone()
}

/// Move the workspace metadata directory written by pre-ZeroWall releases.
/// The rename is same-volume and only runs when the new store does not exist,
/// so an interrupted or mixed-version workspace is never overwritten.
pub(crate) fn migrate_legacy_workspace_store(workspace: &Path) -> Result<(), String> {
    let current = workspace.join(".zerowall");
    let legacy = workspace.join(".openscience");
    if current.exists() || !legacy.is_dir() {
        return Ok(());
    }
    std::fs::rename(&legacy, &current)
        .map_err(|e| format!("failed to migrate workspace metadata: {e}"))
}

fn xdg_config_home(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_root(app)?.join("xdg-config"))
}

/// The sidecar's XDG_DATA_HOME — also where the bundled goal plugin keeps its
/// per-session state (`opencode-goal-plugin/goals.json`, read by `goal.rs`).
pub(crate) fn xdg_data_home(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_root(app)?.join("xdg-data"))
}

/// File recording the user's chosen active workspace folder (absolute path).
fn active_workspace_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_root(app)?.join("active-workspace.txt"))
}

/// File recording the user's chosen BASE folder — the parent every new dated
/// session workspace is created under (Settings → Workspace).
fn base_workspace_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_root(app)?.join("base-workspace.txt"))
}

/// The active workspace folder OpenCode / the kernel / previews / provenance all
/// operate in. Defaults to the base folder (`~/Documents/ZeroWallScience`) until the
/// user opens or creates another one; the choice persists across restarts.
pub fn workspace_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(f) = active_workspace_file(app) {
        if let Ok(s) = std::fs::read_to_string(&f) {
            let dir = PathBuf::from(s.trim());
            if dir.is_dir() {
                migrate_legacy_workspace_store(&dir)?;
                return Ok(dir);
            }
        }
    }
    base_workspace_dir(app)
}

/// The workspace root new dated session folders are created under. A folder
/// the user picked in Settings wins; the default is `~/Documents/ZeroWallScience`
/// (no space — the agent runs shell commands against this path, and unquoted
/// spaces break them), falling back to `$HOME/Documents`.
pub fn base_workspace_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(f) = base_workspace_file(app) {
        if let Ok(s) = std::fs::read_to_string(&f) {
            let dir = PathBuf::from(s.trim());
            if dir.is_dir() {
                return Ok(dir);
            }
        }
    }
    let docs = match app.path().document_dir() {
        Ok(d) => d,
        Err(_) => {
            let home = std::env::var("HOME")
                .or_else(|_| std::env::var("USERPROFILE"))
                .map_err(|_| "could not resolve a documents directory".to_string())?;
            PathBuf::from(home).join("Documents")
        }
    };
    let dir = docs.join("ZeroWallScience");

    // One-time migrations, newest legacy name first. A failed rename (e.g. cross-volume)
    // keeps the existing location rather than splitting the user's files.
    if !dir.exists() {
        for old in [
            docs.join("OpenScience"),
            docs.join("Open Science"),
            runtime_root(app)?.join("workspace"),
        ] {
            if old.is_dir() {
                if std::fs::rename(&old, &dir).is_ok() {
                    break;
                }
                return Ok(old);
            }
        }
    }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    migrate_legacy_workspace_store(&dir)?;
    Ok(dir)
}

/// Path OpenCode reads when XDG_CONFIG_HOME points at our private dir.
fn opencode_config_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(xdg_config_home(app)?.join("opencode").join("opencode.json"))
}

/// The config file to edit in place: the server may have rewritten the config
/// as opencode.jsonc — prefer whichever exists, fall back to opencode.json.
fn effective_config_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = xdg_config_home(app)?.join("opencode");
    Ok(["opencode.jsonc", "opencode.json"]
        .iter()
        .map(|n| dir.join(n))
        .find(|p| p.exists())
        .unwrap_or_else(|| dir.join("opencode.json")))
}

/// The user's existing OpenCode auth file (their login / free credits), if any.
/// Read-only: we copy it into our sandbox so the bundled runtime can use the same
/// login, but we never modify the user's file or sessions.
fn user_auth_source() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
        if !xdg.is_empty() {
            candidates.push(PathBuf::from(xdg).join("opencode").join("auth.json"));
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        candidates.push(PathBuf::from(&home).join(".local/share/opencode/auth.json"));
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        candidates.push(PathBuf::from(appdata).join("opencode").join("auth.json"));
    }
    candidates.into_iter().find(|p| p.exists())
}

/// Copy the user's OpenCode CLI login into the app-private data dir, EXPLICITLY
/// (from the Settings page) — never silently. Returns false when there is no
/// CLI login to import. Restarts the sidecar so it picks the credentials up.
#[tauri::command(async)]
pub fn import_opencode_login(app: AppHandle, state: State<'_, RuntimeState>) -> Result<bool, String> {
    let Some(src) = user_auth_source() else {
        return Ok(false);
    };
    let dst = runtime_root(&app)?.join("xdg-data").join("opencode").join("auth.json");
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&src, &dst).map_err(|e| format!("copy failed: {e}"))?;

    // Restart the running sidecar so /config/providers reflects the login.
    restart_sidecar_if_running(&app, &state)?;
    Ok(true)
}

/// Whether the bundled runtime's credential store (its auth.json) has an entry
/// for this provider. The sidecar writes the token there the moment a browser
/// login completes, so the UI can fall back on it when the pending OAuth
/// callback request is lost (loopback port collision, proxy) — issue #17.
#[tauri::command(async)]
pub fn provider_auth_exists(app: AppHandle, provider_id: String) -> Result<bool, String> {
    let path = runtime_root(&app)?
        .join("xdg-data")
        .join("opencode")
        .join("auth.json");
    let Ok(text) = std::fs::read_to_string(&path) else {
        return Ok(false); // no store yet — no logins
    };
    Ok(auth_has_provider(&text, &provider_id))
}

fn auth_has_provider(text: &str, provider_id: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(text)
        .ok()
        .is_some_and(|auth| auth.get(provider_id).is_some())
}

/// Deploy the bundled skill packs (Tauri resources) into the app-private
/// profile's global skills dir (`<xdg-config>/opencode/skills/`), which OpenCode
/// scans regardless of project detection: `skills/` is the external ai4s-skills
/// pack, `skills-office/` Anthropic's document skills (docx/pdf/pptx/xlsx),
/// `skills-core/` the first-party skills from `runtime/skills/core`. The
/// workspace's own `.opencode/skills/` stays reserved for skills the user
/// installs. Runs before every sidecar start so app upgrades refresh the packs.
fn deploy_bundled_skills(app: &AppHandle) {
    let dst = match xdg_config_home(app) {
        Ok(cfg) => cfg.join("opencode").join("skills"),
        Err(_) => return,
    };
    let mut bundled: std::collections::HashSet<std::ffi::OsString> = std::collections::HashSet::new();
    let mut all_ok = true;
    for resource in ["skills", "skills-office", "skills-core"] {
        let src = match app
            .path()
            .resolve(resource, tauri::path::BaseDirectory::Resource)
        {
            Ok(p) if p.is_dir() => p,
            _ => {
                all_ok = false; // dev run without `fetch-skills.sh` — nothing to deploy
                continue;
            }
        };
        match sync_skill_pack(&src, &dst) {
            Ok(names) => bundled.extend(names),
            Err(e) => {
                all_ok = false;
                eprintln!("failed to deploy bundled skills ({resource}): {e}");
            }
        }
    }
    // The global skills dir is exclusively app-managed (the user's own skills
    // live in the workspace's `.opencode/skills/`), so any skill dir not in the
    // freshly-bundled set is a stale leftover — e.g. one renamed across an app
    // upgrade (`hpc-slurm` → `remote-compute`) — and must be removed so the
    // obsolete duplicate can't shadow or confuse the agent. Prune ONLY when all
    // three packs deployed cleanly: a partial deploy would make `bundled`
    // incomplete and wrongly delete valid skills.
    if all_ok {
        prune_stale_skills(&dst, &bundled);
    }
}

/// Ship the bundled goal plugin (one self-contained JS file, see
/// scripts/dev/fetch-goal-plugin.sh) into the app-private OpenCode profile and
/// return its absolute path for the config's `plugin` array. OpenCode 1.17
/// cannot install npm plugin specs itself (silently ignored), so the file is
/// referenced by absolute path. None in dev runs without the fetch script.
fn deploy_goal_plugin(app: &AppHandle) -> Option<PathBuf> {
    let src = app
        .path()
        .resolve("goal-plugin/goal-plugin.server.js", tauri::path::BaseDirectory::Resource)
        .ok()
        .filter(|p| p.is_file())?;
    let dst = xdg_config_home(app).ok()?.join("opencode").join("goal-plugin.server.js");
    std::fs::create_dir_all(dst.parent()?).ok()?;
    // Refresh on every start so app upgrades replace the plugin in place.
    if let Err(e) = std::fs::copy(&src, &dst) {
        eprintln!("failed to deploy goal plugin: {e}");
        return None;
    }
    Some(dst)
}

/// Remove every SKILL.md-bearing directory in `dst` whose name is not in
/// `bundled` (the set just deployed). Non-skill directories are left untouched.
fn prune_stale_skills(dst: &Path, bundled: &std::collections::HashSet<std::ffi::OsString>) {
    let Ok(entries) = std::fs::read_dir(dst) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir()
            && path.join("SKILL.md").is_file()
            && !bundled.contains(&entry.file_name())
        {
            let _ = std::fs::remove_dir_all(&path);
        }
    }
}

/// Copy every skill directory under `src` into `dst`, replacing same-named
/// directories (so bundled updates win) and leaving everything else in `dst`
/// alone. Returns the names of the skill directories it deployed (for stale
/// pruning). Directories without a SKILL.md (placeholders) are skipped.
fn sync_skill_pack(src: &Path, dst: &Path) -> std::io::Result<Vec<std::ffi::OsString>> {
    std::fs::create_dir_all(dst)?;
    let mut deployed = Vec::new();
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() || !entry.path().join("SKILL.md").is_file() {
            continue;
        }
        let target = dst.join(entry.file_name());
        if target.exists() {
            std::fs::remove_dir_all(&target)?;
        }
        copy_dir(&entry.path(), &target)?;
        deployed.push(entry.file_name());
    }
    Ok(deployed)
}

fn copy_dir(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &to)?;
        } else {
            std::fs::copy(entry.path(), &to)?;
        }
    }
    Ok(())
}

/// PATH for the sidecar (and everything the agent runs through it). Apps
/// launched from Finder/Dock/a desktop entry get a minimal PATH, so the agent
/// would not find the user's Python/conda/Homebrew tools. Prepend the
/// well-known locations that actually exist — the platform lists differ
/// (macOS Homebrew vs. Linux /opt/conda & Linuxbrew), same as python_candidates.
#[cfg(unix)]
pub(crate) fn enriched_path() -> String {
    let base = std::env::var("PATH").unwrap_or_default();
    let home = std::env::var("HOME").unwrap_or_default();

    #[cfg(target_os = "macos")]
    let extras = [
        "/opt/homebrew/bin".to_string(),
        "/usr/local/bin".to_string(),
        format!("{home}/anaconda3/bin"),
        format!("{home}/miniconda3/bin"),
        "/opt/anaconda3/bin".to_string(),
        "/opt/miniconda3/bin".to_string(),
        format!("{home}/.pyenv/shims"),
        format!("{home}/.local/bin"),
    ];
    #[cfg(target_os = "linux")]
    let extras = [
        format!("{home}/anaconda3/bin"),
        format!("{home}/miniconda3/bin"),
        "/opt/conda/bin".to_string(),
        "/opt/anaconda3/bin".to_string(),
        "/opt/miniconda3/bin".to_string(),
        format!("{home}/.pyenv/shims"),
        "/home/linuxbrew/.linuxbrew/bin".to_string(),
        "/usr/local/bin".to_string(),
        format!("{home}/.local/bin"),
    ];
    #[cfg(all(unix, not(target_os = "macos"), not(target_os = "linux")))]
    let extras = [
        format!("{home}/.pyenv/shims"),
        "/usr/local/bin".to_string(),
        format!("{home}/.local/bin"),
    ];

    let mut parts: Vec<String> = extras
        .into_iter()
        .filter(|p| !base.split(':').any(|b| b == p) && std::path::Path::new(p).is_dir())
        .collect();
    if !base.is_empty() {
        parts.push(base);
    }
    parts.join(":")
}

/// Windows twin of the unix version above: GUI apps inherit a PATH without the
/// user's Python/conda, and Anaconda famously does NOT add itself to PATH.
/// Prepend the conda install roots that exist — including `Library\bin`, which
/// conda pythons need on PATH for their DLLs (numpy fails to import otherwise).
#[cfg(windows)]
pub(crate) fn enriched_path() -> String {
    let base = std::env::var("PATH").unwrap_or_default();
    let mut roots: Vec<String> = Vec::new();
    if let Ok(profile) = std::env::var("USERPROFILE") {
        roots.push(format!("{profile}\\anaconda3"));
        roots.push(format!("{profile}\\miniconda3"));
    }
    roots.push("C:\\ProgramData\\anaconda3".into());
    roots.push("C:\\ProgramData\\miniconda3".into());
    let mut extras: Vec<String> = Vec::new();
    for root in roots {
        for dir in [root.clone(), format!("{root}\\Scripts"), format!("{root}\\Library\\bin")] {
            extras.push(dir);
        }
    }
    let mut parts: Vec<String> = extras
        .into_iter()
        .filter(|p| {
            !base.split(';').any(|b| b.eq_ignore_ascii_case(p)) && Path::new(p).is_dir()
        })
        .collect();
    if !base.is_empty() {
        parts.push(base);
    }
    parts.join(";")
}

/// A `std::process::Command` that never pops a console window on Windows.
/// A GUI app spawning a console-subsystem child (python.exe, taskkill, git…)
/// otherwise flashes a black window per spawn — every direct spawn in this
/// crate must go through here. (Sidecars via tauri_plugin_shell already set
/// the flag internally.)
pub(crate) fn quiet_command(bin: impl AsRef<std::ffi::OsStr>) -> std::process::Command {
    #[allow(unused_mut)]
    let mut cmd = std::process::Command::new(bin);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Make a secret-holding path owner-only: 700 for directories, 600 for files
/// (unix). The runtime root carries provider/connector API keys in
/// `opencode.jsonc`/`auth.json`, and the sidecar rewrites those files with a
/// default umask while running — locking the DIRECTORY is what holds, since a
/// 700 dir is unreachable for other users whatever the file modes inside. On
/// Windows, %APPDATA% is per-user ACL'd already; nothing to do.
pub(crate) fn tighten_private(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(path) {
            let mode = if meta.is_dir() { 0o700 } else { 0o600 };
            let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode));
        }
    }
    #[cfg(not(unix))]
    let _ = path;
}

/// `bytes` bytes of OS randomness as lowercase hex. Panics only if the OS
/// CSPRNG is unavailable — a machine state where serving anything is unsafe.
pub(crate) fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    getrandom::fill(&mut buf).expect("OS random source unavailable");
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

/// Per-run password the sidecar requires on every HTTP request (OpenCode's
/// built-in Basic auth, `OPENCODE_SERVER_PASSWORD`). Generated fresh each app
/// launch and held only in memory — never written to disk — so a local
/// webpage that scans loopback ports can neither drive agent turns nor read
/// `/global/config` (which carries provider API keys). The webview gets it
/// via the `runtime_password` command; Tauri IPC is app-only.
pub(crate) fn server_password() -> &'static str {
    static PASSWORD: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    PASSWORD.get_or_init(|| random_hex(16))
}

/// Expose the per-run sidecar password to the frontend SDK client.
#[tauri::command]
pub fn runtime_password() -> String {
    server_password().to_string()
}

pub(crate) fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|l| l.local_addr().ok())
        .map(|a| a.port())
        .unwrap_or(43917)
}

/// Network-proxy setting for the sidecar: `system` (default) follows the OS,
/// `custom <url>` uses a fixed proxy, `none` forces direct connections.
/// Stored as one line in `proxy.txt` under the runtime root.
fn proxy_setting_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_root(app)?.join("proxy.txt"))
}

/// The persisted proxy setting as (mode, url). Unknown/missing → system.
fn read_proxy_setting(app: &AppHandle) -> (String, String) {
    let raw = proxy_setting_file(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .unwrap_or_default();
    let line = raw.lines().next().unwrap_or("").trim();
    match line.split_once(' ') {
        Some(("custom", url)) if !url.trim().is_empty() => ("custom".into(), url.trim().into()),
        _ if line == "none" => ("none".into(), String::new()),
        _ => ("system".into(), String::new()),
    }
}

/// Accept `http://`, `https://` or `socks5://` with a host:port.
fn validate_proxy_url(url: &str) -> Result<(), String> {
    let rest = ["http://", "https://", "socks5://"]
        .iter()
        .find_map(|s| url.strip_prefix(s))
        .ok_or("proxy URL must start with http://, https:// or socks5://")?;
    let hostport = rest.trim_end_matches('/');
    let (host, port) = hostport
        .rsplit_once(':')
        .ok_or("proxy URL needs a host:port")?;
    if host.is_empty() || port.parse::<u16>().is_err() {
        return Err("proxy URL needs a host:port".into());
    }
    Ok(())
}

/// Proxy env for the sidecar. A GUI app launched from Finder/Dock inherits no
/// shell environment, so a user whose traffic runs through a system proxy
/// (common where provider hosts are unreachable directly) gets a sidecar that
/// cannot reach them: its fetch honors HTTP(S)_PROXY but nothing sets it.
/// Resolved from the persisted setting: `system` mirrors the OS proxy (an
/// existing env always wins — a terminal launch already carries the user's own
/// values), `custom` pins the user's URL, `none` neutralizes even inherited
/// env. Verified live with xAI OAuth (#9): the proxied browser delivers the
/// code, then the sidecar's token exchange to auth.x.ai hangs without a proxy
/// and succeeds with one.
fn resolve_proxy_env(mode: &str, url: &str) -> Vec<(&'static str, String)> {
    // Loopback traffic (the sidecar's own API, provider OAuth callback
    // servers) must never route through a proxy.
    const NO_PROXY_LOOPBACK: &str = "localhost,127.0.0.1,::1";
    match mode {
        "none" => vec![
            ("HTTP_PROXY", String::new()),
            ("HTTPS_PROXY", String::new()),
            ("http_proxy", String::new()),
            ("https_proxy", String::new()),
            ("ALL_PROXY", String::new()),
            ("NO_PROXY", "*".to_string()),
        ],
        "custom" => vec![
            ("HTTP_PROXY", url.to_string()),
            ("HTTPS_PROXY", url.to_string()),
            ("NO_PROXY", NO_PROXY_LOOPBACK.to_string()),
        ],
        _ => {
            if ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"]
                .iter()
                .any(|k| std::env::var_os(k).is_some())
            {
                return Vec::new();
            }
            match system_proxy_url() {
                Some(sys) => vec![
                    ("HTTP_PROXY", sys.clone()),
                    ("HTTPS_PROXY", sys),
                    ("NO_PROXY", NO_PROXY_LOOPBACK.to_string()),
                ],
                None => Vec::new(),
            }
        }
    }
}

/// The proxy the sidecar would actually use right now, for display in
/// Settings. None ⇒ direct connections.
fn effective_proxy(mode: &str, url: &str) -> Option<String> {
    match mode {
        "none" => None,
        "custom" => Some(url.to_string()),
        _ => ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"]
            .iter()
            .find_map(|k| std::env::var(k).ok().filter(|v| !v.is_empty()))
            .or_else(system_proxy_url),
    }
}

/// PyPI-index and Python-download mirrors for the bundled uv, stored one per
/// line (`pypi <url>` / `python <url>`) in `mirrors.txt` under the runtime root.
/// Empty ⇒ uv's defaults (pypi.org / github.com). Only the uv provisioning
/// flows read these — no long-running sidecar to restart.
fn mirror_setting_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_root(app)?.join("mirrors.txt"))
}

/// The persisted mirrors as (pypi_index_url, python_install_mirror_url).
fn read_mirror_setting(app: &AppHandle) -> (String, String) {
    let raw = mirror_setting_file(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .unwrap_or_default();
    let (mut pypi, mut python) = (String::new(), String::new());
    for line in raw.lines() {
        match line.trim().split_once(' ') {
            Some(("pypi", v)) => pypi = v.trim().to_string(),
            Some(("python", v)) => python = v.trim().to_string(),
            _ => {}
        }
    }
    (pypi, python)
}

/// Accept an `http(s)://` URL with a non-empty host.
fn validate_mirror_url(url: &str) -> Result<(), String> {
    let rest = ["https://", "http://"]
        .iter()
        .find_map(|s| url.strip_prefix(s))
        .ok_or("mirror URL must start with http:// or https://")?;
    if rest.trim_matches('/').is_empty() {
        return Err("mirror URL needs a host".into());
    }
    Ok(())
}

/// Network env for the bundled uv sidecar (managed-Python download + pip
/// install). Mirrors the OpenCode sidecar's proxy so first-run provisioning
/// works behind the same proxy the agent uses, and adds the optional PyPI /
/// Python-download mirrors. uv reads HTTP(S)_PROXY, `UV_DEFAULT_INDEX` and
/// `UV_PYTHON_INSTALL_MIRROR` from its environment.
pub(crate) fn uv_network_env(app: &AppHandle) -> Vec<(&'static str, String)> {
    let (mode, url) = read_proxy_setting(app);
    let mut env = resolve_proxy_env(&mode, &url);
    let (pypi, python) = read_mirror_setting(app);
    if !pypi.is_empty() {
        env.push(("UV_DEFAULT_INDEX", pypi));
    }
    if !python.is_empty() {
        env.push(("UV_PYTHON_INSTALL_MIRROR", python));
    }
    env
}

/// Proxy env for a bundled sidecar OTHER than opencode (e.g. agent-browser's
/// Chrome download). Same resolution as the OpenCode sidecar so a first-run
/// browser install works behind the user's configured proxy, without the uv
/// mirror vars that only uv understands.
pub(crate) fn sidecar_proxy_env(app: &AppHandle) -> Vec<(&'static str, String)> {
    let (mode, url) = read_proxy_setting(app);
    resolve_proxy_env(&mode, &url)
}

/// The system-configured proxy as a URL, if one is enabled (macOS: scutil).
/// HTTP(S) proxies are preferred — an HTTPS proxy endpoint still speaks plain
/// HTTP CONNECT, hence the http:// scheme — with SOCKS as the fallback.
#[cfg(target_os = "macos")]
fn system_proxy_url() -> Option<String> {
    let out = quiet_command("scutil").arg("--proxy").output().ok()?;
    parse_scutil_proxy(&String::from_utf8_lossy(&out.stdout))
}

/// Parse `scutil --proxy` output (`  Key : value` lines) into a proxy URL.
fn parse_scutil_proxy(text: &str) -> Option<String> {
    let get = |key: &str| -> Option<String> {
        let prefix = format!("{key} : ");
        text.lines()
            .find_map(|l| l.trim().strip_prefix(prefix.as_str()).map(|v| v.trim().to_string()))
    };
    let enabled = |key: &str| get(key).as_deref() == Some("1");
    for (en, host, port, scheme) in [
        ("HTTPSEnable", "HTTPSProxy", "HTTPSPort", "http"),
        ("HTTPEnable", "HTTPProxy", "HTTPPort", "http"),
        ("SOCKSEnable", "SOCKSProxy", "SOCKSPort", "socks5"),
    ] {
        if enabled(en) {
            if let (Some(h), Some(p)) = (get(host), get(port)) {
                return Some(format!("{scheme}://{h}:{p}"));
            }
        }
    }
    None
}

#[cfg(not(target_os = "macos"))]
fn system_proxy_url() -> Option<String> {
    // Windows/Linux: terminal-launched apps inherit the user's proxy env
    // (covered by the passthrough above); no OS store is read here yet.
    None
}

fn spawn_sidecar(app: &AppHandle, port: u16) -> Result<CommandChild, String> {
    let root = runtime_root(app)?;
    let cfg = root.join("xdg-config");
    let data = root.join("xdg-data");
    let cache = root.join("xdg-cache");
    let state = root.join("xdg-state");
    // Run OpenCode inside the user-facing workspace, NOT the app's cwd (which is `/`
    // when launched from Finder) — otherwise it scans the whole filesystem root.
    let workspace = workspace_dir(app)?;
    for d in [&cfg, &data, &cache, &state] {
        std::fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }
    // Ship the bundled scientific skills into the app-private OpenCode profile.
    deploy_bundled_skills(app);
    // Safety default (AGENTS.md non-negotiable): on first run, seed the
    // "approve" permission mode so dangerous shell commands prompt for
    // approval. A mode the user chose (approve or full) is never overridden.
    let cfg_file = effective_config_file(app)?;
    let existing = std::fs::read_to_string(&cfg_file).unwrap_or_default();
    if let Some(seeded) = crate::opencode_config::seed_default_permission(&existing) {
        if let Some(dir) = cfg_file.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        std::fs::write(&cfg_file, seeded).map_err(|e| e.to_string())?;
    }
    // Goal mode (/goal): register the bundled plugin under its deployed path.
    // Forward slashes everywhere — Windows accepts them, and the config stays
    // portable for opencode's path-spec detection.
    if let Some(plugin_path) = deploy_goal_plugin(app) {
        let existing = std::fs::read_to_string(&cfg_file).unwrap_or_default();
        let path_str = plugin_path.to_string_lossy().replace('\\', "/");
        if let Some(updated) = crate::opencode_config::ensure_goal_plugin(&existing, &path_str) {
            std::fs::write(&cfg_file, updated).map_err(|e| e.to_string())?;
        }
    }
    // Secrets live under the runtime root (provider/connector keys in
    // opencode.jsonc, OpenCode's auth.json) — owner-only on every start, so
    // existing installs are repaired and whatever the sidecar later rewrites
    // inside stays unreachable to other users regardless of its umask.
    tighten_private(&root);
    tighten_private(&cfg_file);
    let home = std::env::var("HOME").unwrap_or_default();
    let port_str = port.to_string();

    let cmd = app
        .shell()
        .sidecar("opencode")
        .map_err(|e| format!("sidecar not found: {e}"))?
        .args(["serve", "--hostname", "127.0.0.1", "--port", port_str.as_str()])
        // Require auth on every request (P0-7): without a password the server
        // trusts ANY localhost-origin page (verified in the 1.17.13 source —
        // its CORS allowlist admits http://localhost:*/127.0.0.1:* wholesale,
        // and `--cors "*"` was only ever an exact-match literal, not a
        // wildcard). The webview authenticates via the SDK; nothing else may.
        .env("OPENCODE_SERVER_PASSWORD", server_password())
        // App-private dirs: OpenCode never touches the user's ~/.config/opencode.
        .env("XDG_CONFIG_HOME", cfg.to_string_lossy().to_string())
        .env("XDG_DATA_HOME", data.to_string_lossy().to_string())
        .env("XDG_CACHE_HOME", cache.to_string_lossy().to_string())
        .env("XDG_STATE_HOME", state.to_string_lossy().to_string())
        .env("HOME", home)
        // Lets bundled skill helpers (e.g. remote-compute's record_run.py) stamp
        // the recording app version into provenance — they run outside the app
        // and can't otherwise know it.
        .env("ZEROWALL_APP_VERSION", app.package_info().version.to_string())
        .current_dir(workspace);
    // GUI-launched apps get a minimal PATH; give the agent the user's real tools.
    let mut cmd = cmd.env("PATH", enriched_path());
    // Apply the network-proxy setting so provider logins and API calls work
    // where direct connections are blocked (see resolve_proxy_env).
    let (proxy_mode, proxy_url) = read_proxy_setting(app);
    for (k, v) in resolve_proxy_env(&proxy_mode, &proxy_url) {
        cmd = cmd.env(k, v);
    }

    let (mut rx, child) = cmd.spawn().map_err(|e| format!("failed to spawn opencode: {e}"))?;
    // Drain events so the child's stdout/stderr buffer never blocks it, AND record
    // the failure signals we used to discard. When the ad-hoc-signed sidecar dies
    // during bootstrap (TCC denial, config-merge abort, panic) the only symptom was
    // a generic "Could not open OpenCode event stream" in the UI with no cause. Now
    // stderr, spawn errors, and the exit code land in debug.log next to the
    // frontend's connection attempts. Stdout is left to OpenCode's own log file
    // (xdg-data/opencode/log/opencode.log) so request spam never bloats debug.log.
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stderr(bytes) => {
                    for line in String::from_utf8_lossy(&bytes).split(['\n', '\r']) {
                        let line = line.trim();
                        if !line.is_empty() {
                            crate::debug_log::append(&app, &format!("[opencode] {line}"));
                        }
                    }
                }
                CommandEvent::Error(e) => {
                    crate::debug_log::append(&app, &format!("[opencode] error: {e}"));
                }
                CommandEvent::Terminated(status) => {
                    crate::debug_log::append(
                        &app,
                        &format!("[opencode] terminated: code={:?} signal={:?}", status.code, status.signal),
                    );
                }
                _ => {}
            }
        }
    });
    Ok(child)
}

/// Kill and respawn a running sidecar on its stable port. The lifecycle lock
/// covers the complete state transition, and URL is cleared before spawning so
/// a failed restart can never leave a stale "running" marker behind.
fn restart_sidecar_if_running(
    app: &AppHandle,
    state: &RuntimeState,
) -> Result<Option<String>, String> {
    let mut lifecycle = state.lifecycle.lock().unwrap();
    let Some(child) = lifecycle.child.take() else {
        lifecycle.url = None;
        return Ok(None);
    };
    lifecycle.url = None;
    let _ = child.kill();

    let port = *lifecycle.port.get_or_insert_with(free_port);
    let child = spawn_sidecar(app, port)?;
    let url = format!("http://127.0.0.1:{port}");
    lifecycle.child = Some(child);
    lifecycle.url = Some(url.clone());
    Ok(Some(url))
}

/// Start the bundled OpenCode (idempotent). Returns its base URL. `async`:
/// skill-pack deployment + process spawn at startup must not block the UI
/// thread while the first window paints.
#[tauri::command(async)]
pub fn start_runtime(app: AppHandle, state: State<'_, RuntimeState>) -> Result<String, String> {
    let mut lifecycle = state.lifecycle.lock().unwrap();
    if let (Some(_), Some(url)) = (&lifecycle.child, &lifecycle.url) {
        return Ok(url.clone());
    }
    // Repair any impossible partial state left by an older build or a failed
    // transition before attempting a fresh start.
    if let Some(child) = lifecycle.child.take() {
        let _ = child.kill();
    }
    lifecycle.url = None;

    // Reuse a stable port across restarts so the frontend URL doesn't change.
    let port = *lifecycle.port.get_or_insert_with(free_port);
    let child = spawn_sidecar(&app, port)?;
    let url = format!("http://127.0.0.1:{port}");
    lifecycle.child = Some(child);
    lifecycle.url = Some(url.clone());
    Ok(url)
}

/// The workspace directory the sidecar runs in — the frontend passes it to the
/// SDK so skill discovery is scoped to the right OpenCode instance.
#[tauri::command]
pub fn workspace_path(app: AppHandle) -> Result<String, String> {
    Ok(workspace_dir(&app)?.to_string_lossy().to_string())
}

/// The base folder new dated workspaces are created under (`~/Documents/ZeroWallScience`).
#[tauri::command]
pub fn workspace_base(app: AppHandle) -> Result<String, String> {
    Ok(base_workspace_dir(&app)?.to_string_lossy().to_string())
}

/// Choose the base folder (Settings → Workspace → Change). Creates it if
/// needed and persists the choice; every NEW session's dated folder is created
/// under it. Existing sessions keep their folders.
#[tauri::command]
pub fn set_workspace_base(app: AppHandle, path: String) -> Result<String, String> {
    let dir = PathBuf::from(&path);
    if !dir.is_absolute() {
        return Err("workspace base must be absolute".into());
    }
    std::fs::create_dir_all(&dir).map_err(|e| format!("could not create folder: {e}"))?;
    let canon = dir.canonicalize().map_err(|e| e.to_string())?;
    std::fs::write(base_workspace_file(&app)?, canon.to_string_lossy().as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(canon.to_string_lossy().to_string())
}

/// Reveal the base workspace folder in the OS file manager. (The sandboxed
/// `open_path` resolves inside the ACTIVE workspace only, which may be a dated
/// subfolder — the base needs its own door.)
#[tauri::command]
pub fn open_workspace_base(app: AppHandle) -> Result<(), String> {
    crate::artifact_file::os_open(&base_workspace_dir(&app)?)
}

/// Switch the active workspace folder: create it if needed and persist the
/// choice. The kernel / Files / provenance read the folder via `workspace_dir`;
/// the agent runtime is scoped per request — the frontend reconnects its event
/// stream with `?directory=` and creates sessions with it (a bare `/event`
/// stream would not see other folders' instances, so the scoped stream is
/// required). `path` must be absolute.
#[tauri::command(async)]
pub fn set_workspace(
    app: AppHandle,
    _state: State<'_, RuntimeState>,
    path: String,
) -> Result<String, String> {
    let dir = PathBuf::from(&path);
    if !dir.is_absolute() {
        return Err("workspace path must be absolute".into());
    }
    std::fs::create_dir_all(&dir).map_err(|e| format!("could not create folder: {e}"))?;
    let canon = dir.canonicalize().map_err(|e| e.to_string())?;
    std::fs::write(active_workspace_file(&app)?, canon.to_string_lossy().as_bytes())
        .map_err(|e| e.to_string())?;

    // Follow the active folder with the snapshot watcher so out-of-app edits
    // (external editor, detached process) in the new workspace are captured too.
    crate::git_snapshot::watch_workspace(&canon);

    // No sidecar restart: OpenCode serves every folder from one process via
    // per-directory instances, and the frontend reconnects its event stream
    // with `?directory=<new folder>`. Restarting here used to cost 3-6 s per
    // history-session switch (process boot + reconnect polling).
    // Jupyter-lab, however, pins its root_dir at spawn time — re-root it (in
    // the background) so agent-created notebooks land in the new folder.
    crate::jupyter::reroot_jupyter(&app);
    // Refresh this session's local copy of the remote-machine list from the
    // canonical base file, so a machine configured in Settings is visible to
    // every session's agent without reaching outside the workspace.
    crate::compute::materialize_active(&app);
    Ok(canon.to_string_lossy().to_string())
}

/// Record which session owns the active workspace, so bundled skill helpers
/// (record_run.py) can stamp remote runs with their `sessionId` — the app knows
/// the id but the off-app helper only sees the workspace. Written as
/// `<workspace>/.zerowall/session.txt`; best-effort, empty ids are ignored.
#[tauri::command]
pub fn mark_session(app: AppHandle, session_id: String) -> Result<(), String> {
    let id = session_id.trim();
    if id.is_empty() {
        return Ok(());
    }
    let dir = workspace_dir(&app)?.join(".zerowall");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("session.txt");
    // Write-then-rename so a concurrent read never sees a half-written id.
    let tmp = path.with_extension("txt.tmp");
    std::fs::write(&tmp, id).map_err(|e| e.to_string())?;
    if std::fs::rename(&tmp, &path).is_err() {
        let _ = std::fs::write(&path, id);
        let _ = std::fs::remove_file(&tmp);
    }
    Ok(())
}

/// Create a new dated folder `<base>/<name>` and switch to it. `name` is a
/// single path segment (the frontend supplies a timestamp); rejects separators.
#[tauri::command(async)]
pub fn new_dated_workspace(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    name: String,
) -> Result<String, String> {
    if name.is_empty() || name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("invalid folder name".into());
    }
    let dir = base_workspace_dir(&app)?.join(&name);
    // `set_workspace` moves `app`; keep a handle to seed the harness afterwards.
    let seed_app = app.clone();
    let canon = set_workspace(app, state, dir.to_string_lossy().to_string())?;
    // Seed the agent harness into the fresh folder so it starts with its
    // operating rules, not an empty directory. Only NEW dated folders get seeded
    // (never `set_workspace` alone — switching to an existing session must not
    // re-plant the scaffold).
    crate::harness::seed_harness(&seed_app, std::path::Path::new(&canon));
    crate::git_snapshot::commit_best_effort(std::path::Path::new(&canon), "Initialize workspace");
    Ok(canon)
}

/// Native "choose a folder" dialog; returns the absolute path, or None on cancel.
#[tauri::command]
pub async fn pick_folder(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(picked) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

/// Kill the bundled OpenCode if running.
#[tauri::command]
pub fn stop_runtime(state: State<'_, RuntimeState>) {
    let mut lifecycle = state.lifecycle.lock().unwrap();
    if let Some(child) = lifecycle.child.take() {
        let _ = child.kill();
    }
    lifecycle.url = None;
}

pub fn kill_child(state: &RuntimeState) {
    let mut lifecycle = state.lifecycle.lock().unwrap();
    if let Some(child) = lifecycle.child.take() {
        let _ = child.kill();
    }
    lifecycle.url = None;
}

#[cfg(test)]
mod tests {
    use super::{
        auth_has_provider, legacy_app_data_dir, migrate_legacy_app_data, parse_scutil_proxy,
        prune_stale_skills, random_hex, remove_key_from_config, resolve_proxy_env,
        sync_skill_pack, validate_proxy_url,
    };
    use std::fs;

    #[test]
    fn legacy_app_data_path_is_the_previous_bundle_id_sibling() {
        let current = std::path::Path::new("app-data-root").join("com.zerowall.science");
        let legacy_id = ["com", "ai4s", "workbench"].join(".");
        assert_eq!(
            legacy_app_data_dir(&current),
            Some(std::path::Path::new("app-data-root").join(legacy_id))
        );
        assert_eq!(legacy_app_data_dir(std::path::Path::new("com.zerowall.science")), None);
    }

    #[test]
    fn legacy_app_data_migration_preserves_runtime_and_workspace_selection() {
        let root = std::env::temp_dir().join(format!("zerowall-app-data-legacy-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let current = root.join("com.zerowall.science");
        let legacy = root.join(["com", "ai4s", "workbench"].join("."));
        fs::create_dir_all(legacy.join("runtime/xdg-config/opencode")).unwrap();
        fs::create_dir_all(legacy.join("runtime/xdg-data/opencode")).unwrap();
        fs::write(legacy.join("runtime/active-workspace.txt"), "C:/research/active").unwrap();
        fs::write(legacy.join("runtime/base-workspace.txt"), "C:/research/base").unwrap();
        fs::write(legacy.join("runtime/xdg-config/opencode/opencode.jsonc"), "provider-state").unwrap();
        fs::write(legacy.join("runtime/xdg-data/opencode/auth.json"), "private-runtime-state").unwrap();

        migrate_legacy_app_data(&current).unwrap();

        assert_eq!(fs::read_to_string(current.join("runtime/active-workspace.txt")).unwrap(), "C:/research/active");
        assert_eq!(fs::read_to_string(current.join("runtime/base-workspace.txt")).unwrap(), "C:/research/base");
        assert_eq!(fs::read_to_string(current.join("runtime/xdg-config/opencode/opencode.jsonc")).unwrap(), "provider-state");
        assert_eq!(fs::read_to_string(current.join("runtime/xdg-data/opencode/auth.json")).unwrap(), "private-runtime-state");
        assert!(legacy.is_dir(), "the compatibility copy must preserve the legacy source");

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn legacy_app_data_migration_is_non_overwriting_and_idempotent() {
        let root = std::env::temp_dir().join(format!("zerowall-app-data-mixed-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let current = root.join("com.zerowall.science");
        let legacy = root.join(["com", "ai4s", "workbench"].join("."));
        fs::create_dir_all(legacy.join("runtime/xdg-config/opencode")).unwrap();
        fs::create_dir_all(current.join("runtime/xdg-config/opencode")).unwrap();
        fs::write(legacy.join("runtime/active-workspace.txt"), "legacy-active").unwrap();
        fs::write(legacy.join("runtime/base-workspace.txt"), "legacy-base").unwrap();
        fs::write(legacy.join("runtime/xdg-config/opencode/opencode.jsonc"), "legacy-provider").unwrap();
        fs::write(current.join("runtime/active-workspace.txt"), "current-active").unwrap();
        fs::write(current.join("runtime/xdg-config/opencode/opencode.jsonc"), "current-provider").unwrap();

        migrate_legacy_app_data(&current).unwrap();
        migrate_legacy_app_data(&current).unwrap();

        assert_eq!(fs::read_to_string(current.join("runtime/active-workspace.txt")).unwrap(), "current-active");
        assert_eq!(fs::read_to_string(current.join("runtime/xdg-config/opencode/opencode.jsonc")).unwrap(), "current-provider");
        assert_eq!(fs::read_to_string(current.join("runtime/base-workspace.txt")).unwrap(), "legacy-base");

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn auth_store_provider_lookup() {
        let auth = r#"{ "openai": { "type": "oauth", "refresh": "r", "access": "a" } }"#;
        assert!(auth_has_provider(auth, "openai"));
        assert!(!auth_has_provider(auth, "anthropic"));
        assert!(!auth_has_provider("", "openai")); // empty/corrupt store
        assert!(!auth_has_provider("not json", "openai"));
    }

    #[test]
    fn proxy_url_validation() {
        assert!(validate_proxy_url("http://127.0.0.1:7890").is_ok());
        assert!(validate_proxy_url("socks5://10.0.0.2:1080").is_ok());
        assert!(validate_proxy_url("http://[::1]:8080").is_ok());
        assert!(validate_proxy_url("127.0.0.1:7890").is_err()); // no scheme
        assert!(validate_proxy_url("http://host").is_err()); // no port
        assert!(validate_proxy_url("http://:7890").is_err()); // no host
        assert!(validate_proxy_url("ftp://h:1").is_err()); // wrong scheme
    }

    #[test]
    fn proxy_env_modes() {
        let none = resolve_proxy_env("none", "");
        assert!(none.iter().any(|(k, v)| *k == "NO_PROXY" && v == "*"));
        assert!(none.iter().any(|(k, v)| *k == "HTTPS_PROXY" && v.is_empty()));

        let custom = resolve_proxy_env("custom", "http://127.0.0.1:7890");
        assert!(custom.iter().any(|(k, v)| *k == "HTTPS_PROXY" && v == "http://127.0.0.1:7890"));
        assert!(custom.iter().any(|(k, v)| *k == "NO_PROXY" && v.contains("127.0.0.1")));
    }

    #[test]
    fn scutil_proxy_parses_and_prefers_https() {
        // Real `scutil --proxy` shape (indented `Key : value` lines).
        let all = "<dictionary> {\n  HTTPEnable : 1\n  HTTPPort : 1087\n  HTTPProxy : 127.0.0.1\n  HTTPSEnable : 1\n  HTTPSPort : 1087\n  HTTPSProxy : 127.0.0.1\n  SOCKSEnable : 1\n  SOCKSPort : 1087\n  SOCKSProxy : 127.0.0.1\n}";
        assert_eq!(parse_scutil_proxy(all).as_deref(), Some("http://127.0.0.1:1087"));
        let socks_only = "  SOCKSEnable : 1\n  SOCKSPort : 7890\n  SOCKSProxy : 10.0.0.2\n";
        assert_eq!(parse_scutil_proxy(socks_only).as_deref(), Some("socks5://10.0.0.2:7890"));
        let disabled = "  HTTPEnable : 0\n  HTTPPort : 1087\n  HTTPProxy : 127.0.0.1\n";
        assert_eq!(parse_scutil_proxy(disabled), None);
        assert_eq!(parse_scutil_proxy(""), None);
    }

    #[test]
    fn prune_removes_only_stale_skill_dirs() {
        let dst = std::env::temp_dir().join(format!("os-prune-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dst);
        for name in ["remote-compute", "hpc-slurm"] {
            fs::create_dir_all(dst.join(name)).unwrap();
            fs::write(dst.join(name).join("SKILL.md"), b"---\n").unwrap();
        }
        // A directory without a SKILL.md must never be touched.
        fs::create_dir_all(dst.join("notes")).unwrap();

        let mut bundled = std::collections::HashSet::new();
        bundled.insert(std::ffi::OsString::from("remote-compute"));
        prune_stale_skills(&dst, &bundled);

        assert!(dst.join("remote-compute").is_dir(), "bundled skill kept");
        assert!(!dst.join("hpc-slurm").exists(), "stale renamed skill removed");
        assert!(dst.join("notes").is_dir(), "non-skill dir left alone");
        let _ = fs::remove_dir_all(&dst);
    }

    #[cfg(unix)]
    #[test]
    fn tighten_private_makes_dir_and_secrets_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("os-private-{}", std::process::id()));
        let sub = dir.join("opencode");
        fs::create_dir_all(&sub).unwrap();
        let cfg = sub.join("opencode.jsonc");
        fs::write(&cfg, b"{\"apiKey\":\"secret\"}").unwrap();
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o755)).unwrap();
        fs::set_permissions(&cfg, fs::Permissions::from_mode(0o644)).unwrap();

        // The runtime root holds provider/connector keys (opencode.jsonc,
        // auth.json) — it must be unreadable to other users even when the
        // sidecar later rewrites files inside with a default umask.
        super::tighten_private(&dir);
        assert_eq!(fs::metadata(&dir).unwrap().permissions().mode() & 0o777, 0o700);
        super::tighten_private(&cfg);
        assert_eq!(fs::metadata(&cfg).unwrap().permissions().mode() & 0o777, 0o600);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn random_hex_is_csprng_shaped() {
        // 16 bytes → 32 hex chars, fresh per call — the shape the sidecar
        // password and the preview/Jupyter tokens rely on.
        let a = random_hex(16);
        let b = random_hex(16);
        assert_eq!(a.len(), 32);
        assert!(a.bytes().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b, "two draws must differ");
    }

    #[test]
    fn removes_only_the_named_config_entry() {
        let cfg = r#"{"model":"a/b","provider":{"ollama":{"npm":"x"},"keep":{"npm":"y"}},"mcp":{"pw":{"type":"local"}}}"#;
        let out = remove_key_from_config(cfg, "provider", "ollama").unwrap();
        assert!(!out.contains("ollama"));
        assert!(out.contains("keep"));
        assert!(out.contains("\"model\": \"a/b\""));
        let out2 = remove_key_from_config(cfg, "mcp", "pw").unwrap();
        assert!(!out2.contains("\"pw\""));
        // Absent key and non-JSON input are errors, not silent no-ops.
        assert!(remove_key_from_config(cfg, "provider", "missing").is_err());
        assert!(remove_key_from_config("// jsonc comment\n{}", "provider", "x").is_err());
    }

    fn write(path: &std::path::Path, content: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    #[test]
    fn sync_replaces_bundled_and_keeps_user_skills() {
        let tmp = std::env::temp_dir().join(format!("skillsync-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        let src = tmp.join("src");
        let dst = tmp.join("dst");

        // Bundled pack: one skill with a nested reference file, plus a top-level
        // plain file (.commit) that must NOT be copied.
        write(&src.join("paper-writer/SKILL.md"), "v2");
        write(&src.join("paper-writer/references/guide.md"), "ref");
        write(&src.join(".commit"), "abc123");
        // A placeholder dir without SKILL.md must not be deployed.
        fs::create_dir_all(src.join("placeholder")).unwrap();

        // Existing workspace: a stale copy of the bundled skill (with a file the
        // new version no longer has) and a user-installed skill.
        write(&dst.join("paper-writer/SKILL.md"), "v1");
        write(&dst.join("paper-writer/obsolete.md"), "old");
        write(&dst.join("my-skill/SKILL.md"), "user");

        sync_skill_pack(&src, &dst).unwrap();

        assert_eq!(fs::read_to_string(dst.join("paper-writer/SKILL.md")).unwrap(), "v2");
        assert_eq!(
            fs::read_to_string(dst.join("paper-writer/references/guide.md")).unwrap(),
            "ref"
        );
        assert!(!dst.join("paper-writer/obsolete.md").exists(), "stale file must be gone");
        assert_eq!(fs::read_to_string(dst.join("my-skill/SKILL.md")).unwrap(), "user");
        assert!(!dst.join(".commit").exists(), "top-level files are not skills");
        assert!(!dst.join("placeholder").exists(), "dirs without SKILL.md are not skills");

        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn sync_creates_destination_when_missing() {
        let tmp = std::env::temp_dir().join(format!("skillsync-new-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        let src = tmp.join("src");
        write(&src.join("literature-survey/SKILL.md"), "s");

        let dst = tmp.join("deep/nested/skills");
        sync_skill_pack(&src, &dst).unwrap();
        assert_eq!(
            fs::read_to_string(dst.join("literature-survey/SKILL.md")).unwrap(),
            "s"
        );
        fs::remove_dir_all(&tmp).unwrap();
    }
}

/// Remove an entry from a map section of the app-private global OpenCode
/// config ("provider" or "mcp") and restart the sidecar (PATCH /global/config
/// cannot delete keys).
#[tauri::command(async)]
pub fn remove_config_entry(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    section: String,
    key: String,
) -> Result<(), String> {
    if !matches!(section.as_str(), "provider" | "mcp") {
        return Err(format!("section \"{section}\" is not removable"));
    }
    let dir = xdg_config_home(&app)?.join("opencode");
    // The server writes opencode.jsonc; older configs may be opencode.json.
    let path = ["opencode.jsonc", "opencode.json"]
        .iter()
        .map(|n| dir.join(n))
        .find(|p| p.exists())
        .ok_or("no global OpenCode config found")?;
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let out = remove_key_from_config(&text, &section, &key)?;
    std::fs::write(&path, out).map_err(|e| e.to_string())?;
    tighten_private(&path);

    restart_sidecar_if_running(&app, &state)?;
    Ok(())
}

/// Drop `key` from the config JSON's `section` map, erroring when the config
/// is not plain JSON or the key is absent.
fn remove_key_from_config(text: &str, section: &str, key: &str) -> Result<String, String> {
    let mut cfg: serde_json::Value =
        serde_json::from_str(text).map_err(|e| format!("config is not plain JSON: {e}"))?;
    let removed = cfg
        .get_mut(section)
        .and_then(|p| p.as_object_mut())
        .map(|p| p.remove(key).is_some())
        .unwrap_or(false);
    if !removed {
        return Err(format!("\"{key}\" is not in the config's {section} section"));
    }
    serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())
}

/// The current approval mode ("approve" | "full"). Spawn seeding guarantees a
/// mode exists once the runtime has started; before that, report the default.
#[tauri::command]
pub fn get_approval_mode(app: AppHandle) -> Result<String, String> {
    let path = effective_config_file(&app)?;
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    Ok(crate::opencode_config::permission_mode_of(&existing)
        .unwrap_or(crate::opencode_config::MODE_APPROVE)
        .to_string())
}

/// Switch the approval mode and restart the sidecar so the permission rules
/// take effect. Returns the (stable-port) base URL when it was running.
#[tauri::command(async)]
pub fn set_approval_mode(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    mode: String,
) -> Result<String, String> {
    let path = effective_config_file(&app)?;
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    let updated = crate::opencode_config::set_permission_mode(&existing, &mode)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, updated).map_err(|e| e.to_string())?;
    tighten_private(&path);

    // Same restart flow as configure_opencode: reload rules on a stable port.
    Ok(restart_sidecar_if_running(&app, &state)?
        .unwrap_or_else(|| path.to_string_lossy().to_string()))
}

/// The persisted proxy setting plus the proxy the sidecar would use right now.
#[tauri::command]
pub fn get_proxy_setting(app: AppHandle) -> Result<serde_json::Value, String> {
    let (mode, url) = read_proxy_setting(&app);
    let effective = effective_proxy(&mode, &url);
    Ok(serde_json::json!({ "mode": mode, "url": url, "effective": effective }))
}

/// Persist the proxy setting ("system" | "custom" | "none", url for custom)
/// and restart the sidecar so its network env takes effect.
#[tauri::command(async)]
pub fn set_proxy_setting(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    mode: String,
    url: String,
) -> Result<String, String> {
    let line = match mode.as_str() {
        "system" => "system".to_string(),
        "none" => "none".to_string(),
        "custom" => {
            let url = url.trim();
            validate_proxy_url(url)?;
            format!("custom {url}")
        }
        other => return Err(format!("unknown proxy mode: {other}")),
    };
    let path = proxy_setting_file(&app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, line).map_err(|e| e.to_string())?;

    // Same restart flow as set_approval_mode: the env only applies at spawn.
    Ok(restart_sidecar_if_running(&app, &state)?
        .unwrap_or_else(|| path.to_string_lossy().to_string()))
}

/// The persisted uv mirrors (empty string ⇒ use uv's default index/mirror).
#[tauri::command]
pub fn get_mirror_setting(app: AppHandle) -> Result<serde_json::Value, String> {
    let (pypi, python) = read_mirror_setting(&app);
    Ok(serde_json::json!({ "pypi": pypi, "python": python }))
}

/// Persist the uv mirrors. Blank fields clear that mirror. No sidecar restart:
/// only the next provisioning run (Jupyter / science MCP) reads them.
#[tauri::command]
pub fn set_mirror_setting(app: AppHandle, pypi: String, python: String) -> Result<(), String> {
    let (pypi, python) = (pypi.trim(), python.trim());
    let mut lines = Vec::new();
    if !pypi.is_empty() {
        validate_mirror_url(pypi)?;
        lines.push(format!("pypi {pypi}"));
    }
    if !python.is_empty() {
        validate_mirror_url(python)?;
        lines.push(format!("python {python}"));
    }
    let path = mirror_setting_file(&app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, lines.join("\n")).map_err(|e| e.to_string())
}

/// Write the provider key/model into the app-private OpenCode config and restart
/// the sidecar so it picks them up. Returns the same base URL (stable port).
#[tauri::command(async)]
pub fn configure_opencode(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    provider: String,
    api_key: String,
    model: String,
    base_url: Option<String>,
) -> Result<String, String> {
    let path = opencode_config_file(&app)?;
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    let merged = merge_config(&existing, &provider, &api_key, &model, base_url.as_deref())?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, merged).map_err(|e| e.to_string())?;
    tighten_private(&path);

    // Restart so the running server reloads the new provider config.
    Ok(restart_sidecar_if_running(&app, &state)?
        .unwrap_or_else(|| path.to_string_lossy().to_string()))
}
