use serde::Serialize;

// Releases are published to the SEPARATE public downloads repo (see
// `.github/workflows/build.yml` DOWNLOADS_REPO), not this private source repo.
const RELEASES_ATOM_URL: &str = "https://github.com/ccfwwm/zerowallscience-releases/releases.atom";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInfo {
    pub version: String,
    pub url: String,
    pub name: Option<String>,
    pub published_at: Option<String>,
}

#[tauri::command]
pub async fn latest_release() -> Result<ReleaseInfo, String> {
    tauri::async_runtime::spawn_blocking(fetch_latest_release)
        .await
        .map_err(|e| format!("update check task failed: {e}"))?
}

fn fetch_latest_release() -> Result<ReleaseInfo, String> {
    let body = reqwest::blocking::Client::builder()
        .user_agent("ZeroWall Science update checker")
        .build()
        .map_err(|e| format!("could not create HTTP client: {e}"))?
        .get(RELEASES_ATOM_URL)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("could not fetch GitHub releases feed: {e}"))?
        .text()
        .map_err(|e| format!("could not read GitHub releases feed: {e}"))?;
    parse_latest_release(&body)
}

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
    })
}

fn between<'a>(s: &'a str, start: &str, end: &str) -> Option<&'a str> {
    let from = s.find(start)? + start.len();
    let to = s[from..].find(end)? + from;
    Some(&s[from..to])
}

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
            },
        );
    }
}
