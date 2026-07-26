// Recursive, non-clobbering copy of a bundled resource tree into the workspace.
//
// This file used to also own `install_example`, the command behind the "Explore
// an example project" row on the welcome screen. Both the row and the command
// are gone: the starters now lead with what the app does rather than with five
// bundled datasets, and the datasets themselves are no longer shipped in the
// installer. `examples/` stays in the repo, where CI still runs each one to
// prove the analyses reproduce.
use std::path::Path;

/// Copy `src` into `dst` recursively WITHOUT overwriting existing files — a
/// re-deployed tree must never clobber the user's edited copy.
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

#[cfg(test)]
mod tests {
    use super::copy_missing;

    #[test]
    fn copies_recursively_but_never_overwrites() {
        let base = std::env::temp_dir().join(format!("zerowall-example-{}", std::process::id()));
        let src = base.join("src");
        let dst = base.join("dst");
        std::fs::create_dir_all(src.join("data")).unwrap();
        std::fs::write(src.join("README.md"), "bundled readme").unwrap();
        std::fs::write(src.join("data/x.csv"), "a,b
1,2
").unwrap();

        copy_missing(&src, &dst).unwrap();
        assert_eq!(std::fs::read_to_string(dst.join("data/x.csv")).unwrap(), "a,b
1,2
");

        // The user edits a file; re-copying must keep the edit.
        std::fs::write(dst.join("README.md"), "user edited").unwrap();
        copy_missing(&src, &dst).unwrap();
        assert_eq!(std::fs::read_to_string(dst.join("README.md")).unwrap(), "user edited");

        let _ = std::fs::remove_dir_all(base);
    }

    /// No `examples/` tree may be bundled: the installer must not carry sample
    /// datasets, and a stray entry would silently add megabytes back.
    #[test]
    fn no_example_datasets_are_bundled() {
        let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let config: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(manifest.join("tauri.conf.json")).unwrap(),
        )
        .unwrap();
        let resources = config["bundle"]["resources"]
            .as_object()
            .expect("bundle.resources must be an object");

        for (src, dst) in resources {
            let dst = dst.as_str().unwrap_or_default();
            assert!(
                !src.contains("/examples/") && !dst.starts_with("examples/"),
                "bundle.resources maps `{src}` to `{dst}`; \
example datasets are deliberately not shipped in the installer"
            );
        }
    }
}
