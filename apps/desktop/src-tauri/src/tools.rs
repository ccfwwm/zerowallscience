// Detects which scientific/runtime tools are available on the user's system.
// ZeroWall Science does not bundle Python/R/Jupyter; OpenCode's shell tool uses whatever
// is installed. This surfaces that to the UI honestly.
use serde::Serialize;

#[derive(Serialize)]
pub struct ToolStatus {
    name: String,
    found: bool,
    version: Option<String>,
}

fn probe(name: &str, bin: &str, version_arg: &str) -> ToolStatus {
    // Search the SAME enriched PATH the kernel and the agent's shell run
    // under — a GUI-launched app has a minimal PATH, and probing with it
    // misreported the user's anaconda/homebrew tools as missing.
    let path = Some(crate::runtime::enriched_path());
    probe_with_path(name, bin, version_arg, path.as_deref())
}

fn probe_with_path(name: &str, bin: &str, version_arg: &str, path: Option<&str>) -> ToolStatus {
    let mut cmd = crate::runtime::quiet_command(bin);
    cmd.arg(version_arg);
    if let Some(p) = path {
        cmd.env("PATH", p);
    }
    let out = cmd.output();
    match out {
        // `--version` must succeed — the Windows Store python alias runs,
        // prints an install hint, and exits non-zero; output alone is not
        // evidence the tool is installed.
        Ok(o) if o.status.success() => {
            let text = if !o.stdout.is_empty() { o.stdout } else { o.stderr };
            let version = String::from_utf8_lossy(&text)
                .lines()
                .next()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            ToolStatus { name: name.to_string(), found: true, version }
        }
        _ => ToolStatus { name: name.to_string(), found: false, version: None },
    }
}

#[cfg(test)]
mod tests {

    // A Finder-launched app has a minimal PATH, so probing with the plain
    // environment misreported the user's anaconda/homebrew tools as missing —
    // detection must search the SAME enriched PATH the kernel and agent use.
    #[cfg(unix)]
    #[test]
    fn probe_searches_the_given_path() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("os-tools-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let tool = dir.join("mytool");
        std::fs::write(&tool, "#!/bin/sh\necho mytool 9.9\n").unwrap();
        std::fs::set_permissions(&tool, std::fs::Permissions::from_mode(0o755)).unwrap();

        let found = probe_with_path("MyTool", "mytool", "--version", dir.to_str());
        assert!(found.found, "tool on the provided PATH must be found");
        assert_eq!(found.version.as_deref(), Some("mytool 9.9"));

        let missing = probe_with_path("MyTool", "mytool", "--version", Some("/nonexistent-dir"));
        assert!(!missing.found, "tool off the provided PATH must not be found");

        let _ = std::fs::remove_dir_all(&dir);
    }

    // The Windows Store `python.exe` alias prints an install hint and exits
    // non-zero — output alone must not count as "found".
    #[cfg(unix)]
    #[test]
    fn probe_rejects_a_tool_that_fails_version() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("os-tools-fake-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let tool = dir.join("faketool");
        std::fs::write(&tool, "#!/bin/sh\necho 'not really installed' >&2\nexit 9\n").unwrap();
        std::fs::set_permissions(&tool, std::fs::Permissions::from_mode(0o755)).unwrap();

        let status = probe_with_path("FakeTool", "faketool", "--version", dir.to_str());
        assert!(!status.found, "a tool that exits non-zero on --version must not be found");

        let _ = std::fs::remove_dir_all(&dir);
    }
}

/// Report availability of the tools relevant to a research workflow. `async`:
/// six serial process probes take seconds on Windows and ran on the UI thread
/// at startup — a big part of the "app is sluggish right after opening" bug.
#[tauri::command(async)]
pub fn detect_tools() -> Vec<ToolStatus> {
    let python = {
        let p3 = probe("Python", "python3", "--version");
        if p3.found { p3 } else { probe("Python", "python", "--version") }
    };
    vec![
        python,
        probe("R", "Rscript", "--version"),
        probe("Node.js", "node", "--version"),
        probe("uv", "uv", "--version"),
        probe("Jupyter", "jupyter", "--version"),
        probe("Git", "git", "--version"),
    ]
}
