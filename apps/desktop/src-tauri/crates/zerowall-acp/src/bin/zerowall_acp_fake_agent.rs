use std::io::{BufRead, Write};
use std::process::{Command, Stdio};

use serde_json::{json, Value};

fn main() {
    let mode = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "normal".to_string());
    let _process_tree = (mode == "process-tree").then(spawn_process_tree);
    if mode == "normal-stderr" {
        eprintln!("ordinary success stderr must stay internal");
    }
    if mode == "environment-check" {
        let name = std::env::var("ZEROWALL_FAKE_CHECK_NAME").expect("environment name");
        let state = if std::env::var_os(name).is_some() {
            "present"
        } else {
            "missing"
        };
        eprintln!("route_state={state}");
        std::process::exit(23);
    }

    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout().lock();
    let mut pending_prompt = None;

    for line in stdin.lock().lines() {
        let Ok(line) = line else {
            break;
        };
        let Ok(message) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let method = message.get("method").and_then(Value::as_str);
        let id = message.get("id").cloned();

        match method {
            Some("initialize")
                if mode == "initialize-hang"
                    || mode == "process-tree"
                    || mode == "stderr-initialize-hang" =>
            {
                if mode == "stderr-initialize-hang" {
                    write_handshake_stderr("initialize timeout ordinary tail");
                }
            }
            Some("initialize") => respond(
                &mut stdout,
                id,
                json!({"protocolVersion": 1, "agentCapabilities": {}}),
            ),
            Some("session/new") if mode == "session-error" => respond_error(
                &mut stdout,
                id,
                -32000,
                "secret-in-message-must-not-surface",
            ),
            Some("session/new") if mode == "stderr-session-error" => {
                write_handshake_stderr("session failure ordinary tail");
                respond_error(&mut stdout, id, -32000, "adapter secret must not surface");
            }
            Some("session/new") if mode == "require-isolated-settings" => {
                let isolated = message
                    .pointer("/params/_meta/claudeCode/options/settingSources")
                    .and_then(Value::as_array)
                    .is_some_and(Vec::is_empty);
                if isolated {
                    respond(&mut stdout, id, json!({"sessionId": "fake-session"}));
                } else {
                    respond_error(&mut stdout, id, -32000, "settings sources were inherited");
                }
            }
            Some("session/new") if mode == "assert-mcp" => {
                let servers = message
                    .pointer("/params/mcpServers")
                    .and_then(Value::as_array);
                let valid = servers.is_some_and(|entries| {
                    entries.iter().any(|entry| {
                        entry.get("name") == Some(&Value::String("paper-search".to_string()))
                            && entry.get("command")
                                == Some(&Value::String("C:\\managed\\python.exe".to_string()))
                            && entry.pointer("/args/0") == Some(&Value::String("-m".to_string()))
                            && entry.pointer("/args/1")
                                == Some(&Value::String("paper_search_mcp.server".to_string()))
                            && entry.pointer("/env/0/name")
                                == Some(&Value::String("START_NEW_RUNTIME".to_string()))
                    })
                });
                if valid {
                    respond(&mut stdout, id, json!({"sessionId": "fake-session"}));
                } else {
                    respond_error(&mut stdout, id, -32000, "MCP servers were missing");
                }
            }
            Some("session/new") => respond(&mut stdout, id, json!({"sessionId": "fake-session"})),
            Some("session/set_model") => respond(&mut stdout, id, json!({})),
            Some("session/prompt") if mode == "hung-prompt" || mode == "cancel-ignores" => {
                write_prompt_marker();
                if mode == "hung-prompt" {
                    pending_prompt = id;
                } else if pending_prompt.is_some() {
                    // A cancelled request is deliberately never answered in
                    // this mode. The second prompt proves the driver released
                    // its local in-flight slot instead of waiting forever.
                    respond(&mut stdout, id, json!({"stopReason": "end_turn"}));
                } else {
                    pending_prompt = id;
                }
            }
            Some("session/prompt") if mode == "stderr-prompt-exit" => {
                write_stderr_failure(&line);
                std::process::exit(23);
            }
            Some("session/prompt") if mode == "assert-attachments" => {
                let prompt = message.pointer("/params/prompt").and_then(Value::as_array);
                let has_image = prompt.is_some_and(|blocks| {
                    blocks.iter().any(|block| {
                        block.get("type") == Some(&Value::String("image".to_string()))
                            && block.get("mimeType")
                                == Some(&Value::String("image/png".to_string()))
                            && block.get("data") == Some(&Value::String("cGl4ZWxz".to_string()))
                    })
                });
                let has_document_text = prompt.is_some_and(|blocks| {
                    blocks.iter().any(|block| {
                        block.get("type") == Some(&Value::String("text".to_string()))
                            && block
                                .get("text")
                                .and_then(Value::as_str)
                                .is_some_and(|text| {
                                    text.contains("notes.txt")
                                        && text.contains("sample document contents")
                                })
                    })
                });
                if has_image && has_document_text {
                    respond(&mut stdout, id, json!({"stopReason": "end_turn"}));
                } else {
                    respond_error(&mut stdout, id, -32000, "attachment blocks were missing");
                }
            }
            Some("session/prompt") => respond(&mut stdout, id, json!({"stopReason": "end_turn"})),
            Some("session/cancel") if mode == "cancel-ignores" => {}
            Some("session/cancel") => {
                if let Some(id) = pending_prompt.take() {
                    respond(&mut stdout, Some(id), json!({"stopReason": "cancelled"}));
                }
            }
            _ => {}
        }
    }

    if mode == "process-tree" {
        loop {
            std::thread::sleep(std::time::Duration::from_secs(60));
        }
    }
}

fn write_stderr_failure(json_rpc: &str) {
    const PROMPT: &str = "prompt-must-never-surface";
    let injected = std::env::var("ZEROWALL_ACP_TEST_SECRET").unwrap_or_default();
    let mut stderr = std::io::stderr().lock();
    writeln!(stderr, "old-prefix-must-be-dropped").unwrap();
    stderr.write_all(&vec![b'x'; 80 * 1024]).unwrap();
    writeln!(stderr).unwrap();
    writeln!(stderr, "api_key={injected}").unwrap();
    writeln!(stderr, "Authorization: Bearer bearer-must-never-surface").unwrap();
    writeln!(stderr, "token=token-must-never-surface").unwrap();
    writeln!(stderr, "prompt={PROMPT}").unwrap();
    writeln!(stderr, "rpc={json_rpc}").unwrap();
    writeln!(stderr, "ordinary diagnostic tail").unwrap();
    stderr.flush().unwrap();
}

fn write_handshake_stderr(message: &str) {
    let injected = std::env::var("ZEROWALL_ACP_TEST_SECRET").unwrap_or_default();
    let mut stderr = std::io::stderr().lock();
    writeln!(stderr, "environment value: {injected}").unwrap();
    writeln!(
        stderr,
        "Authorization: Bearer handshake-bearer-must-not-surface"
    )
    .unwrap();
    writeln!(stderr, "{message}").unwrap();
    stderr.flush().unwrap();
    std::thread::sleep(std::time::Duration::from_millis(50));
}

fn write_prompt_marker() {
    if let Some(path) = std::env::var_os("ZEROWALL_ACP_PROMPT_MARKER") {
        std::fs::write(path, b"received").expect("write prompt marker");
    }
}

fn respond(stdout: &mut impl Write, id: Option<Value>, result: Value) {
    let Some(id) = id else {
        return;
    };
    writeln!(
        stdout,
        "{}",
        json!({"jsonrpc": "2.0", "id": id, "result": result})
    )
    .unwrap();
    stdout.flush().unwrap();
}

fn respond_error(stdout: &mut impl Write, id: Option<Value>, code: i64, message: &str) {
    let Some(id) = id else {
        return;
    };
    writeln!(
        stdout,
        "{}",
        json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": {
                "code": code,
                "message": message,
                "data": {"secret": "must-not-surface"}
            }
        })
    )
    .unwrap();
    stdout.flush().unwrap();
}

#[cfg(windows)]
fn spawn_process_tree() -> std::process::Child {
    let marker = std::env::var_os("ZEROWALL_ACP_TREE_MARKER").expect("tree marker");
    let script = format!(
        "$PID | Set-Content -NoNewline -LiteralPath '{}'; while ($true) {{ Start-Sleep 60 }}",
        marker.to_string_lossy().replace('\'', "''")
    );
    Command::new("cmd")
        .args(["/C", "powershell", "-NoProfile", "-Command", &script])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn cmd process tree")
}

#[cfg(unix)]
fn spawn_process_tree() -> std::process::Child {
    let marker = std::env::var_os("ZEROWALL_ACP_TREE_MARKER").expect("tree marker");
    let script = format!(
        "echo $$ > '{}'; sleep 60 & wait",
        marker.to_string_lossy().replace('\'', "'\\''")
    );
    Command::new("sh")
        .args(["-c", &script])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn process group descendant")
}
