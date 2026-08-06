// Curated open-source science MCP connectors (P1-2). We do NOT reimplement
// literature/database access — we one-click provision existing open-source MCP
// servers (e.g. paper-search-mcp, biomcp) into a shared ISOLATED uv env under
// app data (the user's Python is untouched), then register them in OpenCode's
// config. The frontend holds the curated catalog; here we just install a pip
// package and report the managed interpreter path.
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use zerowall_acp::AcpMcpServer;

fn env_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("runtime")
        .join("science-mcp-env"))
}

/// Absolute path to the managed interpreter in the shared science-MCP env.
fn python_bin(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = env_dir(app)?;
    #[cfg(windows)]
    return Ok(dir.join("Scripts").join("python.exe"));
    #[cfg(not(windows))]
    Ok(dir.join("bin").join("python"))
}

/// The ACP adapters own their MCP children, so the host's `CREATE_NO_WINDOW`
/// flag does not propagate to Python. Route MCP stdio through our GUI-subsystem
/// proxy, which starts the real child without creating a console window.
fn mcp_proxy_path(app: &AppHandle) -> Result<PathBuf, String> {
    let extension = if cfg!(windows) { ".exe" } else { "" };
    let installed = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join(format!("zerowall-mcp-proxy{extension}"));
    if installed.is_file() {
        return Ok(installed);
    }

    let target = if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "x86_64-pc-windows-msvc"
    } else if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
        "aarch64-pc-windows-msvc"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "x86_64-apple-darwin"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "aarch64-apple-darwin"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "x86_64-unknown-linux-gnu"
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        "aarch64-unknown-linux-gnu"
    } else {
        "unsupported-target"
    };
    let development = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(format!("zerowall-mcp-proxy-{target}{extension}"));
    if development.is_file() {
        Ok(development)
    } else {
        Err("bundled MCP proxy is unavailable".to_string())
    }
}

fn mcp_proxy_args(python: &std::path::Path, module: &str) -> Vec<String> {
    vec![
        python.to_string_lossy().to_string(),
        "-m".to_string(),
        module.to_string(),
    ]
}

/// Return only host-managed, keyless MCP descriptors for ACP sessions. The
/// same isolated interpreter is shared by OpenCode and ACP; no frontend
/// command or secret is accepted here.
pub(crate) fn acp_mcp_servers(app: &AppHandle) -> Result<Vec<AcpMcpServer>, String> {
    let python = python_bin(app)?;
    if !python.is_file() {
        return Ok(Vec::new());
    }
    let proxy = mcp_proxy_path(app)?;
    let candidates = [
        ("spaceweather", "spaceweather_mcp.server", false),
        ("paper-search", "paper_search_mcp.server", false),
        ("biomcp", "biomcp", false),
        ("open-meteo", "mcp_weather_server", false),
    ];
    let mut result = Vec::new();
    for (name, module, _) in candidates {
        let probe = crate::runtime::quiet_command(&python)
            .args(["-c", &format!("import {module}")])
            .output();
        if !probe.as_ref().is_ok_and(|output| output.status.success()) {
            continue;
        }
        result.push(AcpMcpServer {
            name: name.to_string(),
            command: proxy.to_string_lossy().to_string(),
            args: mcp_proxy_args(&python, module),
            env: if name == "spaceweather" {
                vec![("FASTMCP_SHOW_SERVER_BANNER".to_string(), "false".to_string())]
            } else {
                Vec::new()
            },
        });
    }
    Ok(result)
}

/// Prepare is intentionally idempotent. The existing settings action owns
/// package installation; ACP switching only verifies the app-managed env and
/// does not reinstall packages on every model change.
pub(crate) async fn prepare_acp_mcp(app: &AppHandle) -> Result<(), String> {
    let dir = env_dir(app)?;
    if dir.is_dir() {
        Ok(())
    } else {
        Err("science MCP environment is not initialized".to_string())
    }
}

/// The managed interpreter path if the shared env exists, else None. The
/// frontend derives launch commands (`<python> -m <module> …`) from this.
#[tauri::command]
pub fn science_mcp_python(app: AppHandle) -> Result<Option<String>, String> {
    let py = python_bin(&app)?;
    Ok(py.exists().then(|| py.to_string_lossy().to_string()))
}

/// Provision one open-source MCP package into the shared isolated env with the
/// bundled uv (creating the env on first use), and return the managed Python
/// path to launch it with. First run downloads a managed Python (~tens of MB);
/// installing a package is incremental. Streams progress as `setup-progress`
/// events and fails with a readable error when a download stalls (uv::run_uv).
#[tauri::command]
pub async fn setup_science_mcp(app: AppHandle, package: String) -> Result<String, String> {
    // Guard against a caller sending an arbitrary spec (flags, extra args).
    if !is_safe_package(&package) {
        return Err("invalid package name".into());
    }
    let dir = env_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // Create the venv only when its interpreter is missing. `uv venv` deletes
    // and rewrites the interpreter even with --allow-existing (verified: the
    // inode changes on every run), and on Windows a python.exe that an
    // already-enabled connector's MCP server is running from cannot be
    // replaced — so enabling a SECOND connector always died with "uv venv
    // failed" (#10). An existing interpreter means the shared env is
    // provisioned; `uv pip install` is all the next connector needs.
    let py = python_bin(&app)?;
    if !py.exists() {
        crate::uv::create_venv(&app, "science", &dir).await?;
    }
    crate::uv::run_uv(
        &app,
        "science",
        vec![
            "pip".into(),
            "install".into(),
            "--python".into(),
            py.to_string_lossy().to_string(),
            package,
        ],
        "uv pip install",
    )
    .await?;
    Ok(py.to_string_lossy().to_string())
}

/// A PyPI package name (letters/digits/._-), optionally pinned with `==<version>`.
/// Rejects anything that could smuggle extra pip args or shell metacharacters.
fn is_safe_package(pkg: &str) -> bool {
    let core = pkg.split_once("==").map(|(n, _)| n).unwrap_or(pkg);
    !core.is_empty()
        && !core.starts_with('-')
        && core.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        && pkg.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '='))
}

#[cfg(test)]
mod tests {
    use super::{is_safe_package, mcp_proxy_args};
    use std::path::Path;

    #[test]
    fn accepts_real_package_names_and_pins() {
        assert!(is_safe_package("paper-search-mcp"));
        assert!(is_safe_package("biomcp-python"));
        assert!(is_safe_package("jupyter-mcp-server==0.14.0"));
    }

    #[test]
    fn rejects_flag_and_metacharacter_injection() {
        assert!(!is_safe_package(""));
        assert!(!is_safe_package("--upgrade"));
        assert!(!is_safe_package("pkg; rm -rf /"));
        assert!(!is_safe_package("pkg && echo"));
        assert!(!is_safe_package("pkg --index-url http://evil"));
        assert!(!is_safe_package("pkg\nother"));
    }

    #[test]
    fn mcp_proxy_keeps_python_as_the_child_command() {
        let args = mcp_proxy_args(Path::new("C:/managed/python.exe"), "spaceweather_mcp.server");
        assert_eq!(
            args,
            vec![
                "C:/managed/python.exe".to_string(),
                "-m".to_string(),
                "spaceweather_mcp.server".to_string(),
            ]
        );
    }
}
