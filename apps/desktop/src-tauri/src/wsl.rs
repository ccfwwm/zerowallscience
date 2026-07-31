// WSL execution contexts (Windows only). A WSL distribution is exposed to the
// rest of the app as a remote-compute "machine" whose host is `wsl:<distro>`
// (see compute.rs, which dispatches probe/run/cancel through `wsl.exe` for
// those hosts). This module only discovers the installed distributions; adding
// one as a saved machine goes through the same compute.json registry as SSH.
//
// Everything here is a no-op off Windows: `list_wsl_distros` returns an empty
// list, so the UI simply shows nothing to import.

/// Names of the installed WSL distributions, in `wsl -l -q` order.
///
/// Reads the registry first (see `wsl_registered`) so we never spawn `wsl.exe`
/// on a machine without WSL — the bundled App Execution Alias stub would pop an
/// interactive installer that can block for up to a minute.
pub async fn list_wsl_distros() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        if !wsl_registered() {
            return Ok(Vec::new());
        }
        // `-l -q`: names only, one per line, no header. Output is UTF-16LE.
        let output = crate::runtime::quiet_command("wsl.exe")
            .args(["-l", "-q"])
            .output()
            .map_err(|e| format!("failed to run wsl.exe: {e}"))?;
        if !output.status.success() {
            let stderr = decode_wsl_output(&output.stderr);
            return Err(format!("wsl.exe -l -q failed: {}", stderr.trim()));
        }
        Ok(parse_distro_names(&output.stdout))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(Vec::new())
    }
}

/// True when at least one WSL distribution is registered. Reads the registry
/// only — the `Lxss` key exists exactly when a distribution is registered, so
/// it doubles as "is there anything to list" and lets us avoid spawning the
/// install stub. See `list_wsl_distros`.
#[cfg(target_os = "windows")]
fn wsl_registered() -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Lxss")
        .is_ok()
}

/// Parse `wsl -l -q` output into distribution names. Tolerant of UTF-16LE (the
/// default), a BOM, CRLF, stray NULs, a leading `*` default marker, and a
/// trailing `(Default)` — none of which `-q` should emit, but older builds do.
/// De-duplicates while preserving order.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn parse_distro_names(output: &[u8]) -> Vec<String> {
    let text = decode_wsl_output(output);
    let mut out: Vec<String> = Vec::new();
    for raw in text.lines() {
        let mut line = raw.trim_matches('\0').trim();
        line = line.trim_start_matches('\u{feff}').trim();
        if line.is_empty() || line.contains("Windows Subsystem for Linux") {
            continue;
        }
        if let Some(stripped) = line.strip_prefix('*') {
            line = stripped.trim();
        }
        if let Some(stripped) = line.strip_suffix("(Default)") {
            line = stripped.trim();
        }
        if line.is_empty() {
            continue;
        }
        let name = line.to_string();
        if !out.contains(&name) {
            out.push(name);
        }
    }
    out
}

/// Decode `wsl.exe` output: UTF-16LE (its default) when it looks like it, else
/// UTF-8 with NULs stripped.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn decode_wsl_output(output: &[u8]) -> String {
    if output.starts_with(&[0xff, 0xfe]) || looks_like_utf16le(output) {
        let units: Vec<u16> = output
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16_lossy(&units)
    } else {
        String::from_utf8_lossy(output).replace('\0', "")
    }
}

/// Heuristic: UTF-16LE ASCII text has a NUL in most odd byte positions.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn looks_like_utf16le(output: &[u8]) -> bool {
    if output.len() < 4 {
        return false;
    }
    let null_odd = output.iter().skip(1).step_by(2).filter(|b| **b == 0).count();
    null_odd >= output.len() / 4
}

/// Discover the installed WSL distributions (empty off Windows / without WSL).
#[tauri::command]
pub async fn list_wsl_distros_cmd() -> Result<Vec<String>, String> {
    list_wsl_distros().await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn utf16le(text: &str) -> Vec<u8> {
        let mut bytes = Vec::new();
        for unit in text.encode_utf16() {
            bytes.extend(unit.to_le_bytes());
        }
        bytes
    }

    #[test]
    fn parses_utf16le_names_and_dedupes() {
        // `wsl -l -q` on a real machine emits UTF-16LE, one name per line.
        let bytes = utf16le("\u{feff}Ubuntu-22.04\r\nDebian\r\nUbuntu-22.04\r\n");
        assert_eq!(parse_distro_names(&bytes), vec!["Ubuntu-22.04", "Debian"]);
    }

    #[test]
    fn parses_utf8_and_strips_default_markers() {
        let out = b"* Ubuntu (Default)\r\nDebian\r\n\r\n";
        assert_eq!(parse_distro_names(out), vec!["Ubuntu", "Debian"]);
    }

    #[test]
    fn ignores_header_line() {
        let out = b"Windows Subsystem for Linux Distributions:\r\nUbuntu\r\n";
        assert_eq!(parse_distro_names(out), vec!["Ubuntu"]);
    }

    #[test]
    fn empty_output_is_empty_list() {
        assert!(parse_distro_names(b"").is_empty());
        assert!(parse_distro_names(&utf16le("\r\n")).is_empty());
    }

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn list_is_empty_off_windows() {
        assert!(list_wsl_distros().await.unwrap().is_empty());
    }
}
