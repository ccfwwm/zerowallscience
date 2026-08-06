use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{Map, Value};
use tauri::{AppHandle, Manager};

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve workflow data directory: {error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("create workflow data directory: {error}"))?;
    Ok(dir.join("workflow-runs.json"))
}

fn read_runs(path: &Path) -> Result<Map<String, Value>, String> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Map::new()),
        Err(error) => return Err(format!("read workflow runs: {error}")),
    };
    serde_json::from_str(&text).map_err(|error| format!("parse workflow runs: {error}"))
}

fn write_runs(path: &Path, runs: &Map<String, Value>) -> Result<(), String> {
    let temp = path.with_extension("json.tmp");
    let text = serde_json::to_vec_pretty(runs).map_err(|error| format!("serialize workflow runs: {error}"))?;
    fs::write(&temp, text).map_err(|error| format!("write workflow staging file: {error}"))?;
    match fs::rename(&temp, path) {
        Ok(()) => Ok(()),
        Err(first_error) if path.exists() => {
            // Windows cannot rename over an existing file. Keep the staged
            // write and replace the old snapshot only after serialization has
            // succeeded; a failed replacement never corrupts the old JSON.
            fs::remove_file(path).map_err(|error| format!("replace workflow runs: {error}"))?;
            fs::rename(&temp, path).map_err(|error| {
                format!("commit workflow runs after replacement ({first_error}): {error}")
            })
        }
        Err(error) => Err(format!("commit workflow runs: {error}")),
    }
}

fn contains_secret_key(value: &Value) -> bool {
    match value {
        Value::Object(map) => map.iter().any(|(key, value)| {
            let normalized = key
                .chars()
                .filter(|character| character.is_ascii_alphanumeric())
                .flat_map(char::to_lowercase)
                .collect::<String>();
            normalized.contains("apikey")
                || normalized.contains("token")
                || normalized.contains("password")
                || normalized.contains("secret")
                || normalized.contains("credential")
                || contains_secret_key(value)
        }),
        Value::Array(values) => values.iter().any(contains_secret_key),
        _ => false,
    }
}

#[tauri::command]
pub fn workflow_run_save(app: AppHandle, run_id: String, run: Value) -> Result<(), String> {
    if run_id.trim().is_empty() {
        return Err("workflow run id is required".to_owned());
    }
    if contains_secret_key(&run) {
        return Err("workflow state cannot contain credentials or tokens".to_owned());
    }
    let path = store_path(&app)?;
    let mut runs = read_runs(&path)?;
    runs.insert(run_id, run);
    write_runs(&path, &runs)
}

#[tauri::command]
pub fn workflow_run_load(app: AppHandle, run_id: String) -> Result<Option<Value>, String> {
    Ok(read_runs(&store_path(&app)?)?.remove(&run_id))
}

#[tauri::command]
pub fn workflow_runs_incomplete(app: AppHandle) -> Result<Vec<Value>, String> {
    let runs = read_runs(&store_path(&app)?)?;
    Ok(runs
        .into_values()
        .filter(|run| !matches!(run.get("state").and_then(Value::as_str), Some("completed" | "cancelled")))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::contains_secret_key;
    use serde_json::json;

    #[test]
    fn rejects_secret_shaped_workflow_fields() {
        assert!(contains_secret_key(&json!({ "binding": { "credentialRef": "keychain:one" } })));
        assert!(contains_secret_key(&json!({ "input": [{ "apiToken": "nope" }] })));
        assert!(contains_secret_key(&json!({ "api_key": "nope" })));
    }

    #[test]
    fn permits_model_and_project_snapshots() {
        assert!(!contains_secret_key(&json!({
            "binding": { "engineId": "codex", "modelId": "gpt-5", "projectRoot": "C:/workspace" },
            "mcpAllowList": ["filesystem.read"],
            "skillsSnapshot": [{ "id": "review", "sha256": "abc" }]
        })));
    }
}
