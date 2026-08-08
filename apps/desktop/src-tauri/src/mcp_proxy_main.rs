#![cfg_attr(windows, windows_subsystem = "windows")]

use fs2::FileExt;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};
use std::ffi::OsString;
use std::fs::{File, OpenOptions};
use std::io::{self, BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ToolEffect {
    ReadOnly,
    Mutation,
}

#[derive(Debug, Clone)]
struct BridgeConfig {
    server_id: String,
    project_root: OsString,
    session_id: String,
    frame_id: String,
    mutation_lock: PathBuf,
    tools: BTreeMap<String, ToolEffect>,
    command: OsString,
    args: Vec<OsString>,
}

#[derive(Debug, PartialEq, Eq)]
enum RequestDecision {
    Forward,
    ForwardMutation(String),
    Reject(String),
}

fn child_command(
    args: impl IntoIterator<Item = OsString>,
) -> Result<(OsString, Vec<OsString>), String> {
    let mut args = args.into_iter();
    let command = args
        .next()
        .ok_or_else(|| "missing MCP child command".to_string())?;
    Ok((command, args.collect()))
}

fn parse_bridge_args(args: impl IntoIterator<Item = OsString>) -> Result<BridgeConfig, String> {
    let mut args = args.into_iter();
    let mut server_id = None;
    let mut project_root = None;
    let mut session_id = None;
    let mut frame_id = None;
    let mut mutation_lock = None;
    let mut tools = BTreeMap::new();

    loop {
        let argument = args
            .next()
            .ok_or_else(|| "missing MCP child command separator".to_string())?;
        if argument == "--" {
            break;
        }
        let flag = argument
            .to_str()
            .ok_or_else(|| "MCP bridge flags must be valid Unicode".to_string())?;
        let value = args
            .next()
            .ok_or_else(|| format!("missing value for {flag}"))?;
        match flag {
            "--server-id" => server_id = Some(required_unicode(value, "server id")?),
            "--project-root" => {
                if value.is_empty() {
                    return Err("MCP bridge project root is required".into());
                }
                project_root = Some(value);
            }
            "--session-id" => session_id = Some(required_unicode(value, "session id")?),
            "--frame-id" => frame_id = Some(required_unicode(value, "frame id")?),
            "--mutation-lock" => {
                if value.is_empty() {
                    return Err("MCP bridge mutation lock is required".into());
                }
                mutation_lock = Some(PathBuf::from(value));
            }
            "--tool" => {
                let grant = required_unicode(value, "tool grant")?;
                let (tool_id, effect) = grant
                    .rsplit_once('=')
                    .ok_or_else(|| "MCP tool grant must use <tool>=<effect>".to_string())?;
                if tool_id.trim().is_empty() {
                    return Err("MCP bridge tool id is required".into());
                }
                if tool_id == "*" {
                    return Err("MCP bridge requires exact tool ids".into());
                }
                let effect = match effect {
                    "read-only" => ToolEffect::ReadOnly,
                    "mutation" => ToolEffect::Mutation,
                    _ => return Err(format!("unsupported MCP tool effect: {effect}")),
                };
                if tools.insert(tool_id.to_owned(), effect).is_some() {
                    return Err(format!("duplicate MCP tool id: {tool_id}"));
                }
            }
            _ => return Err(format!("unsupported MCP bridge flag: {flag}")),
        }
    }
    if tools.is_empty() {
        return Err("MCP bridge requires at least one tool grant".into());
    }
    let (command, args) = child_command(args)?;
    Ok(BridgeConfig {
        server_id: server_id.ok_or_else(|| "MCP bridge server id is required".to_string())?,
        project_root: project_root
            .ok_or_else(|| "MCP bridge project root is required".to_string())?,
        session_id: session_id.ok_or_else(|| "MCP bridge session id is required".to_string())?,
        frame_id: frame_id.ok_or_else(|| "MCP bridge frame id is required".to_string())?,
        mutation_lock: mutation_lock
            .ok_or_else(|| "MCP bridge mutation lock is required".to_string())?,
        tools,
        command,
        args,
    })
}

fn required_unicode(value: OsString, field: &str) -> Result<String, String> {
    let value = value
        .into_string()
        .map_err(|_| format!("MCP bridge {field} must be valid Unicode"))?;
    let value = value.trim();
    if value.is_empty() {
        Err(format!("MCP bridge {field} is required"))
    } else {
        Ok(value.to_owned())
    }
}

fn inspect_request(line: &str, config: &BridgeConfig) -> RequestDecision {
    let Ok(value) = serde_json::from_str::<Value>(line) else {
        return RequestDecision::Forward;
    };
    if value.get("method").and_then(Value::as_str) != Some("tools/call") {
        return RequestDecision::Forward;
    }
    let id = value.get("id").cloned().unwrap_or(Value::Null);
    let tool_id = value
        .pointer("/params/name")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let effect = config
        .tools
        .get(tool_id)
        .or_else(|| config.tools.get("*"))
        .copied();
    match effect {
        Some(ToolEffect::ReadOnly) => RequestDecision::Forward,
        Some(ToolEffect::Mutation) if !id.is_null() => {
            RequestDecision::ForwardMutation(id.to_string())
        }
        Some(ToolEffect::Mutation) => {
            reject_request(id, -32600, "Mutation tool calls require an id")
        }
        None => reject_request(id, -32601, "MCP tool is not allowed by the ZeroWall bridge"),
    }
}

fn reject_request(id: Value, code: i64, message: &str) -> RequestDecision {
    RequestDecision::Reject(
        json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": {"code": code, "message": message},
        })
        .to_string(),
    )
}

fn response_id(line: &str) -> Option<String> {
    let value = serde_json::from_str::<Value>(line).ok()?;
    if value.get("method").is_some() {
        return None;
    }
    value
        .get("id")
        .filter(|id| !id.is_null())
        .map(Value::to_string)
}

fn write_line(writer: &mut impl Write, line: &str) -> io::Result<()> {
    writer.write_all(line.as_bytes())?;
    if !line.ends_with('\n') {
        writer.write_all(b"\n")?;
    }
    writer.flush()
}

fn try_open_mutation_lock(path: &PathBuf) -> io::Result<File> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(path)?;
    file.try_lock_exclusive()?;
    Ok(file)
}

fn scrub_child_environment(command: &mut Command) {
    // MCP packages are third-party code. They must never inherit provider
    // credentials or agent runtime secrets from the ACP adapter process.
    for name in [
        "OPENAI_API_KEY",
        "OPENAI_BASE_URL",
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_AUTH_TOKEN",
        "ANTHROPIC_BASE_URL",
        "CODEX_HOME",
        "CODEX_PATH",
        "CLAUDE_CONFIG_DIR",
        "CLAUDE_CODE_EXECUTABLE",
        "ZERO_WALL_MODEL",
        "ZERO_WALL_PROVIDER",
        "ZERO_WALL_CREDENTIAL",
    ] {
        command.env_remove(name);
    }
}

fn id_from_request(line: &str) -> Value {
    serde_json::from_str::<Value>(line)
        .ok()
        .and_then(|value| value.get("id").cloned())
        .unwrap_or(Value::Null)
}

fn run(config: BridgeConfig) -> Result<i32, String> {
    let mut child_command = Command::new(&config.command);
    scrub_child_environment(&mut child_command);
    child_command
        .args(&config.args)
        .env("ZEROWALL_MCP_SERVER_ID", &config.server_id)
        .env("ZEROWALL_MCP_PROJECT_ROOT", &config.project_root)
        .env("ZEROWALL_MCP_SESSION_ID", &config.session_id)
        .env("ZEROWALL_MCP_FRAME_ID", &config.frame_id)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        child_command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = child_command
        .spawn()
        .map_err(|error| format!("failed to start MCP child: {error}"))?;

    let mut child_stdin = child.stdin.take().expect("piped stdin");
    let child_stdout = child.stdout.take().expect("piped stdout");
    let mut child_stderr = child.stderr.take().expect("piped stderr");
    let output = Arc::new(Mutex::new(io::stdout()));
    let pending_mutation = Arc::new(Mutex::new(HashMap::<String, File>::new()));

    let input_config = config.clone();
    let input_output = output.clone();
    let input_pending = pending_mutation.clone();
    let stdin = std::thread::spawn(move || -> io::Result<()> {
        let stdin = io::stdin();
        let mut reader = BufReader::new(stdin.lock());
        let mut line = String::new();
        loop {
            line.clear();
            if reader.read_line(&mut line)? == 0 {
                break;
            }
            match inspect_request(&line, &input_config) {
                RequestDecision::Forward => write_line(&mut child_stdin, &line)?,
                RequestDecision::Reject(response) => {
                    write_line(&mut *input_output.lock().unwrap(), &response)?;
                }
                RequestDecision::ForwardMutation(request_id) => {
                    let lock = match try_open_mutation_lock(&input_config.mutation_lock) {
                        Ok(lock) => lock,
                        Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                            let RequestDecision::Reject(response) = reject_request(
                                id_from_request(&line),
                                -32001,
                                "MCP mutation lane is busy",
                            ) else {
                                unreachable!()
                            };
                            write_line(&mut *input_output.lock().unwrap(), &response)?;
                            continue;
                        }
                        Err(error) => return Err(error),
                    };
                    input_pending
                        .lock()
                        .unwrap()
                        .insert(request_id.clone(), lock);
                    if let Err(error) = write_line(&mut child_stdin, &line) {
                        input_pending.lock().unwrap().remove(&request_id);
                        return Err(error);
                    }
                }
            }
        }
        Ok(())
    });

    let output_writer = output.clone();
    let output_pending = pending_mutation.clone();
    let stdout = std::thread::spawn(move || {
        let mut reader = BufReader::new(child_stdout);
        let mut line = String::new();
        loop {
            line.clear();
            if reader.read_line(&mut line)? == 0 {
                break;
            }
            write_line(&mut *output_writer.lock().unwrap(), &line)?;
            if let Some(request_id) = response_id(&line) {
                let _ = output_pending.lock().unwrap().remove(&request_id);
            }
        }
        Ok::<(), io::Error>(())
    });
    let stderr = std::thread::spawn(move || {
        let result = io::copy(&mut child_stderr, &mut io::stderr().lock());
        let _ = io::stderr().flush();
        result
    });

    let status = child
        .wait()
        .map_err(|error| format!("failed waiting for MCP child: {error}"))?;
    pending_mutation.lock().unwrap().clear();
    // Do not join the parent-stdin reader: when the child exits unexpectedly
    // the parent may keep stdin open, and joining would hang shutdown forever.
    drop(stdin);
    let _ = stdout.join();
    let _ = stderr.join();
    Ok(status.code().unwrap_or(1))
}

fn main() {
    let config = match parse_bridge_args(std::env::args_os().skip(1)) {
        Ok(config) => config,
        Err(error) => {
            eprintln!("zerowall-mcp-proxy: {error}");
            std::process::exit(64);
        }
    };
    match run(config) {
        Ok(code) => std::process::exit(code),
        Err(error) => {
            eprintln!("zerowall-mcp-proxy: {error}");
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        child_command, inspect_request, parse_bridge_args, scrub_child_environment,
        RequestDecision, ToolEffect,
    };
    use std::ffi::OsString;
    use std::process::Command;

    #[test]
    fn preserves_the_child_program_and_arguments() {
        let (program, args) =
            child_command(["python.exe", "-m", "server"].map(OsString::from)).unwrap();
        assert_eq!(program, OsString::from("python.exe"));
        assert_eq!(args, [OsString::from("-m"), OsString::from("server")]);
    }

    #[test]
    fn rejects_a_missing_child_program() {
        assert!(child_command(Vec::<OsString>::new()).is_err());
    }

    #[test]
    fn parses_restricted_bridge_identity_and_tool_grants() {
        let config = parse_bridge_args(
            [
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
                "--tool",
                "save_note=mutation",
                "--",
                "python.exe",
                "-m",
                "papers",
            ]
            .map(OsString::from),
        )
        .unwrap();

        assert_eq!(config.server_id, "papers");
        assert_eq!(config.project_root, "C:/science");
        assert_eq!(config.session_id, "session-1");
        assert_eq!(config.frame_id, "frame-1");
        assert_eq!(config.tools["search"], ToolEffect::ReadOnly);
        assert_eq!(config.tools["save_note"], ToolEffect::Mutation);
        assert_eq!(config.command, OsString::from("python.exe"));
        assert_eq!(
            config.args,
            [OsString::from("-m"), OsString::from("papers")]
        );
    }

    #[test]
    fn rejects_unlisted_tool_calls_inside_the_bridge() {
        let config = parse_bridge_args(
            [
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
            ]
            .map(OsString::from),
        )
        .unwrap();

        let decision = inspect_request(
            r#"{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"delete_all","arguments":{}}}"#,
            &config,
        );
        let RequestDecision::Reject(response) = decision else {
            panic!("unlisted tool must be rejected");
        };
        let response: serde_json::Value = serde_json::from_str(&response).unwrap();
        assert_eq!(response["id"], 7);
        assert_eq!(response["error"]["code"], -32601);
    }

    #[test]
    fn classifies_readonly_and_mutation_calls_by_exact_tool_id() {
        let config = parse_bridge_args(
            [
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
                "--tool",
                "save_note=mutation",
                "--",
                "python.exe",
            ]
            .map(OsString::from),
        )
        .unwrap();

        assert_eq!(
            inspect_request(
                r#"{"jsonrpc":"2.0","id":"read-1","method":"tools/call","params":{"name":"search"}}"#,
                &config,
            ),
            RequestDecision::Forward
        );
        assert_eq!(
            inspect_request(
                r#"{"jsonrpc":"2.0","id":"write-1","method":"tools/call","params":{"name":"save_note"}}"#,
                &config,
            ),
            RequestDecision::ForwardMutation("\"write-1\"".into())
        );
    }

    #[test]
    fn rejects_wildcard_tool_grants() {
        let error = parse_bridge_args(
            [
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
                "*=mutation",
                "--",
                "python.exe",
            ]
            .map(OsString::from),
        )
        .unwrap_err();
        assert!(error.contains("exact tool ids"));
    }

    #[test]
    fn scrubs_provider_credentials_from_mcp_children() {
        let mut command = Command::new("python.exe");
        command
            .env("OPENAI_API_KEY", "secret")
            .env("ANTHROPIC_AUTH_TOKEN", "secret")
            .env("PATH", "keep");
        scrub_child_environment(&mut command);
        let env = command
            .get_envs()
            .collect::<std::collections::BTreeMap<_, _>>();
        assert_eq!(env.get(std::ffi::OsStr::new("OPENAI_API_KEY")), Some(&None));
        assert_eq!(
            env.get(std::ffi::OsStr::new("ANTHROPIC_AUTH_TOKEN")),
            Some(&None)
        );
        assert_eq!(
            env.get(std::ffi::OsStr::new("PATH")),
            Some(&Some(std::ffi::OsStr::new("keep")))
        );
    }
}
