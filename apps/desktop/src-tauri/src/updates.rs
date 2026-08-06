use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::Manager;

// Releases are published to the SEPARATE public downloads repo (see
// `.github/workflows/build.yml` DOWNLOADS_REPO), not this private source repo.
const RELEASES_API_URL: &str = "https://api.github.com/repos/ccfwwm/zerowallscience-releases/releases/latest";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInfo {
    pub version: String,
    pub url: String,
    pub name: Option<String>,
    pub published_at: Option<String>,
    pub asset_url: Option<String>,
    pub asset_name: Option<String>,
    pub asset_sha256: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApiRelease {
    tag_name: Option<String>,
    html_url: Option<String>,
    name: Option<String>,
    published_at: Option<String>,
    assets: Vec<ApiAsset>,
}

#[derive(Debug, Deserialize)]
struct ApiAsset {
    name: String,
    browser_download_url: String,
    digest: Option<String>,
}

#[tauri::command]
pub async fn latest_release() -> Result<ReleaseInfo, String> {
    tauri::async_runtime::spawn_blocking(fetch_latest_release)
        .await
        .map_err(|e| format!("update check task failed: {e}"))?
}

fn fetch_latest_release() -> Result<ReleaseInfo, String> {
    let text = reqwest::blocking::Client::builder()
        .user_agent("ZeroWall Science update checker")
        .build()
        .map_err(|e| format!("could not create HTTP client: {e}"))?
        .get(RELEASES_API_URL)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("could not fetch GitHub releases feed: {e}"))?
        .text()
        .map_err(|e| format!("could not read GitHub releases response: {e}"))?;
    let body: ApiRelease = serde_json::from_str(&text)
        .map_err(|e| format!("could not parse GitHub releases response: {e}"))?;
    let version = body.tag_name.filter(|value| !value.trim().is_empty()).ok_or("GitHub response had no release tag")?;
    let url = body.html_url.filter(|value| !value.trim().is_empty()).ok_or("GitHub response had no release URL")?;
    let asset = select_asset(&body.assets);
    Ok(ReleaseInfo {
        version,
        url,
        name: body.name,
        published_at: body.published_at,
        asset_url: asset.map(|value| value.browser_download_url.clone()),
        asset_name: asset.map(|value| value.name.clone()),
        asset_sha256: asset.and_then(|value| value.digest.clone()).and_then(|digest| digest.strip_prefix("sha256:").map(str::to_owned)),
    })
}

fn select_asset(assets: &[ApiAsset]) -> Option<&ApiAsset> {
    let preferred = if cfg!(windows) {
        ["-setup.exe", ".exe", ".msi"]
    } else if cfg!(target_os = "macos") {
        [".dmg", ".app.tar.gz", ".tar.gz"]
    } else {
        [".deb", ".rpm", ".AppImage"]
    };
    preferred.iter().find_map(|suffix| assets.iter().find(|asset| asset.name.ends_with(suffix)))
}

#[tauri::command]
pub async fn download_update(app: tauri::AppHandle, url: String, filename: String, sha256: Option<String>) -> Result<String, String> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| "update URL is invalid".to_string())?;
    if parsed.scheme() != "https" || parsed.host_str().is_none() {
        return Err("updates require an HTTPS URL".to_string());
    }
    let safe_name = PathBuf::from(filename)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty() && *name != "." && *name != "..")
        .ok_or_else(|| "update filename is invalid".to_string())?
        .to_string();
    let dir = app.path().app_data_dir().map_err(|error| format!("resolve update directory: {error}"))?.join("updates");
    std::fs::create_dir_all(&dir).map_err(|error| format!("create update directory: {error}"))?;
    let staging = dir.join(format!("{safe_name}.download"));
    let target = dir.join(&safe_name);
    let body = tauri::async_runtime::spawn_blocking(move || {
        reqwest::blocking::Client::builder()
            .user_agent("ZeroWall Science updater")
            .build()
            .map_err(|error| format!("create update client: {error}"))?
            .get(parsed)
            .send()
            .and_then(|response| response.error_for_status())
            .map_err(|error| format!("download update: {error}"))?
            .bytes()
            .map_err(|error| format!("read update: {error}"))
    }).await.map_err(|error| format!("update download task failed: {error}"))??;
    if let Some(expected) = sha256.filter(|value| !value.trim().is_empty()) {
        let mut digest = Sha256::new();
        digest.update(&body);
        let actual = digest.finalize().iter().map(|byte| format!("{byte:02x}")).collect::<String>();
        if actual != expected.trim().trim_start_matches("sha256:") {
            return Err(format!("update SHA-256 mismatch: expected {}, got {}", expected.trim(), actual));
        }
    }
    std::fs::write(&staging, &body).map_err(|error| format!("stage update: {error}"))?;
    if target.exists() { std::fs::remove_file(&target).map_err(|error| format!("replace downloaded update: {error}"))?; }
    std::fs::rename(&staging, &target).map_err(|error| format!("commit downloaded update: {error}"))?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn open_downloaded_update(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let updates_dir = app.path().app_data_dir().map_err(|error| format!("resolve update directory: {error}"))?.join("updates").canonicalize().map_err(|error| format!("resolve update directory: {error}"))?;
    let target = PathBuf::from(path).canonicalize().map_err(|error| format!("resolve downloaded update: {error}"))?;
    if !target.starts_with(&updates_dir) || !target.is_file() {
        return Err("downloaded update path is outside the update directory".to_string());
    }
    #[cfg(windows)]
    { std::process::Command::new(&target).spawn().map_err(|error| format!("open installer: {error}"))?; }
    #[cfg(target_os = "macos")]
    { std::process::Command::new("open").arg(&target).spawn().map_err(|error| format!("open installer: {error}"))?; }
    #[cfg(all(unix, not(target_os = "macos")))]
    { std::process::Command::new("xdg-open").arg(&target).spawn().map_err(|error| format!("open installer: {error}"))?; }
    Ok(())
}

#[cfg(test)]
fn parse_latest_release(atom: &str) -> Result<ReleaseInfo, String> {
    let entry =
        between(atom, "<entry>", "</entry>").ok_or("GitHub releases feed had no entries")?;
    let url = attr_value(entry, "link", "href")
        .filter(|u| u.contains("/releases/tag/"))
        .ok_or("GitHub releases feed entry had no release link")?;
    let version = url
        .rsplit("/releases/tag/")
        .next()
        .and_then(|s| s.split(['?', '#']).next())
        .filter(|s| !s.trim().is_empty())
        .ok_or("GitHub releases feed entry had no release tag")?
        .trim()
        .to_string();
    let name = between(entry, "<title>", "</title>").map(decode_xml_text);
    let published_at = between(entry, "<updated>", "</updated>").map(|s| s.trim().to_string());
    Ok(ReleaseInfo {
        version,
        url,
        name,
        published_at,
        asset_url: None,
        asset_name: None,
        asset_sha256: None,
    })
}

#[cfg(test)]
fn between<'a>(s: &'a str, start: &str, end: &str) -> Option<&'a str> {
    let from = s.find(start)? + start.len();
    let to = s[from..].find(end)? + from;
    Some(&s[from..to])
}

#[cfg(test)]
fn attr_value(entry: &str, tag: &str, attr: &str) -> Option<String> {
    let needle = format!("<{tag} ");
    let mut rest = entry;
    while let Some(pos) = rest.find(&needle) {
        let tag_body = &rest[pos..rest[pos..].find('>')? + pos];
        let attr_needle = format!("{attr}=\"");
        if let Some(attr_pos) = tag_body.find(&attr_needle) {
            let value_start = attr_pos + attr_needle.len();
            let value_end = tag_body[value_start..].find('"')? + value_start;
            return Some(decode_xml_text(&tag_body[value_start..value_end]));
        }
        rest = &rest[pos + needle.len()..];
    }
    None
}

#[cfg(test)]
fn decode_xml_text(s: &str) -> String {
    s.trim()
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_first_release_entry_from_atom() {
        let atom = r#"
<feed>
  <entry>
    <updated>2026-07-09T13:59:12Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/ccfwwm/zerowallscience-releases/releases/tag/v0.1.8"/>
    <title>ZeroWall Science v0.1.8</title>
  </entry>
</feed>
"#;

        assert_eq!(
            parse_latest_release(atom).unwrap(),
            ReleaseInfo {
                version: "v0.1.8".into(),
                url: "https://github.com/ccfwwm/zerowallscience-releases/releases/tag/v0.1.8".into(),
                name: Some("ZeroWall Science v0.1.8".into()),
                published_at: Some("2026-07-09T13:59:12Z".into()),
                asset_url: None,
                asset_name: None,
                asset_sha256: None,
            },
        );
    }

    #[test]
    fn selects_a_platform_installer_asset() {
        let assets = vec![
            ApiAsset { name: "ZeroWall.tar.gz".into(), browser_download_url: "https://example.invalid/a".into(), digest: None },
            ApiAsset { name: "ZeroWall_x64-setup.exe".into(), browser_download_url: "https://example.invalid/b".into(), digest: Some("sha256:abc".into()) },
        ];
        let selected = select_asset(&assets);
        if cfg!(windows) {
            assert_eq!(selected.map(|asset| asset.name.as_str()), Some("ZeroWall_x64-setup.exe"));
        }
    }
}
