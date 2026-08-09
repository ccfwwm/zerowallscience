// Curated open-source science MCP connectors (P1-2). We do NOT reimplement
// literature/database access — we one-click provision existing open-source MCP
// servers (e.g. paper-search-mcp, biomcp) into a shared ISOLATED uv env under
// app data (the user's Python is untouched), then register them in OpenCode's
// config. The frontend holds the curated catalog; here we just install a pip
// package and report the managed interpreter path.
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use zerowall_acp::AcpMcpServer;
use zerowall_acp_host::{mcp::McpToolEffect, McpToolGrantSnapshot};

/// The ACP adapters own their MCP children, so the host's `CREATE_NO_WINDOW`
/// flag does not propagate to Python. Route MCP stdio through our GUI-subsystem
/// proxy, which starts the real child without creating a console window.
pub(crate) fn mcp_proxy_path(app: &AppHandle) -> Result<PathBuf, String> {
    let extension = if cfg!(windows) { ".exe" } else { "" };
    if let Some(root) = crate::environment_update::active_environment_root(app)? {
        for candidate in [
            root.join(format!("zerowall-mcp-proxy{extension}")),
            root.join("binaries")
                .join(format!("zerowall-mcp-proxy{extension}")),
        ] {
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }
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

pub(crate) fn restrict_acp_mcp_server(
    mut server: AcpMcpServer,
    project_root: &Path,
    session_id: &str,
    frame_id: &str,
    grants: &[McpToolGrantSnapshot],
) -> AcpMcpServer {
    let child_args = std::mem::take(&mut server.args);
    let project_root = project_root.to_string_lossy().replace('\\', "/");
    let mutation_lock =
        project_root.trim_end_matches('/').to_owned() + "/.zerowall/mcp-mutation.lock";
    server.args = vec![
        "--server-id".into(),
        server.name.clone(),
        "--project-root".into(),
        project_root,
        "--session-id".into(),
        session_id.into(),
        "--frame-id".into(),
        frame_id.into(),
        "--mutation-lock".into(),
        mutation_lock,
        "--".into(),
    ];
    let server_grants = grants.iter().filter(|grant| grant.server_id == server.name);
    let mut grant_args = Vec::new();
    for grant in server_grants {
        grant_args.push("--tool".to_owned());
        grant_args.push(format!(
            "{}={}",
            grant.tool_id,
            match grant.effect {
                McpToolEffect::ReadOnly => "read-only",
                McpToolEffect::Mutation => "mutation",
            }
        ));
    }
    if grant_args.is_empty() {
        grant_args.extend(["--discover-read-only".to_owned(), "true".to_owned()]);
    }
    // Keep the bridge's `--` separator before the child command, but put the
    // exact tool grants before it so unknown tools are rejected by default.
    let separator = server.args.iter().position(|arg| arg == "--").unwrap_or(0);
    let child = server.args.split_off(separator);
    server.args.extend(grant_args);
    server.args.extend(child);
    server.args.extend(child_args);
    server
}

/// The managed interpreter path if the shared env exists, else None. The
/// frontend derives launch commands (`<python> -m <module> …`) from this.
#[tauri::command]
pub fn science_mcp_python(app: AppHandle) -> Result<Option<String>, String> {
    Ok(integrated_python(&app)?.map(|python| python.to_string_lossy().into_owned()))
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
    let python = integrated_python(&app)?
        .ok_or_else(|| "install the base environment before enabling MCP servers".to_string())?;
    if package_is_installed(&python, &package) {
        Ok(python.to_string_lossy().into_owned())
    } else {
        Err(format!(
            "{package} is missing from the installed base environment; update the base environment and retry"
        ))
    }
}

/// A PyPI package name (letters/digits/._-), optionally pinned with `==<version>`.
/// Rejects anything that could smuggle extra pip args or shell metacharacters.
fn is_safe_package(pkg: &str) -> bool {
    let core = pkg.split_once("==").map(|(n, _)| n).unwrap_or(pkg);
    !core.is_empty()
        && !core.starts_with('-')
        && core
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        && pkg
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '='))
}

pub(crate) fn integrated_python_from_root(root: &Path) -> PathBuf {
    #[cfg(windows)]
    return root.join("mcp-python").join("python.exe");
    #[cfg(not(windows))]
    root.join("mcp-python").join("bin").join("python3")
}

pub(crate) fn integrated_python(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    Ok(crate::environment_update::active_environment_root(app)?
        .map(|root| integrated_python_from_root(&root))
        .filter(|python| python.is_file()))
}

pub(crate) fn python_bin(app: &AppHandle) -> Result<PathBuf, String> {
    integrated_python(app)?
        .ok_or_else(|| "the base environment is not installed".to_string())
}

pub(crate) fn package_is_installed(python: &Path, package: &str) -> bool {
    let script = "import importlib.metadata as m,sys; m.distribution(sys.argv[1])";
    crate::runtime::quiet_command(python)
        .args(["-s", "-c", script, package])
        .output()
        .is_ok_and(|output| output.status.success())
}

#[cfg(test)]
mod tests {
    use super::{integrated_python_from_root, is_safe_package, restrict_acp_mcp_server};
    use std::path::Path;
    use zerowall_acp::AcpMcpServer;

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
    fn integrated_environment_python_has_a_stable_portable_layout() {
        let root = Path::new("C:/environment/current");
        let python = integrated_python_from_root(root);
        if cfg!(windows) {
            assert_eq!(python, root.join("mcp-python").join("python.exe"));
        } else {
            assert_eq!(python, root.join("mcp-python").join("bin").join("python3"));
        }
    }

    #[test]
    fn restricted_proxy_descriptor_carries_session_identity_and_tool_policy() {
        let server = restrict_acp_mcp_server(
            AcpMcpServer {
                name: "papers".into(),
                command: "zerowall-mcp-proxy.exe".into(),
                args: vec!["python.exe".into(), "-m".into(), "papers".into()],
                env: Vec::new(),
            },
            Path::new("C:/science"),
            "session-1",
            "frame-1",
            &[zerowall_acp_host::McpToolGrantSnapshot {
                server_id: "papers".into(),
                tool_id: "search".into(),
                effect: zerowall_acp_host::mcp::McpToolEffect::ReadOnly,
            }],
        );

        assert_eq!(
            server.args,
            vec![
                "--server-id",
                "papers",
                "--project-root",
                "C:/science",
                "--session-id",
                "session-1",
                "--frame-id",
                "frame-1",
                "--mutation-lock",
                "C:/science/.zerowall/mcp-mutation.lock",
                "--tool",
                "search=read-only",
                "--",
                "python.exe",
                "-m",
                "papers",
            ]
        );
    }

    #[test]
    fn restricted_proxy_can_discover_tools_when_the_session_has_server_level_access() {
        let server = restrict_acp_mcp_server(
            AcpMcpServer {
                name: "papers".into(),
                command: "zerowall-mcp-proxy.exe".into(),
                args: vec!["python.exe".into(), "-m".into(), "papers".into()],
                env: Vec::new(),
            },
            Path::new("C:/science"),
            "session-1",
            "frame-1",
            &[],
        );
        assert!(server
            .args
            .windows(2)
            .any(|pair| pair == ["--discover-read-only", "true"]));
    }
}
