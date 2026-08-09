#![cfg_attr(windows, windows_subsystem = "windows")]

use fs2::FileExt;
use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, ACCEPT, CONTENT_TYPE};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::ffi::OsString;
use std::fs::{File, OpenOptions};
use std::io::{self, BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ToolEffect {
    ReadOnly,
    Mutation,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum BridgeTarget {
    Local {
        command: OsString,
        args: Vec<OsString>,
    },
    Remote {
        url: String,
        headers: Vec<(String, String)>,
    },
}

#[derive(Debug, Clone)]
struct BridgeConfig {
    server_id: String,
    project_root: OsString,
    session_id: String,
    frame_id: String,
    mutation_lock: PathBuf,
    tools: BTreeMap<String, ToolEffect>,
    discover_read_only: bool,
    discovered_tools: Arc<Mutex<BTreeSet<String>>>,
    target: BridgeTarget,
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
    let mut discover_read_only = false;

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
            "--discover-read-only" => {
                discover_read_only = required_unicode(value, "discover-read-only")? == "true";
            }
            _ => return Err(format!("unsupported MCP bridge flag: {flag}")),
        }
    }
    if tools.is_empty() && !discover_read_only {
        return Err("MCP bridge requires at least one tool grant".into());
    }
    let target = parse_bridge_target(args)?;
    Ok(BridgeConfig {
        server_id: server_id.ok_or_else(|| "MCP bridge server id is required".to_string())?,
        project_root: project_root
            .ok_or_else(|| "MCP bridge project root is required".to_string())?,
        session_id: session_id.ok_or_else(|| "MCP bridge session id is required".to_string())?,
        frame_id: frame_id.ok_or_else(|| "MCP bridge frame id is required".to_string())?,
        mutation_lock: mutation_lock
            .ok_or_else(|| "MCP bridge mutation lock is required".to_string())?,
        tools,
        discover_read_only,
        discovered_tools: Arc::new(Mutex::new(BTreeSet::new())),
        target,
    })
}

fn parse_bridge_target(args: impl IntoIterator<Item = OsString>) -> Result<BridgeTarget, String> {
    let mut args = args.into_iter();
    let first = args
        .next()
        .ok_or_else(|| "missing MCP bridge target".to_string())?;
    if first != "--remote-url" {
        let (command, args) = child_command(std::iter::once(first).chain(args))?;
        return Ok(BridgeTarget::Local { command, args });
    }

    let url = required_unicode(
        args.next()
            .ok_or_else(|| "missing remote MCP URL".to_string())?,
        "remote URL",
    )?;
    let mut headers = Vec::new();
    while let Some(flag) = args.next() {
        if flag != "--header-env" {
            return Err(format!(
                "unsupported remote MCP target flag: {}",
                flag.to_string_lossy()
            ));
        }
        let mapping = required_unicode(
            args.next()
                .ok_or_else(|| "missing remote MCP header environment mapping".to_string())?,
            "remote header environment mapping",
        )?;
        let (name, environment) = mapping.split_once('=').ok_or_else(|| {
            "remote MCP header mapping must use <header>=<environment>".to_string()
        })?;
        if name.trim().is_empty() || environment.trim().is_empty() {
            return Err("remote MCP header mapping values are required".into());
        }
        if !environment.chars().all(|character| {
            character.is_ascii_uppercase() || character.is_ascii_digit() || character == '_'
        }) {
            return Err("remote MCP header environment name is invalid".into());
        }
        headers.push((name.trim().to_owned(), environment.trim().to_owned()));
    }
    Ok(BridgeTarget::Remote { url, headers })
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
    // A server's readOnlyHint is advisory metadata, not an authorization
    // boundary. Discovered tools therefore use the mutation lane as well;
    // only explicit grants can opt a tool into the read-only fast path.
    let effect = config.tools.get(tool_id).copied().or_else(|| {
        (config.discover_read_only && config.discovered_tools.lock().unwrap().contains(tool_id))
            .then_some(ToolEffect::Mutation)
    });
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

fn learn_tools_from_response(line: &str, config: &BridgeConfig) {
    if !config.discover_read_only {
        return;
    }
    let Ok(value) = serde_json::from_str::<Value>(line) else {
        return;
    };
    let Some(tools) = value.pointer("/result/tools").and_then(Value::as_array) else {
        return;
    };
    let mut discovered = config.discovered_tools.lock().unwrap();
    for tool in tools {
        let read_only = tool
            .pointer("/annotations/readOnlyHint")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if !read_only {
            continue;
        }
        if let Some(name) = tool.get("name").and_then(Value::as_str).map(str::trim) {
            if !name.is_empty() {
                discovered.insert(name.to_owned());
            }
        }
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

fn decode_sse_payloads(text: &str) -> Vec<String> {
    let mut payloads = Vec::new();
    let mut data = Vec::new();
    let flush = |data: &mut Vec<String>, payloads: &mut Vec<String>| {
        if !data.is_empty() {
            payloads.push(data.join("\n"));
            data.clear();
        }
    };
    for line in text.lines() {
        if line.is_empty() {
            flush(&mut data, &mut payloads);
        } else if let Some(value) = line.strip_prefix("data:") {
            data.push(value.strip_prefix(' ').unwrap_or(value).to_owned());
        }
    }
    flush(&mut data, &mut payloads);
    payloads
}

fn remote_headers(mappings: &[(String, String)]) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    for (name, environment) in mappings {
        let name = HeaderName::from_bytes(name.as_bytes())
            .map_err(|_| format!("invalid remote MCP header name: {name}"))?;
        let value = std::env::var(environment)
            .map_err(|_| format!("missing remote MCP header environment: {environment}"))?;
        let mut value = HeaderValue::from_str(&value)
            .map_err(|_| format!("invalid remote MCP header value for {name}"))?;
        value.set_sensitive(true);
        headers.insert(name, value);
    }
    Ok(headers)
}

fn remote_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|_| "failed to initialize remote MCP transport".to_string())
}

fn forward_remote_message(
    client: &Client,
    url: &str,
    headers: &HeaderMap,
    session_id: &mut Option<HeaderValue>,
    message: &str,
) -> Result<Vec<String>, String> {
    let mut request = client
        .post(url)
        .headers(headers.clone())
        .header(ACCEPT, "application/json, text/event-stream")
        .header(CONTENT_TYPE, "application/json")
        .header("mcp-protocol-version", "2025-03-26")
        .body(message.to_owned());
    if let Some(session_id) = session_id.as_ref() {
        request = request.header("mcp-session-id", session_id.clone());
    }
    let response = request
        .send()
        .map_err(|_| "remote MCP request failed".to_string())?;
    if let Some(value) = response.headers().get("mcp-session-id") {
        *session_id = Some(value.clone());
    }
    let status = response.status();
    if status.as_u16() == 202 || status.as_u16() == 204 {
        return Ok(Vec::new());
    }
    if !status.is_success() {
        return Err(format!(
            "remote MCP returned HTTP status {}",
            status.as_u16()
        ));
    }
    let is_sse = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.to_ascii_lowercase().starts_with("text/event-stream"));
    let body = response
        .text()
        .map_err(|_| "failed to read remote MCP response".to_string())?;
    if is_sse {
        Ok(decode_sse_payloads(&body))
    } else if body.trim().is_empty() {
        Ok(Vec::new())
    } else {
        Ok(vec![body.trim().to_owned()])
    }
}

fn run_remote(
    config: BridgeConfig,
    url: String,
    header_mappings: Vec<(String, String)>,
) -> Result<i32, String> {
    let client = remote_client()?;
    let headers = remote_headers(&header_mappings)?;
    let mut session_id = None;
    let stdin = io::stdin();
    let mut reader = BufReader::new(stdin.lock());
    let mut output = io::stdout();
    let mut line = String::new();
    loop {
        line.clear();
        if reader
            .read_line(&mut line)
            .map_err(|error| error.to_string())?
            == 0
        {
            break;
        }
        let decision = inspect_request(&line, &config);
        let mutation_lock = match decision {
            RequestDecision::Reject(response) => {
                write_line(&mut output, &response).map_err(|error| error.to_string())?;
                continue;
            }
            RequestDecision::Forward => None,
            RequestDecision::ForwardMutation(_) => {
                match try_open_mutation_lock(&config.mutation_lock) {
                    Ok(lock) => Some(lock),
                    Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                        let RequestDecision::Reject(response) = reject_request(
                            id_from_request(&line),
                            -32001,
                            "MCP mutation lane is busy",
                        ) else {
                            unreachable!()
                        };
                        write_line(&mut output, &response).map_err(|error| error.to_string())?;
                        continue;
                    }
                    Err(error) => return Err(error.to_string()),
                }
            }
        };
        match forward_remote_message(&client, &url, &headers, &mut session_id, &line) {
            Ok(payloads) => {
                for payload in payloads {
                    learn_tools_from_response(&payload, &config);
                    write_line(&mut output, &payload).map_err(|error| error.to_string())?;
                }
            }
            Err(error) => {
                let id = id_from_request(&line);
                if id.is_null() {
                    eprintln!("zerowall-mcp-proxy: remote MCP notification failed");
                } else {
                    let RequestDecision::Reject(response) = reject_request(id, -32002, &error)
                    else {
                        unreachable!()
                    };
                    write_line(&mut output, &response).map_err(|error| error.to_string())?;
                }
            }
        }
        drop(mutation_lock);
    }
    Ok(0)
}

fn run(config: BridgeConfig) -> Result<i32, String> {
    let (command, args) = match config.target.clone() {
        BridgeTarget::Local { command, args } => (command, args),
        BridgeTarget::Remote { url, headers } => return run_remote(config, url, headers),
    };
    let mut child_command = Command::new(&command);
    scrub_child_environment(&mut child_command);
    child_command
        .args(&args)
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
    let output_config = config.clone();
    let stdout = std::thread::spawn(move || {
        let mut reader = BufReader::new(child_stdout);
        let mut line = String::new();
        loop {
            line.clear();
            if reader.read_line(&mut line)? == 0 {
                break;
            }
            learn_tools_from_response(&line, &output_config);
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
        child_command, decode_sse_payloads, forward_remote_message, inspect_request,
        learn_tools_from_response, parse_bridge_args, scrub_child_environment, BridgeTarget,
        RequestDecision, ToolEffect,
    };
    use std::ffi::OsString;
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;
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
        assert_eq!(
            config.target,
            BridgeTarget::Local {
                command: OsString::from("python.exe"),
                args: vec![OsString::from("-m"), OsString::from("papers")],
            }
        );
    }

    #[test]
    fn parses_a_remote_streamable_http_target_without_secret_arguments() {
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
                "--discover-read-only",
                "true",
                "--",
                "--remote-url",
                "https://mcp.example.test/rpc",
                "--header-env",
                "Authorization=ZEROWALL_MCP_REMOTE_HEADER_0",
            ]
            .map(OsString::from),
        )
        .unwrap();

        assert_eq!(
            config.target,
            BridgeTarget::Remote {
                url: "https://mcp.example.test/rpc".into(),
                headers: vec![(
                    "Authorization".into(),
                    "ZEROWALL_MCP_REMOTE_HEADER_0".into(),
                )],
            }
        );
    }

    #[test]
    fn decodes_json_rpc_messages_from_sse_data_events() {
        let payloads = decode_sse_payloads(
            ": keepalive\n\
             event: message\n\
             data: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{}}\n\
             \n\
             data: {\"jsonrpc\":\"2.0\",\n\
             data: \"method\":\"notifications/progress\"}\n\n",
        );

        assert_eq!(
            payloads,
            [
                r#"{"jsonrpc":"2.0","id":1,"result":{}}"#,
                "{\"jsonrpc\":\"2.0\",\n\"method\":\"notifications/progress\"}",
            ]
        );
    }

    #[test]
    fn forwards_streamable_http_headers_session_and_sse_without_exposing_secrets() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/mcp", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            for turn in 0..2 {
                let (mut stream, _) = listener.accept().unwrap();
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut headers = std::collections::BTreeMap::new();
                let mut content_length = 0usize;
                loop {
                    let mut line = String::new();
                    reader.read_line(&mut line).unwrap();
                    if line == "\r\n" {
                        break;
                    }
                    if let Some((name, value)) = line.trim_end().split_once(':') {
                        headers.insert(name.to_ascii_lowercase(), value.trim().to_owned());
                        if name.eq_ignore_ascii_case("content-length") {
                            content_length = value.trim().parse().unwrap();
                        }
                    }
                }
                let mut body = vec![0; content_length];
                reader.read_exact(&mut body).unwrap();
                assert!(String::from_utf8(body).unwrap().contains("\"jsonrpc\""));
                assert_eq!(headers["authorization"], "Bearer test-secret");
                assert_eq!(
                    headers.get("mcp-session-id").map(String::as_str),
                    (turn == 1).then_some("session-remote-1")
                );
                let response = if turn == 0 {
                    let body = r#"{"jsonrpc":"2.0","id":1,"result":{}}"#;
                    format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nMcp-Session-Id: session-remote-1\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                        body.len()
                    )
                } else {
                    let body = "data: {\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{}}\n\n";
                    format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                        body.len()
                    )
                };
                stream.write_all(response.as_bytes()).unwrap();
            }
        });
        let client = reqwest::blocking::Client::builder().build().unwrap();
        let mut headers = reqwest::header::HeaderMap::new();
        let mut secret = reqwest::header::HeaderValue::from_static("Bearer test-secret");
        secret.set_sensitive(true);
        headers.insert(reqwest::header::AUTHORIZATION, secret);
        let mut session_id = None;

        let first = forward_remote_message(
            &client,
            &url,
            &headers,
            &mut session_id,
            r#"{"jsonrpc":"2.0","id":1,"method":"initialize"}"#,
        )
        .unwrap();
        let second = forward_remote_message(
            &client,
            &url,
            &headers,
            &mut session_id,
            r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#,
        )
        .unwrap();

        server.join().unwrap();
        assert_eq!(first, [r#"{"jsonrpc":"2.0","id":1,"result":{}}"#]);
        assert_eq!(second, [r#"{"jsonrpc":"2.0","id":2,"result":{}}"#]);
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
    fn discovers_exact_read_only_tools_from_the_standard_list_response() {
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
                "--discover-read-only",
                "true",
                "--",
                "python.exe",
            ]
            .map(OsString::from),
        )
        .unwrap();

        learn_tools_from_response(
            r#"{"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"search","annotations":{"readOnlyHint":true}},{"name":"write_note"}]}}"#,
            &config,
        );
        assert_eq!(
            inspect_request(
                r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search"}}"#,
                &config,
            ),
            RequestDecision::ForwardMutation("2".into())
        );
        assert!(matches!(
            inspect_request(
                r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"write_note"}}"#,
                &config,
            ),
            RequestDecision::Reject(_)
        ));
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
