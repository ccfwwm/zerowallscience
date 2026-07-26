// Local notebook kernels. One persistent child per language ("python" | "r"),
// each holding shared state across cells like a Jupyter kernel. Fully local —
// uses whatever Python/R is installed, no network, no model key.
//
// Wire protocol (one request, one response line):
//   - Python: write {"id","code"} JSON; the bridge replies with a JSON line.
//   - R:      write the cell code to the kernel's code file, then send "<id>";
//             the bridge reads that file and replies with the SAME JSON shape.
// The read side is therefore identical for both languages.
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

// The bridge scripts ship in-tree; embed them and materialize on first use so
// they are always present next to the app regardless of packaging.
const PY_BRIDGE_SRC: &str = include_str!("../../../../runtime/kernel/kernel_bridge.py");
const R_BRIDGE_SRC: &str = include_str!("../../../../runtime/kernel/kernel_bridge.R");

/// The cell-execution side of a kernel: written/read one request at a time.
struct KernelIo {
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    seq: u64,
    /// For the R kernel: the file the host writes each cell's code into. None for Python.
    code_file: Option<PathBuf>,
}

/// A running kernel. Two INDEPENDENT locks by design: `io` is held for the
/// whole cell (including an unbounded blocking read — a `while True: pass`
/// cell holds it forever), while `child` is only ever taken to kill/reap, so
/// a reset can always terminate a hung kernel without waiting on `io`.
struct Kernel {
    child: Mutex<Child>,
    io: Mutex<KernelIo>,
}

impl Kernel {
    fn from_child(mut child: Child, code_file: Option<PathBuf>) -> Result<Self, String> {
        let stdin = child.stdin.take().ok_or("no kernel stdin")?;
        let stdout = BufReader::new(child.stdout.take().ok_or("no kernel stdout")?);
        Ok(Kernel {
            child: Mutex::new(child),
            io: Mutex::new(KernelIo { stdin, stdout, seq: 0, code_file }),
        })
    }
}

/// Persistent kernels keyed by `kernel_key` — one per notebook (Jupyter
/// semantics: each notebook gets its own kernel, cwd = the notebook's folder,
/// no state bleed between notebooks). The map lock is held only to look up /
/// insert / remove entries — NEVER across cell I/O (the old design did, and a
/// hung cell wedged every kernel command including reset; see P0-7).
#[derive(Default)]
pub struct KernelState(Mutex<HashMap<String, std::sync::Arc<Kernel>>>);

/// Map key for a kernel: `<lang>:<absolute notebook path>`, or `<lang>:@workspace`
/// for legacy notebook-less execution in the active workspace.
fn kernel_key(lang: &str, notebook_abs: Option<&std::path::Path>) -> String {
    match notebook_abs {
        Some(p) => format!("{lang}:{}", p.to_string_lossy()),
        None => format!("{lang}:@workspace"),
    }
}

/// Stable filename suffix for per-kernel scratch files (the R code file).
fn key_hash(key: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    key.hash(&mut h);
    format!("{:016x}", h.finish())
}

#[derive(serde::Serialize)]
pub struct ExecResult {
    ok: bool,
    stdout: String,
    result: Option<String>,
    error: Option<String>,
    /// Base64 PNG of a figure the cell produced (matplotlib / R graphics), if any.
    image: Option<String>,
    /// True when `stdout` was clipped because the cell printed too much.
    truncated: bool,
}

/// Normalize a requested language to a supported kernel id. Empty -> python.
fn normalize_lang(language: &str) -> Result<&'static str, String> {
    match language.trim().to_ascii_lowercase().as_str() {
        "" | "python" | "python3" => Ok("python"),
        "r" => Ok("r"),
        other => Err(format!("unsupported kernel language: {other}")),
    }
}

fn kernel_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("runtime")
        .join("kernel");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

// Rewrite the bridge each start so an app update ships a fresh copy.
fn materialize(app: &AppHandle, name: &str, src: &str) -> Result<PathBuf, String> {
    let path = kernel_dir(app)?.join(name);
    std::fs::write(&path, src).map_err(|e| e.to_string())?;
    Ok(path)
}

/// Common Python install locations per OS. A GUI app launched from Finder/Explorer
/// has a minimal PATH, so we fall back to these before giving up.
#[cfg(windows)]
fn python_candidates() -> Vec<String> {
    // `py` (the launcher) and `python` are what Windows installers register.
    let mut c = vec!["py".to_string(), "python".to_string(), "python3".to_string()];
    if let Ok(profile) = std::env::var("USERPROFILE") {
        c.push(format!("{profile}\\anaconda3\\python.exe"));
        c.push(format!("{profile}\\miniconda3\\python.exe"));
        c.push(format!("{profile}\\AppData\\Local\\Programs\\Python\\python.exe"));
    }
    // "All users" conda installs (Anaconda's default is ProgramData; C:\ is a
    // common manual choice). Anaconda does NOT add itself to PATH, so a bare
    // `python` probe never finds these.
    for base in [
        "C:\\ProgramData\\anaconda3",
        "C:\\ProgramData\\miniconda3",
        "C:\\anaconda3",
        "C:\\miniconda3",
    ] {
        c.push(format!("{base}\\python.exe"));
    }
    // python.org installers use versioned dirs (…\Python\Python312\python.exe):
    // per-user under LOCALAPPDATA, all-users under Program Files. Newest first.
    let mut roots: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        roots.push(std::path::Path::new(&local).join("Programs").join("Python"));
    }
    roots.push(std::path::PathBuf::from("C:\\Program Files"));
    for root in roots {
        let Ok(entries) = std::fs::read_dir(&root) else { continue };
        let mut vers: Vec<std::path::PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                p.file_name()
                    .map(|n| n.to_string_lossy().starts_with("Python3"))
                    .unwrap_or(false)
            })
            .collect();
        vers.sort();
        for v in vers.into_iter().rev() {
            c.push(v.join("python.exe").to_string_lossy().to_string());
        }
    }
    c
}

// macOS: Homebrew differs by arch (/opt/homebrew on Apple Silicon,
// /usr/local on Intel), plus the python.org framework build and conda.
#[cfg(target_os = "macos")]
fn python_candidates() -> Vec<String> {
    let mut c = vec!["python3".to_string(), "python".to_string()];
    if let Ok(home) = std::env::var("HOME") {
        c.push(format!("{home}/anaconda3/bin/python3"));
        c.push(format!("{home}/miniconda3/bin/python3"));
        c.push(format!("{home}/.pyenv/shims/python3"));
    }
    c.extend(
        [
            "/opt/homebrew/bin/python3",
            "/usr/local/bin/python3",
            "/opt/anaconda3/bin/python3",
            "/opt/miniconda3/bin/python3",
            // python.org installer (versioned; newest common ones first).
            "/Library/Frameworks/Python.framework/Versions/Current/bin/python3",
            "/usr/bin/python3",
        ]
        .map(String::from),
    );
    c
}

// Linux: distro python in /usr/bin, conda in ~ or /opt/conda (Docker/JupyterHub
// convention), pyenv shims, pipx/user installs in ~/.local, Linuxbrew.
#[cfg(target_os = "linux")]
fn python_candidates() -> Vec<String> {
    let mut c = vec!["python3".to_string(), "python".to_string()];
    if let Ok(home) = std::env::var("HOME") {
        c.push(format!("{home}/anaconda3/bin/python3"));
        c.push(format!("{home}/miniconda3/bin/python3"));
        c.push(format!("{home}/.pyenv/shims/python3"));
        c.push(format!("{home}/.local/bin/python3"));
    }
    c.extend(
        [
            "/opt/conda/bin/python3",
            "/opt/anaconda3/bin/python3",
            "/opt/miniconda3/bin/python3",
            "/home/linuxbrew/.linuxbrew/bin/python3",
            "/usr/local/bin/python3",
            "/usr/bin/python3",
        ]
        .map(String::from),
    );
    c
}

// Other unix (BSD): the portable minimum.
#[cfg(all(unix, not(target_os = "macos"), not(target_os = "linux")))]
fn python_candidates() -> Vec<String> {
    let mut c = vec!["python3".to_string(), "python".to_string()];
    if let Ok(home) = std::env::var("HOME") {
        c.push(format!("{home}/.pyenv/shims/python3"));
        c.push(format!("{home}/.local/bin/python3"));
    }
    c.extend(["/usr/local/bin/python3", "/usr/bin/python3"].map(String::from));
    c
}

/// Common Rscript locations (same minimal-PATH problem as Python).
#[cfg(windows)]
fn rscript_candidates() -> Vec<String> {
    let mut c = vec!["Rscript".to_string(), "Rscript.exe".to_string()];
    // The Windows installer does NOT add R to PATH and installs into a
    // VERSIONED directory: <base>\R-x.y.z\bin\Rscript.exe. Enumerate those,
    // newest first — a bare `<base>\bin\Rscript.exe` does not exist in a
    // standard install, so probing only that finds nothing.
    for base in ["C:\\Program Files\\R", "C:\\Program Files (x86)\\R"] {
        let Ok(entries) = std::fs::read_dir(base) else { continue };
        let mut vers: Vec<std::path::PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                p.file_name()
                    .map(|n| n.to_string_lossy().starts_with("R-"))
                    .unwrap_or(false)
            })
            .collect();
        vers.sort();
        for v in vers.into_iter().rev() {
            c.push(v.join("bin").join("Rscript.exe").to_string_lossy().to_string());
        }
        // Some layouts (and manual copies) do put the binary directly under bin.
        c.push(format!("{base}\\bin\\Rscript.exe"));
    }
    c
}

#[cfg(not(windows))]
fn rscript_candidates() -> Vec<String> {
    let mut c = vec!["Rscript".to_string()];
    if let Ok(home) = std::env::var("HOME") {
        c.push(format!("{home}/anaconda3/bin/Rscript"));
        c.push(format!("{home}/miniconda3/bin/Rscript"));
    }
    c.extend(
        [
            "/opt/homebrew/bin/Rscript",
            "/usr/local/bin/Rscript",
            "/opt/anaconda3/bin/Rscript",
            "/usr/bin/Rscript",
            // macOS R.framework install (r-project.org .pkg)
            "/Library/Frameworks/R.framework/Resources/bin/Rscript",
        ]
        .map(String::from),
    );
    c
}

/// PATH for a spawned Python kernel: the agent's enriched PATH (so cells see
/// the user's scientific tools), plus — on Windows — the interpreter's own
/// home dirs. A conda python launched by absolute path keeps numpy's DLLs in
/// `Library\bin`; without it on PATH, imports fail even though python runs.
fn python_path_env(python: &str) -> String {
    let base = crate::runtime::enriched_path();
    let _ = &python; // used on Windows only
    #[cfg(windows)]
    if let Some(home) = std::path::Path::new(python).parent() {
        if !home.as_os_str().is_empty() {
            let extras = [home.to_path_buf(), home.join("Scripts"), home.join("Library").join("bin")];
            let mut parts: Vec<String> = extras
                .iter()
                .filter(|p| p.is_dir())
                .map(|p| p.to_string_lossy().to_string())
                .collect();
            if !parts.is_empty() {
                parts.push(base);
                return parts.join(";");
            }
        }
    }
    base
}

/// Probe an interpreter with the SAME PATH the kernel will run it under, so
/// detection and execution resolve to the same binary (e.g. bare `python3` →
/// the user's anaconda, not a system Python). `--version` must SUCCEED — the
/// Windows Store `python.exe` alias runs but exits non-zero, and picking it
/// would make every cell fail and respawn.
fn interpreter_ok(bin: &str) -> bool {
    let mut c = crate::runtime::quiet_command(bin);
    c.arg("--version");
    c.env("PATH", crate::runtime::enriched_path());
    c.output().map(|o| o.status.success()).unwrap_or(false)
}

/// The persisted manual interpreter override (Settings → Local Python kernel).
fn python_path_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("runtime")
        .join("python-path.txt"))
}

fn configured_python(app: &AppHandle) -> Option<String> {
    let text = std::fs::read_to_string(python_path_file(app).ok()?).ok()?;
    let t = text.trim().to_string();
    (!t.is_empty()).then_some(t)
}

/// Resolve the local kernel's Python. Order:
///   1. the user's explicit override (Settings) — never falls through
///      silently: a broken override is an error, not a surprise interpreter;
///   2. the app-managed Jupyter env, WHEN it exists — so "Run" in the app and
///      the agent's Jupyter MCP share one Python (same packages, same results);
///   3. discovered system installs — the fallback when Jupyter isn't set up.
///
/// This makes the app-managed Jupyter env the single source of truth once present,
/// and degrades to auto-detection when it is not.
fn resolve_python(
    configured: Option<String>,
    jupyter_env: Option<String>,
    candidates: Vec<String>,
) -> Result<(String, &'static str), String> {
    if let Some(p) = configured {
        return if interpreter_ok(&p) {
            Ok((p, "manual"))
        } else {
            Err(format!(
                "the configured Python ({p}) failed to run — fix or clear the interpreter path in Settings"
            ))
        };
    }
    if let Some(p) = jupyter_env.filter(|p| interpreter_ok(p)) {
        return Ok((p, "jupyter-env"));
    }
    if let Some(p) = candidates.into_iter().find(|b| interpreter_ok(b)) {
        return Ok((p, "system"));
    }
    Err("no Python found — install Python 3, set an interpreter path in Settings, \
         or set up Jupyter in Settings (its environment includes one)"
        .into())
}

/// The interpreter local Python kernels run on, with where it came from
/// ("manual" | "jupyter-env" | "system").
pub(crate) fn python_bin(app: &AppHandle) -> Result<(String, &'static str), String> {
    resolve_python(
        configured_python(app),
        crate::jupyter::env_python(app).map(|p| p.to_string_lossy().to_string()),
        python_candidates(),
    )
}

pub(crate) fn rscript_bin() -> Option<String> {
    rscript_candidates().into_iter().find(|bin| interpreter_ok(bin))
}

#[derive(serde::Serialize)]
pub struct PythonInterpreter {
    /// The manual override, if one is set (even when it no longer runs).
    configured: Option<String>,
    /// What cells would actually run on right now.
    resolved: Option<String>,
    source: Option<&'static str>,
    error: Option<String>,
}

/// Report the interpreter local kernels resolve to (Settings + notebook header).
#[tauri::command(async)]
pub fn python_interpreter(app: AppHandle) -> PythonInterpreter {
    let configured = configured_python(&app);
    match python_bin(&app) {
        Ok((resolved, source)) => PythonInterpreter {
            configured,
            resolved: Some(resolved),
            source: Some(source),
            error: None,
        },
        Err(e) => PythonInterpreter { configured, resolved: None, source: None, error: Some(e) },
    }
}

/// Set (empty/None clears) the manual interpreter override. Validates the path
/// actually runs before persisting, and restarts Python kernels so the next
/// cell runs on the new interpreter instead of a stale one.
#[tauri::command(async)]
pub fn set_python_path(
    app: AppHandle,
    state: State<'_, KernelState>,
    path: Option<String>,
) -> Result<(), String> {
    let file = python_path_file(&app)?;
    let trimmed = path.as_deref().map(str::trim).unwrap_or_default();
    if trimmed.is_empty() {
        let _ = std::fs::remove_file(&file);
    } else {
        if !std::path::Path::new(trimmed).is_absolute() {
            return Err("enter an absolute path to a Python executable".into());
        }
        if !interpreter_ok(trimmed) {
            return Err(format!("{trimmed} did not run `--version` successfully — check the path"));
        }
        if let Some(dir) = file.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        std::fs::write(&file, trimmed).map_err(|e| e.to_string())?;
    }
    remove_kernels(&state, |k| k.starts_with("python:"));
    Ok(())
}

fn spawn_kernel(app: &AppHandle, lang: &str, cwd: &std::path::Path, key: &str) -> Result<Kernel, String> {
    let (mut cmd, code_file) = match lang {
        "python" => {
            let script = materialize(app, "kernel_bridge.py", PY_BRIDGE_SRC)?;
            let (python, _source) = python_bin(app)?;
            let mut c = crate::runtime::quiet_command(&python);
            c.arg(script);
            c.env("PATH", python_path_env(&python));
            // Force UTF-8 for the stdio protocol and user file I/O. Without this,
            // Windows decodes piped stdin/stdout with the ANSI code page (e.g.
            // cp936/GBK), garbling non-ASCII source like `print("中文")`. No-op on
            // macOS/Linux, which already default to UTF-8.
            c.env("PYTHONUTF8", "1");
            c.env("PYTHONIOENCODING", "utf-8");
            (c, None)
        }
        "r" => {
            let script = materialize(app, "kernel_bridge.R", R_BRIDGE_SRC)?;
            let rscript = rscript_bin().ok_or(
                "no R found — install R (r-project.org) to run R notebooks",
            )?;
            // One code file per kernel — concurrent R notebooks must not share it.
            let code_file = kernel_dir(app)?.join(format!("r_cell_{}.R", key_hash(key)));
            std::fs::write(&code_file, "").map_err(|e| e.to_string())?;
            let mut c = crate::runtime::quiet_command(rscript);
            c.arg(script).arg(&code_file);
            // Same enriched PATH as the agent so a conda/homebrew R resolves.
            c.env("PATH", crate::runtime::enriched_path());
            (c, Some(code_file))
        }
        _ => return Err(format!("unsupported kernel language: {lang}")),
    };
    cmd.current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let child = cmd
        .spawn()
        .map_err(|e| format!("failed to start {lang} kernel: {e}"))?;
    Kernel::from_child(child, code_file)
}

/// How many unrecognized lines to skip while looking for a response. The Python
/// bridge writes its protocol to a private descriptor, so cell output can never
/// appear here; R cannot redirect its own descriptors that cheaply, so a startup
/// warning or package banner can still slip in. Skipping those is what keeps a
/// stray line from costing the user a whole session's variables.
const MAX_SKIPPED_LINES: usize = 64;

/// Read lines until the response for `want` arrives. A line that is not JSON, or
/// carries another id, is discarded: it is noise on the stream, not an answer.
fn read_response(
    stdout: &mut BufReader<ChildStdout>,
    want: &str,
) -> Result<serde_json::Value, String> {
    for _ in 0..MAX_SKIPPED_LINES {
        let mut line = String::new();
        let n = stdout
            .read_line(&mut line)
            .map_err(|e| format!("kernel read failed: {e}"))?;
        if n == 0 {
            return Err("kernel exited unexpectedly".into());
        }
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line.trim()) else {
            continue; // not a response — stray output from the kernel process
        };
        match v.get("id").and_then(|x| x.as_str()) {
            // A stale response (from a cell whose read was abandoned) must not
            // be handed to this cell as its result.
            Some(id) if id != want => continue,
            _ => return Ok(v),
        }
    }
    Err("kernel produced no usable response".into())
}

/// Send one request to a running kernel and read its single JSON response line.
fn exec_on(k: &mut KernelIo, code: &str) -> Result<ExecResult, String> {
    k.seq += 1;
    match &k.code_file {
        // R: stage the code in the kernel's file, then poke it with the id.
        Some(path) => {
            std::fs::write(path, code).map_err(|e| format!("kernel write failed: {e}"))?;
            writeln!(k.stdin, "{}", k.seq).map_err(|e| format!("kernel write failed: {e}"))?;
        }
        // Python: send the code inline as JSON.
        None => {
            let req = serde_json::json!({ "id": k.seq.to_string(), "code": code });
            writeln!(k.stdin, "{req}").map_err(|e| format!("kernel write failed: {e}"))?;
        }
    }
    k.stdin.flush().map_err(|e| format!("kernel flush failed: {e}"))?;

    let want = k.seq.to_string();
    let v = read_response(&mut k.stdout, &want)?;
    Ok(ExecResult {
        ok: v.get("ok").and_then(|x| x.as_bool()).unwrap_or(false),
        stdout: v.get("stdout").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        result: v.get("result").and_then(|x| x.as_str()).map(str::to_string),
        error: v.get("error").and_then(|x| x.as_str()).map(str::to_string),
        image: v.get("image").and_then(|x| x.as_str()).map(str::to_string),
        truncated: v.get("truncated").and_then(|x| x.as_bool()).unwrap_or(false),
    })
}

/// Kill a kernel's process and reap it — killed children must be `wait()`ed
/// or they linger as zombies. Takes only the `child` lock, which no cell ever
/// holds, so this always proceeds even while a cell is blocked mid-read.
fn reap(kernel: &Kernel) {
    let mut child = kernel.child.lock().unwrap();
    let _ = child.kill();
    let _ = child.wait();
}

/// Get-or-spawn the kernel for `key` and run one cell on it. The map lock is
/// dropped before any cell I/O; each kernel's own `io` lock serializes its
/// cells, so one notebook's hung cell never blocks another notebook or reset.
fn exec_in<F>(state: &KernelState, key: &str, code: &str, spawn: F) -> Result<ExecResult, String>
where
    F: FnOnce() -> Result<Kernel, String>,
{
    let kernel = {
        let mut map = state.0.lock().unwrap();
        match map.get(key) {
            Some(k) => std::sync::Arc::clone(k),
            None => {
                let k = std::sync::Arc::new(spawn()?);
                map.insert(key.to_string(), std::sync::Arc::clone(&k));
                k
            }
        }
    };
    let mut io = kernel.io.lock().unwrap();
    match exec_on(&mut io, code) {
        Ok(r) => Ok(r),
        Err(e) => {
            // The child died — a crash, or a reset killed it mid-cell. Reap it,
            // then drop THIS kernel from the map so the next run respawns —
            // unless a reset already removed (or replaced) the entry.
            reap(&kernel);
            let mut map = state.0.lock().unwrap();
            if map.get(key).is_some_and(|cur| std::sync::Arc::ptr_eq(cur, &kernel)) {
                map.remove(key);
            }
            Err(e)
        }
    }
}

/// Remove every kernel whose key matches `pred` and kill its process. The map
/// lock is released before killing so a hung cell's error path (which also
/// wants the map) can never contend with the kills.
fn remove_kernels(state: &KernelState, pred: impl Fn(&str) -> bool) {
    let victims: Vec<std::sync::Arc<Kernel>> = {
        let mut map = state.0.lock().unwrap();
        let keys: Vec<String> = map.keys().filter(|k| pred(k)).cloned().collect();
        keys.iter().filter_map(|k| map.remove(k)).collect()
    };
    for kernel in &victims {
        reap(kernel);
    }
}

/// Resolve a cell's kernel: its working directory and map key. `notebook` is a
/// `root`-relative .ipynb path; without it the kernel runs in the active
/// workspace (legacy behavior).
fn resolve_kernel(
    app: &AppHandle,
    lang: &str,
    notebook: Option<&str>,
    root: Option<&str>,
) -> Result<(PathBuf, String), String> {
    match notebook.filter(|s| !s.trim().is_empty()) {
        Some(nb) => {
            let scope = crate::artifact_file::scope_root(app, root)?;
            let abs = crate::artifact_file::resolve_under(&scope, nb)?;
            let dir = abs
                .parent()
                .ok_or("notebook has no parent directory")?
                .to_path_buf();
            Ok((dir, kernel_key(lang, Some(&abs))))
        }
        None => Ok((crate::runtime::workspace_dir(app)?, kernel_key(lang, None))),
    }
}

/// Execute one cell in the persistent local kernel for this notebook (Jupyter
/// semantics: one kernel per notebook, working directory = the notebook's
/// folder), starting it on first use. Runs on the BLOCKING pool: the cell read
/// is unbounded (a long computation blocks until done or reset), and a sync
/// command would hold the webview's UI thread — the whole app froze for the
/// duration of every cell (the Windows "app hangs while a notebook runs" bug).
#[tauri::command]
pub async fn kernel_execute(
    app: AppHandle,
    code: String,
    language: Option<String>,
    notebook: Option<String>,
    root: Option<String>,
) -> Result<ExecResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<KernelState>();
        let lang = normalize_lang(language.as_deref().unwrap_or("python"))?;
        let (cwd, key) = resolve_kernel(&app, lang, notebook.as_deref(), root.as_deref())?;
        exec_in(&state, &key, &code, || spawn_kernel(&app, lang, &cwd, &key))
    })
    .await
    .map_err(|e| format!("kernel task failed: {e}"))?
}

/// Restart kernels (clears their state). With `notebook`, exactly that
/// notebook's kernel is killed (the Stop button on a hung cell); with only
/// `language`, every kernel of that language; with neither, everything.
/// Always returns promptly, even while a cell is blocked mid-run. `async` so
/// the kill/reap never runs on the UI thread.
#[tauri::command(async)]
pub fn kernel_reset(
    app: AppHandle,
    state: State<'_, KernelState>,
    language: Option<String>,
    notebook: Option<String>,
    root: Option<String>,
) -> Result<(), String> {
    if notebook.as_deref().is_some_and(|s| !s.trim().is_empty()) {
        let lang = normalize_lang(language.as_deref().unwrap_or("python"))?;
        let (_, key) = resolve_kernel(&app, lang, notebook.as_deref(), root.as_deref())?;
        remove_kernels(&state, |k| k == key);
        return Ok(());
    }
    match language.as_deref().and_then(|l| normalize_lang(l).ok()) {
        Some(lang) => {
            let prefix = format!("{lang}:");
            remove_kernels(&state, |k| k.starts_with(&prefix));
        }
        None => remove_kernels(&state, |_| true),
    }
    Ok(())
}

pub fn kill_kernel(state: &KernelState) {
    remove_kernels(state, |_| true);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn read(stdout: &mut BufReader<ChildStdout>) -> serde_json::Value {
        let mut line = String::new();
        stdout.read_line(&mut line).unwrap();
        serde_json::from_str(line.trim()).unwrap()
    }

    #[test]
    fn kernel_keys_isolate_notebooks_and_languages() {
        let a = std::path::Path::new("/ws/2026-07-05/analysis.ipynb");
        let b = std::path::Path::new("/ws/2026-07-04/analysis.ipynb");
        // Same basename in different folders → different kernels; language
        // is part of the key; the legacy no-notebook key stays stable.
        assert_ne!(kernel_key("python", Some(a)), kernel_key("python", Some(b)));
        assert_ne!(kernel_key("python", Some(a)), kernel_key("r", Some(a)));
        assert_eq!(kernel_key("python", None), "python:@workspace");
        // Distinct keys get distinct R scratch files.
        assert_ne!(
            key_hash(&kernel_key("r", Some(a))),
            key_hash(&kernel_key("r", Some(b)))
        );
    }

    // Windows ships a fake `python.exe` App Execution Alias that prints an
    // install hint and exits non-zero. An interpreter that runs but fails
    // `--version` must NOT be picked — selecting it makes every cell respawn
    // (and, before CREATE_NO_WINDOW, flash a console window) forever.
    #[cfg(unix)]
    #[test]
    fn interpreter_ok_rejects_a_binary_that_fails_version() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("os-fake-python-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let fake = dir.join("fake-python");
        std::fs::write(&fake, "#!/bin/sh\necho 'Python was not found' >&2\nexit 9\n").unwrap();
        std::fs::set_permissions(&fake, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert!(
            !interpreter_ok(fake.to_str().unwrap()),
            "an interpreter that exits non-zero on --version must be rejected"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    // The resolution contract: a manual override wins; a BROKEN override is a
    // loud error (never a silent fall-through to some other python); the
    // app-managed Jupyter env is the default when present (so "Run" and the
    // agent share one Python); system installs are the fallback when Jupyter
    // isn't set up; and with nothing at all the error says what to do.
    #[cfg(unix)]
    #[test]
    fn resolve_python_prefers_override_then_jupyter_env_then_system() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("os-resolve-python-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let mk = |name: &str, ok: bool| -> String {
            let path = dir.join(name);
            let body = if ok { "#!/bin/sh\nexit 0\n" } else { "#!/bin/sh\nexit 9\n" };
            std::fs::write(&path, body).unwrap();
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
            path.to_string_lossy().to_string()
        };
        let good_override = mk("override-python", true);
        let bad_override = mk("broken-python", false);
        let jupyter_env = mk("jupyter-python", true);
        let system = mk("system-python", true);

        // Override wins over everything.
        let r = resolve_python(Some(good_override.clone()), Some(jupyter_env.clone()), vec![system.clone()]);
        assert_eq!(r.unwrap(), (good_override.clone(), "manual"));
        // A broken override errors loudly instead of silently using another python.
        let e = resolve_python(Some(bad_override.clone()), Some(jupyter_env.clone()), vec![system.clone()]);
        assert!(e.as_ref().unwrap_err().contains("broken-python"), "got: {e:?}");
        // No override: the Jupyter env is the default, chosen over system installs,
        // so the app's Run button and the agent's MCP share one Python.
        let r = resolve_python(None, Some(jupyter_env.clone()), vec![system.clone()]);
        assert_eq!(r.unwrap(), (jupyter_env, "jupyter-env"));
        // No Jupyter env: fall back to the first working system candidate.
        let r = resolve_python(None, None, vec![bad_override.clone(), system.clone()]);
        assert_eq!(r.unwrap(), (system, "system"));
        // Nothing anywhere: the error tells the user their options.
        let e = resolve_python(None, None, vec![]).unwrap_err();
        assert!(e.contains("Settings"), "error must point at Settings: {e}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// A `BufReader<ChildStdout>` cannot be built without a process, so drive
    /// `read_response` through a real child that just echoes canned lines.
    fn reader_over(lines: &str) -> (Child, BufReader<ChildStdout>) {
        let Ok((python, _)) = resolve_python(None, None, python_candidates()) else {
            panic!("no python");
        };
        // Write the fixture verbatim: `-c` with sys.stdout.write keeps it exact.
        let code = format!("import sys; sys.stdout.write({:?})", lines);
        let mut child = crate::runtime::quiet_command(&python)
            .arg("-c")
            .arg(code)
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn echo");
        let out = BufReader::new(child.stdout.take().unwrap());
        (child, out)
    }

    // R cannot redirect its own descriptors, so a package banner or startup
    // warning can land on the protocol stream. Such a line is noise: skipping
    // it keeps the user's session, where failing the read would reap the kernel
    // and discard every variable they had built up.
    #[test]
    fn read_response_skips_noise_before_the_answer() {
        if resolve_python(None, None, python_candidates()).is_err() {
            eprintln!("skipping: no python found");
            return;
        }
        let (mut child, mut out) = reader_over(
            "Loading required package: ggplot2\n\
             {\"id\":\"1\",\"ok\":true,\"stdout\":\"hi\",\"result\":null,\"error\":null}\n",
        );
        let v = read_response(&mut out, "1").expect("must find the response past the banner");
        assert_eq!(v["stdout"], "hi");
        let _ = child.kill();
    }

    // A response for another cell must never be handed over as this cell's
    // result — that would show one cell's numbers under a different cell.
    #[test]
    fn read_response_ignores_a_stale_id() {
        if resolve_python(None, None, python_candidates()).is_err() {
            eprintln!("skipping: no python found");
            return;
        }
        let (mut child, mut out) = reader_over(
            "{\"id\":\"1\",\"ok\":true,\"stdout\":\"stale\",\"result\":null,\"error\":null}\n\
             {\"id\":\"2\",\"ok\":true,\"stdout\":\"fresh\",\"result\":null,\"error\":null}\n",
        );
        let v = read_response(&mut out, "2").expect("must wait for the requested id");
        assert_eq!(v["stdout"], "fresh");
        let _ = child.kill();
    }

    // A kernel that died mid-cell must surface as an error, not hang.
    #[test]
    fn read_response_reports_a_dead_kernel() {
        if resolve_python(None, None, python_candidates()).is_err() {
            eprintln!("skipping: no python found");
            return;
        }
        let (mut child, mut out) = reader_over("");
        let e = read_response(&mut out, "1").unwrap_err();
        assert!(e.contains("exited"), "got: {e}");
        let _ = child.kill();
    }

    // Endless noise must not loop forever.
    #[test]
    fn read_response_gives_up_on_unbounded_noise() {
        if resolve_python(None, None, python_candidates()).is_err() {
            eprintln!("skipping: no python found");
            return;
        }
        let noise = "not json\n".repeat(MAX_SKIPPED_LINES + 5);
        let (mut child, mut out) = reader_over(&noise);
        let e = read_response(&mut out, "1").unwrap_err();
        assert!(e.contains("no usable response"), "got: {e}");
        let _ = child.kill();
    }

    #[test]
    fn normalizes_languages() {
        assert_eq!(normalize_lang("").unwrap(), "python");
        assert_eq!(normalize_lang("Python3").unwrap(), "python");
        assert_eq!(normalize_lang("R").unwrap(), "r");
        assert!(normalize_lang("julia").is_err());
    }

    // THE P0-7 deadlock case: a `while True: pass` cell used to wedge every
    // kernel command — kernel_execute held the global map mutex across an
    // unbounded blocking read, so even kernel_reset waited forever and only an
    // app restart recovered. With per-kernel locks, reset must (a) return
    // promptly, (b) unblock the hung cell with an error, (c) leave the map
    // empty so the next run respawns fresh.
    #[test]
    fn reset_interrupts_a_hung_cell_without_wedging() {
        use std::sync::Arc;
        use std::time::{Duration, Instant};
        let Ok((python, _)) = resolve_python(None, None, python_candidates()) else {
            eprintln!("skipping: no python found");
            return;
        };
        let script = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../runtime/kernel/kernel_bridge.py");
        let state = Arc::new(KernelState::default());
        let key = "python:@hung-test";

        let exec_state = state.clone();
        let hung = std::thread::spawn(move || {
            exec_in(&exec_state, key, "while True: pass", || {
                let child = Command::new(python)
                    .arg(script)
                    .stdin(Stdio::piped())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::null())
                    .spawn()
                    .map_err(|e| e.to_string())?;
                Kernel::from_child(child, None)
            })
        });

        // Wait until the kernel is registered (the cell is running), then give
        // it a beat to enter the blocking read.
        let start = Instant::now();
        while state.0.lock().unwrap().is_empty() {
            assert!(start.elapsed() < Duration::from_secs(10), "kernel never registered");
            std::thread::sleep(Duration::from_millis(20));
        }
        std::thread::sleep(Duration::from_millis(300));

        // Reset must not wedge behind the hung cell.
        let reset_state = state.clone();
        let reset = std::thread::spawn(move || remove_kernels(&reset_state, |_| true));
        let start = Instant::now();
        while !reset.is_finished() {
            assert!(
                start.elapsed() < Duration::from_secs(5),
                "kernel_reset wedged behind a hung cell (the P0-7 deadlock)"
            );
            std::thread::sleep(Duration::from_millis(20));
        }
        reset.join().unwrap();

        // The hung execute errors out instead of blocking forever…
        let res = hung.join().unwrap();
        assert!(res.is_err(), "hung cell must surface an error after reset");
        // …and nothing is left behind: next run respawns a fresh kernel.
        assert!(state.0.lock().unwrap().is_empty());
    }

    // Drives the real in-tree Python bridge with the same JSON protocol
    // kernel_execute uses, proving the Rust <-> Python round trip and shared state.
    #[test]
    fn python_round_trips_and_keeps_state() {
        let Ok((python, _)) = resolve_python(None, None, python_candidates()) else {
            eprintln!("skipping: no python found");
            return;
        };
        let script = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../runtime/kernel/kernel_bridge.py");
        let mut child = Command::new(python)
            .arg(script)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn bridge");
        let mut stdin = child.stdin.take().unwrap();
        let mut stdout = BufReader::new(child.stdout.take().unwrap());

        writeln!(stdin, "{}", serde_json::json!({"id":"1","code":"a=41\na+1"})).unwrap();
        stdin.flush().unwrap();
        let r1 = read(&mut stdout);
        assert_eq!(r1["ok"], true);
        assert_eq!(r1["result"], "42");

        // Second cell sees `a` from the first — persistent shared namespace.
        writeln!(stdin, "{}", serde_json::json!({"id":"2","code":"a"})).unwrap();
        stdin.flush().unwrap();
        let r2 = read(&mut stdout);
        assert_eq!(r2["result"], "41");

        // Errors come back as ok:false with a traceback.
        writeln!(stdin, "{}", serde_json::json!({"id":"3","code":"1/0"})).unwrap();
        stdin.flush().unwrap();
        let r3 = read(&mut stdout);
        assert_eq!(r3["ok"], false);
        assert!(r3["error"].as_str().unwrap().contains("ZeroDivisionError"));

        let _ = child.kill();
    }

    // The protocol stream must be unreachable from cell code. A subprocess
    // inherits descriptors rather than `sys.stdout`, so before the bridge
    // reserved a private fd, `subprocess.run` and `os.write(1, ...)` injected
    // raw text between responses: the host read "FROM_SUBPROCESS" as the
    // response, failed to parse it, and reaped the kernel — the user lost every
    // variable because a cell shelled out. Both must now be captured as output.
    #[test]
    fn cell_output_cannot_corrupt_the_protocol_stream() {
        let Ok((python, _)) = resolve_python(None, None, python_candidates()) else {
            eprintln!("skipping: no python found");
            return;
        };
        let script = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../runtime/kernel/kernel_bridge.py");
        let mut child = Command::new(python)
            .arg(script)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn bridge");
        let mut stdin = child.stdin.take().unwrap();
        let mut stdout = BufReader::new(child.stdout.take().unwrap());
        let mut send = |id: &str, code: &str| {
            writeln!(stdin, "{}", serde_json::json!({"id": id, "code": code})).unwrap();
            stdin.flush().unwrap();
        };

        // A child process writing to the inherited fd 1.
        send(
            "1",
            "import subprocess,sys; subprocess.run([sys.executable,'-c','print(\"FROM_SUBPROCESS\")'])",
        );
        let r1 = read(&mut stdout);
        assert_eq!(r1["id"], "1", "the response must not be preceded by raw output");
        assert!(
            r1["stdout"].as_str().unwrap().contains("FROM_SUBPROCESS"),
            "a subprocess's output belongs in the cell: {r1}"
        );

        // A direct write to fd 1, bypassing sys.stdout entirely.
        send("2", "import os; os.write(1, b'RAW_FD_WRITE\\n')");
        let r2 = read(&mut stdout);
        assert_eq!(r2["id"], "2");
        assert!(r2["stdout"].as_str().unwrap().contains("RAW_FD_WRITE"), "got: {r2}");

        // The kernel is still healthy and its namespace intact.
        send("3", "'alive'");
        let r3 = read(&mut stdout);
        assert_eq!(r3["result"], "'alive'");

        let _ = child.kill();
    }

    // A runaway loop must not produce one unbounded response line: the host
    // buffers a response whole, so an uncapped cell stalls the notebook.
    #[test]
    fn python_caps_a_runaway_cells_output() {
        let Ok((python, _)) = resolve_python(None, None, python_candidates()) else {
            eprintln!("skipping: no python found");
            return;
        };
        let script = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../runtime/kernel/kernel_bridge.py");
        let mut child = Command::new(python)
            .arg(script)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn bridge");
        let mut stdin = child.stdin.take().unwrap();
        let mut stdout = BufReader::new(child.stdout.take().unwrap());

        writeln!(
            stdin,
            "{}",
            serde_json::json!({"id":"1","code":"for i in range(200000): print(i)"})
        )
        .unwrap();
        stdin.flush().unwrap();
        let r = read(&mut stdout);
        assert_eq!(r["truncated"], true, "a 200k-line cell must report truncation");
        let out = r["stdout"].as_str().unwrap();
        assert!(out.len() < 250_000, "output was not capped: {} chars", out.len());
        assert!(out.contains("characters omitted"), "the clip must be visible to the user");
        // Both ends are kept, so the user sees where it started and ended.
        assert!(out.starts_with("0\n1\n"), "the head must survive");
        assert!(out.trim_end().ends_with("199999"), "the tail must survive");

        let _ = child.kill();
    }

    // Figures: a matplotlib plot must come back as a base64 PNG, and a cell
    // that draws nothing must not report one (an empty canvas is not a figure).
    #[test]
    fn python_returns_a_figure_only_when_the_cell_draws() {
        let Ok((python, _)) = resolve_python(None, None, python_candidates()) else {
            eprintln!("skipping: no python found");
            return;
        };
        let script = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../runtime/kernel/kernel_bridge.py");
        let mut child = Command::new(python)
            .arg(script)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn bridge");
        let mut stdin = child.stdin.take().unwrap();
        let mut stdout = BufReader::new(child.stdout.take().unwrap());
        let mut send = |id: &str, code: &str| {
            writeln!(stdin, "{}", serde_json::json!({"id": id, "code": code})).unwrap();
            stdin.flush().unwrap();
        };

        // No plot -> no image.
        send("1", "x = 1");
        assert!(read(&mut stdout)["image"].is_null(), "a cell that draws nothing has no figure");

        send(
            "2",
            "import importlib.util as u\n\
             have = u.find_spec('matplotlib') is not None\n\
             have",
        );
        if read(&mut stdout)["result"].as_str() != Some("True") {
            eprintln!("skipping the figure assertion: matplotlib not installed");
            let _ = child.kill();
            return;
        }

        send(
            "3",
            "import matplotlib\nmatplotlib.use('Agg')\n\
             import matplotlib.pyplot as plt\nplt.plot([1,2,3],[2,1,3])\n'drawn'",
        );
        let r = read(&mut stdout);
        let png = r["image"].as_str().expect("a plotted cell must return a figure");
        // A base64 PNG starts with the PNG magic bytes (\x89PNG -> "iVBOR").
        assert!(png.starts_with("iVBOR"), "not a PNG: {}", &png[..png.len().min(20)]);

        // The figure was consumed, Jupyter-style: the next cell starts clean.
        send("4", "'after'");
        assert!(read(&mut stdout)["image"].is_null(), "a shown figure must not repeat");

        let _ = child.kill();
    }

    // Same round trip against the real R bridge (skipped if R is not installed):
    // shared state across cells, last-expression value, and error reporting.
    #[test]
    fn r_round_trips_and_keeps_state() {
        let Some(rscript) = rscript_bin() else {
            eprintln!("skipping: no Rscript found");
            return;
        };
        let script = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../runtime/kernel/kernel_bridge.R");
        let dir = std::env::temp_dir().join("os_r_kernel_test");
        std::fs::create_dir_all(&dir).unwrap();
        let code_file = dir.join("r_cell.R");
        std::fs::write(&code_file, "").unwrap();
        let mut child = Command::new(rscript)
            .arg(script)
            .arg(&code_file)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn R bridge");
        let mut stdin = child.stdin.take().unwrap();
        let mut stdout = BufReader::new(child.stdout.take().unwrap());
        let mut poke = |code: &str, id: &str| {
            std::fs::write(&code_file, code).unwrap();
            writeln!(stdin, "{id}").unwrap();
            stdin.flush().unwrap();
        };

        poke("a <- 41\na + 1", "1");
        let r1 = read(&mut stdout);
        assert_eq!(r1["ok"], true);
        assert_eq!(r1["result"], "[1] 42");

        // `a` persists into the next cell.
        poke("a", "2");
        let r2 = read(&mut stdout);
        assert_eq!(r2["result"], "[1] 41");

        // stdout is captured; the final visible value is the result.
        poke("cat('hi\\n')\n2 + 2", "3");
        let r3 = read(&mut stdout);
        assert_eq!(r3["stdout"].as_str().unwrap().trim(), "hi");
        assert_eq!(r3["result"], "[1] 4");

        // Errors -> ok:false with a message.
        poke("stop('boom')", "4");
        let r4 = read(&mut stdout);
        assert_eq!(r4["ok"], false);
        assert!(r4["error"].as_str().unwrap().contains("boom"));

        let _ = child.kill();
        let _ = std::fs::remove_dir_all(&dir);
    }

    // R cannot redirect its own descriptors, so `system()` handed the child the
    // kernel's stdout — the protocol stream — and its output arrived as a bare
    // line between responses. It is now routed through a file. `intern = TRUE`
    // is not an option: on Windows it closes the kernel's inherited stdin, so
    // the read loop hits EOF and the kernel exits mid-session.
    #[test]
    fn r_shell_calls_stay_out_of_the_protocol_and_leave_the_kernel_alive() {
        let Some(rscript) = rscript_bin() else {
            eprintln!("skipping: no Rscript found");
            return;
        };
        let script = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../runtime/kernel/kernel_bridge.R");
        let dir = std::env::temp_dir().join(format!("os_r_shell_test_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let code_file = dir.join("r_cell.R");
        std::fs::write(&code_file, "").unwrap();
        let mut child = Command::new(rscript)
            .arg(script)
            .arg(&code_file)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn R bridge");
        let mut stdin = child.stdin.take().unwrap();
        let mut stdout = BufReader::new(child.stdout.take().unwrap());
        let mut poke = |code: &str, id: &str| {
            std::fs::write(&code_file, code).unwrap();
            writeln!(stdin, "{id}").unwrap();
            stdin.flush().unwrap();
        };

        poke("x <- 1\nsystem('echo FROM_SYSTEM')", "1");
        let r1 = read(&mut stdout);
        assert_eq!(r1["id"], "1", "the shell output must not precede the response");
        assert!(
            r1["stdout"].as_str().unwrap().contains("FROM_SYSTEM"),
            "the child's output belongs in the cell: {r1}"
        );

        // The session survived the shell call, with its variables.
        poke("x", "2");
        assert_eq!(read(&mut stdout)["result"], "[1] 1");

        // A drawn plot returns a PNG; a cell that draws nothing does not (an
        // untouched device still writes a blank image, which is not a figure).
        poke("plot(1:10, (1:10)^2)\n'plotted'", "3");
        let r3 = read(&mut stdout);
        let png = r3["image"].as_str().expect("a plotted cell must return a figure");
        assert!(png.starts_with("iVBOR"), "not a PNG: {}", &png[..png.len().min(20)]);

        poke("y <- 2", "4");
        assert!(read(&mut stdout)["image"].is_null(), "a cell that draws nothing has no figure");

        let _ = child.kill();
        let _ = std::fs::remove_dir_all(&dir);
    }

    // Same output cap as Python: one cell cannot build an unbounded response.
    #[test]
    fn r_caps_a_runaway_cells_output() {
        let Some(rscript) = rscript_bin() else {
            eprintln!("skipping: no Rscript found");
            return;
        };
        let script = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../runtime/kernel/kernel_bridge.R");
        let dir = std::env::temp_dir().join(format!("os_r_cap_test_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let code_file = dir.join("r_cell.R");
        std::fs::write(&code_file, "for (i in 1:60000) cat(i, '\\n')").unwrap();
        let mut child = Command::new(rscript)
            .arg(script)
            .arg(&code_file)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn R bridge");
        let mut stdin = child.stdin.take().unwrap();
        let mut stdout = BufReader::new(child.stdout.take().unwrap());
        writeln!(stdin, "1").unwrap();
        stdin.flush().unwrap();

        let r = read(&mut stdout);
        assert_eq!(r["truncated"], true, "a 60k-line cell must report truncation");
        let out = r["stdout"].as_str().unwrap();
        assert!(out.len() < 250_000, "output was not capped: {} chars", out.len());
        assert!(out.contains("characters omitted"), "the clip must be visible to the user");

        let _ = child.kill();
        let _ = std::fs::remove_dir_all(&dir);
    }

    // The Windows R installer uses a VERSIONED directory and does not touch
    // PATH, so probing only `<base>\bin\Rscript.exe` finds nothing on a stock
    // install — R notebooks then report "no R found" on a machine that has R.
    #[cfg(windows)]
    #[test]
    fn rscript_candidates_cover_versioned_windows_installs() {
        let c = rscript_candidates();
        assert!(c.iter().any(|p| p == "Rscript"), "PATH must still be tried first");
        // Any R-x.y.z directory present on this machine must be offered.
        if let Ok(entries) = std::fs::read_dir("C:\\Program Files\\R") {
            let versioned: Vec<String> = entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| {
                    p.file_name().map(|n| n.to_string_lossy().starts_with("R-")).unwrap_or(false)
                })
                .map(|p| p.join("bin").join("Rscript.exe").to_string_lossy().to_string())
                .collect();
            for v in versioned {
                assert!(c.contains(&v), "a versioned install must be probed: {v}\ncandidates: {c:?}");
            }
        }
    }
}
