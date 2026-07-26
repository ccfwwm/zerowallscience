// Built-in example projects (P0-1 / P1-1): real, small datasets bundled as
// Tauri resources and copied into the workspace on demand, so the agent runs a
// genuine analysis on genuine data — including a non-bio one (climate-trends).
use std::path::Path;
use tauri::{path::BaseDirectory, AppHandle, Manager};

use crate::runtime::workspace_dir;

/// Bundled example projects; the command rejects anything else. Every name here
/// needs a matching `bundle.resources` entry in `tauri.conf.json`, or
/// `install_example` fails at runtime with "example not bundled in this build".
/// `bundle_resources_cover_every_example` is the test that enforces it.
const EXAMPLES: &[&str] = &[
    "climate-trends",
    "crispr-screen",
    "enzyme-engineering",
    "extremophile",
    "immunotherapy",
];

/// Copy `src` into `dst` recursively WITHOUT overwriting existing files — a
/// re-installed example must never clobber the user's edited copy.
pub(crate) fn copy_missing(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_missing(&entry.path(), &to)?;
        } else if !to.exists() {
            std::fs::copy(entry.path(), &to)?;
        }
    }
    Ok(())
}

/// Copy a bundled example project into the workspace (idempotent, never
/// overwrites) and return its workspace-relative directory name.
#[tauri::command(async)]
pub fn install_example(app: AppHandle, name: String) -> Result<String, String> {
    if !EXAMPLES.contains(&name.as_str()) {
        return Err(format!("unknown example: {name}"));
    }
    let src = app
        .path()
        .resolve(format!("examples/{name}"), BaseDirectory::Resource)
        .map_err(|e| format!("example resource missing: {e}"))?;
    if !src.is_dir() {
        return Err("example not bundled in this build".into());
    }
    let dst = workspace_dir(&app)?.join(&name);
    copy_missing(&src, &dst).map_err(|e| format!("example install failed: {e}"))?;
    Ok(name)
}

#[cfg(test)]
mod tests {
    use super::{copy_missing, EXAMPLES};

    #[test]
    fn copies_recursively_but_never_overwrites() {
        let base = std::env::temp_dir().join(format!("zerowall-example-{}", std::process::id()));
        let src = base.join("src");
        let dst = base.join("dst");
        std::fs::create_dir_all(src.join("data")).unwrap();
        std::fs::write(src.join("README.md"), "bundled readme").unwrap();
        std::fs::write(src.join("data/x.csv"), "a,b\n1,2\n").unwrap();

        copy_missing(&src, &dst).unwrap();
        assert_eq!(std::fs::read_to_string(dst.join("data/x.csv")).unwrap(), "a,b\n1,2\n");

        // The user edits a file; re-installing must keep the edit.
        std::fs::write(dst.join("README.md"), "user edited").unwrap();
        copy_missing(&src, &dst).unwrap();
        assert_eq!(std::fs::read_to_string(dst.join("README.md")).unwrap(), "user edited");

        let _ = std::fs::remove_dir_all(base);
    }

    /// An example in `EXAMPLES` with no `bundle.resources` entry compiles fine
    /// and then fails at runtime for the user. Catch it here instead.
    #[test]
    fn bundle_resources_cover_every_example() {
        let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let config: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(manifest.join("tauri.conf.json")).unwrap(),
        )
        .unwrap();
        let resources = config["bundle"]["resources"]
            .as_object()
            .expect("bundle.resources must be an object");

        for name in EXAMPLES {
            let src = format!("../../../examples/{name}");
            let dst = format!("examples/{name}/");
            assert_eq!(
                resources.get(&src).and_then(|v| v.as_str()),
                Some(dst.as_str()),
                "example `{name}` is in EXAMPLES but tauri.conf.json has no \
                 bundle.resources entry mapping `{src}` to `{dst}`; \
                 install_example would fail with \"example not bundled in this build\""
            );
            assert!(
                manifest.join("../../..").join("examples").join(name).is_dir(),
                "example `{name}` is in EXAMPLES but examples/{name}/ does not exist"
            );
        }
    }
}
