use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use zerowall_acp::{
    AcpAgentProfile, AcpClient, AcpError, AcpEvent, AcpEventErrorKind, AcpEventReceiver,
    AcpHandshakeStage, AcpLaunchOptions, AcpSessionStart, PromptAttachment,
};

static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);

fn fake_agent_command() -> String {
    if let Ok(path) = std::env::var("CARGO_BIN_EXE_zerowall_acp_fake_agent") {
        return path;
    }
    // Workspace-wide `cargo test` may compile this integration test as a
    // dependency without setting Cargo's bin environment variable. The fake
    // binary still lives next to the test executable in that layout.
    let mut path = std::env::current_exe()
        .expect("test executable path")
        .parent()
        .and_then(Path::parent)
        .expect("target debug directory")
        .join("zerowall_acp_fake_agent");
    #[cfg(windows)]
    path.set_extension("exe");
    path.to_string_lossy().to_string()
}

fn profile(mode: &str, env: Vec<(String, String)>) -> AcpAgentProfile {
    profile_with(mode, env, vec![], None)
}

fn profile_with(
    mode: &str,
    env: Vec<(String, String)>,
    env_remove: Vec<String>,
    session_meta: Option<serde_json::Map<String, serde_json::Value>>,
) -> AcpAgentProfile {
    AcpAgentProfile {
        id: "fake-agent".to_string(),
        label: "Fake Agent".to_string(),
        command: fake_agent_command(),
        args: vec![mode.to_string()],
        env,
        env_remove,
        session_meta,
        mcp_servers: if mode == "assert-mcp" {
            vec![zerowall_acp::AcpMcpServer {
                name: "paper-search".to_string(),
                command: "C:\\managed\\python.exe".to_string(),
                args: vec!["-m".to_string(), "paper_search_mcp.server".to_string()],
                env: vec![("START_NEW_RUNTIME".to_string(), "false".to_string())],
            }]
        } else {
            vec![]
        },
    }
}

fn options() -> AcpLaunchOptions {
    AcpLaunchOptions {
        handshake_timeout: Duration::from_millis(250),
        shutdown_grace: Duration::from_millis(250),
    }
}

fn launch(mode: &str) -> (AcpClient, AcpEventReceiver, tokio::task::JoinHandle<()>) {
    let (client, events, driver) =
        AcpClient::launch_with_options(&profile(mode, vec![]), std::env::temp_dir(), options());
    (client, events, tokio::spawn(driver))
}

async fn next_event(events: &mut AcpEventReceiver) -> AcpEvent {
    tokio::time::timeout(Duration::from_secs(2), events.recv())
        .await
        .expect("event timeout")
        .expect("event stream closed")
}

async fn wait_ready(events: &mut AcpEventReceiver) {
    loop {
        if matches!(next_event(events).await, AcpEvent::Ready { .. }) {
            return;
        }
    }
}

#[tokio::test]
async fn handshake_becomes_ready_only_after_initialize_and_session_new() {
    let (client, mut events, driver) = launch("normal");

    assert!(matches!(
        next_event(&mut events).await,
        AcpEvent::HandshakeStarted {
            stage: AcpHandshakeStage::Initialize
        }
    ));
    assert!(matches!(
        next_event(&mut events).await,
        AcpEvent::HandshakeStarted {
            stage: AcpHandshakeStage::SessionNew
        }
    ));
    assert!(matches!(
        next_event(&mut events).await,
        AcpEvent::Ready { ref session_id } if session_id == "fake-session"
    ));

    client.prompt("not retained in diagnostics").unwrap();
    assert!(matches!(
        next_event(&mut events).await,
        AcpEvent::TurnEnded { ref stop_reason, .. } if stop_reason == "end_turn"
    ));
    client.shutdown().unwrap();
    tokio::time::timeout(Duration::from_secs(2), driver)
        .await
        .expect("driver shutdown timeout")
        .unwrap();
}

#[tokio::test]
async fn session_load_restores_the_requested_session_and_accepts_a_prompt() {
    let (client, mut events, driver) = AcpClient::launch_session_with_options(
        &profile("assert-load", vec![]),
        std::env::temp_dir(),
        AcpSessionStart::Load {
            session_id: "persisted-session".to_string(),
        },
        options(),
    );
    let driver = tokio::spawn(driver);

    assert!(matches!(
        next_event(&mut events).await,
        AcpEvent::HandshakeStarted {
            stage: AcpHandshakeStage::Initialize
        }
    ));
    assert!(matches!(
        next_event(&mut events).await,
        AcpEvent::HandshakeStarted {
            stage: AcpHandshakeStage::SessionLoad
        }
    ));
    assert!(matches!(
        next_event(&mut events).await,
        AcpEvent::Ready { ref session_id } if session_id == "persisted-session"
    ));

    client.prompt("continue loaded session").unwrap();
    assert!(matches!(
        next_event(&mut events).await,
        AcpEvent::TurnEnded { ref stop_reason, .. } if stop_reason == "end_turn"
    ));
    client.shutdown().unwrap();
    driver.await.unwrap();
}

#[tokio::test]
async fn session_resume_restores_the_requested_session_and_accepts_a_prompt() {
    let (client, mut events, driver) = AcpClient::launch_session_with_options(
        &profile("assert-resume", vec![]),
        std::env::temp_dir(),
        AcpSessionStart::Resume {
            session_id: "persisted-session".to_string(),
        },
        options(),
    );
    let driver = tokio::spawn(driver);

    assert!(matches!(
        next_event(&mut events).await,
        AcpEvent::HandshakeStarted {
            stage: AcpHandshakeStage::Initialize
        }
    ));
    assert!(matches!(
        next_event(&mut events).await,
        AcpEvent::HandshakeStarted {
            stage: AcpHandshakeStage::SessionResume
        }
    ));
    assert!(matches!(
        next_event(&mut events).await,
        AcpEvent::Ready { ref session_id } if session_id == "persisted-session"
    ));

    client.prompt("continue resumed session").unwrap();
    assert!(matches!(
        next_event(&mut events).await,
        AcpEvent::TurnEnded { ref stop_reason, .. } if stop_reason == "end_turn"
    ));
    client.shutdown().unwrap();
    driver.await.unwrap();
}

#[tokio::test]
async fn model_switch_uses_existing_session_without_rehandshake() {
    let (client, mut events, driver) = launch("normal");
    wait_ready(&mut events).await;

    client.set_model("gpt-5.6-terra").await.unwrap();
    client.prompt("after model switch").unwrap();
    assert!(matches!(
        next_event(&mut events).await,
        AcpEvent::TurnEnded { ref stop_reason, .. } if stop_reason == "end_turn"
    ));

    client.shutdown().unwrap();
    driver.await.unwrap();
}

#[tokio::test]
async fn structured_image_and_document_attachments_reach_the_agent_prompt() {
    let (client, mut events, driver) = launch("assert-attachments");
    wait_ready(&mut events).await;
    client
        .prompt_with_attachments(
            "analyze these",
            vec![
                PromptAttachment {
                    filename: "floor-plan.png".to_string(),
                    mime: "image/png".to_string(),
                    base64: "cGl4ZWxz".to_string(),
                    extracted_text: None,
                },
                PromptAttachment {
                    filename: "notes.txt".to_string(),
                    mime: "text/plain".to_string(),
                    base64: "bm90ZXM=".to_string(),
                    extracted_text: Some("sample document contents".to_string()),
                },
            ],
        )
        .unwrap();
    assert!(matches!(
        next_event(&mut events).await,
        AcpEvent::TurnEnded { ref stop_reason, .. } if stop_reason == "end_turn"
    ));
    client.shutdown().unwrap();
    driver.await.unwrap();
}

#[tokio::test]
async fn removed_parent_environment_does_not_reach_agent() {
    const FORBIDDEN: &str = "ZEROWALL_FORBIDDEN_PARENT_ROUTE";
    std::env::set_var(FORBIDDEN, "inherited-route");
    let (_client, mut events, driver) = AcpClient::launch_with_options(
        &profile_with(
            "environment-check",
            vec![(
                "ZEROWALL_FAKE_CHECK_NAME".to_string(),
                FORBIDDEN.to_string(),
            )],
            vec![FORBIDDEN.to_string()],
            None,
        ),
        std::env::temp_dir(),
        options(),
    );
    let driver = tokio::spawn(driver);
    let error = loop {
        if let AcpEvent::Exited { error: Some(error) } = next_event(&mut events).await {
            break error;
        }
    };
    std::env::remove_var(FORBIDDEN);
    driver.await.unwrap();
    assert!(error.contains("route_state=missing"), "{error}");
    assert!(!error.contains("route_state=present"), "{error}");
}

#[tokio::test]
async fn session_new_forwards_host_controlled_settings_isolation() {
    let meta = serde_json::json!({
        "claudeCode": {"options": {"settingSources": []}}
    })
    .as_object()
    .unwrap()
    .clone();
    let (client, mut events, driver) = AcpClient::launch_with_options(
        &profile_with("require-isolated-settings", vec![], vec![], Some(meta)),
        std::env::temp_dir(),
        options(),
    );
    let driver = tokio::spawn(driver);
    wait_ready(&mut events).await;
    client.shutdown().unwrap();
    driver.await.unwrap();
}

#[tokio::test]
async fn session_new_forwards_host_controlled_mcp_servers() {
    let (client, mut events, driver) = AcpClient::launch_with_options(
        &profile_with("assert-mcp", vec![], vec![], None),
        std::env::temp_dir(),
        options(),
    );
    let driver = tokio::spawn(driver);
    wait_ready(&mut events).await;
    client.shutdown().unwrap();
    driver.await.unwrap();
}

#[tokio::test]
async fn initialize_timeout_reports_stage_and_ends_driver() {
    let (_client, mut events, driver) = launch("initialize-hang");

    assert!(matches!(
        next_event(&mut events).await,
        AcpEvent::HandshakeStarted {
            stage: AcpHandshakeStage::Initialize
        }
    ));
    assert!(matches!(
        next_event(&mut events).await,
        AcpEvent::Error {
            kind: AcpEventErrorKind::HandshakeTimeout {
                stage: AcpHandshakeStage::Initialize
            }
        }
    ));
    tokio::time::timeout(Duration::from_secs(2), driver)
        .await
        .expect("timed-out handshake did not end driver")
        .unwrap();
}

#[tokio::test]
async fn initialize_timeout_exit_includes_only_sanitized_stderr() {
    const INJECTED_SECRET: &str = "handshake-environment-secret";
    let (_client, mut events, driver) = AcpClient::launch_with_options(
        &profile(
            "stderr-initialize-hang",
            vec![(
                "ZEROWALL_ACP_TEST_SECRET".to_string(),
                INJECTED_SECRET.to_string(),
            )],
        ),
        std::env::temp_dir(),
        options(),
    );
    let driver = tokio::spawn(driver);
    let diagnostic = loop {
        if let AcpEvent::Exited {
            error: Some(message),
        } = next_event(&mut events).await
        {
            break message;
        }
    };
    driver.await.unwrap();
    assert!(diagnostic.contains("initialize timeout ordinary tail"));
    assert!(!diagnostic.contains(INJECTED_SECRET));
    assert!(!diagnostic.contains("handshake-bearer-must-not-surface"));
}

#[tokio::test]
async fn session_new_failure_reports_its_stage() {
    let (_client, mut events, driver) = launch("session-error");

    loop {
        match next_event(&mut events).await {
            AcpEvent::Error {
                kind:
                    AcpEventErrorKind::HandshakeFailed {
                        stage: AcpHandshakeStage::SessionNew,
                        message,
                    },
            } => {
                assert_eq!(message, "ACP protocol request failed");
                assert!(!message.contains("secret-in-message-must-not-surface"));
                assert!(!message.contains("must-not-surface"));
                break;
            }
            AcpEvent::Ready { .. } => panic!("failed handshake must not become ready"),
            _ => {}
        }
    }
    tokio::time::timeout(Duration::from_secs(2), driver)
        .await
        .expect("failed handshake did not end driver")
        .unwrap();
}

#[tokio::test]
async fn handshake_failure_message_includes_only_sanitized_stderr() {
    const INJECTED_SECRET: &str = "session-environment-secret";
    let (_client, mut events, driver) = AcpClient::launch_with_options(
        &profile(
            "stderr-session-error",
            vec![(
                "ZEROWALL_ACP_TEST_SECRET".to_string(),
                INJECTED_SECRET.to_string(),
            )],
        ),
        std::env::temp_dir(),
        options(),
    );
    let driver = tokio::spawn(driver);
    let mut stage_error = None;
    let diagnostic = loop {
        match next_event(&mut events).await {
            AcpEvent::Error {
                kind:
                    AcpEventErrorKind::HandshakeFailed {
                        stage: AcpHandshakeStage::SessionNew,
                        message,
                    },
            } => stage_error = Some(message),
            AcpEvent::Exited {
                error: Some(message),
            } => break message,
            _ => {}
        }
    };
    driver.await.unwrap();
    assert_eq!(stage_error.as_deref(), Some("ACP protocol request failed"));
    assert!(diagnostic.contains("session failure ordinary tail"));
    assert!(!diagnostic.contains(INJECTED_SECRET));
    assert!(!diagnostic.contains("handshake-bearer-must-not-surface"));
    assert!(!diagnostic.contains("adapter secret must not surface"));
}

#[tokio::test]
async fn successful_session_never_surfaces_captured_stderr() {
    let (client, mut events, driver) = launch("normal-stderr");
    wait_ready(&mut events).await;
    client.shutdown().unwrap();
    assert!(matches!(
        next_event(&mut events).await,
        AcpEvent::Exited { error: None }
    ));
    driver.await.unwrap();
}

#[tokio::test]
async fn abnormal_exit_reports_only_a_bounded_sanitized_stderr_tail() {
    const INJECTED_SECRET: &str = "environment-secret-must-never-surface";
    const PROMPT: &str = "prompt-must-never-surface";
    const MAX_DIAGNOSTIC_BYTES: usize = 64 * 1024;
    let (client, mut events, driver) = AcpClient::launch_with_options(
        &profile(
            "stderr-prompt-exit",
            vec![(
                "ZEROWALL_ACP_TEST_SECRET".to_string(),
                INJECTED_SECRET.to_string(),
            )],
        ),
        std::env::temp_dir(),
        options(),
    );
    let driver = tokio::spawn(driver);
    wait_ready(&mut events).await;
    client.prompt(PROMPT).unwrap();

    let diagnostic = loop {
        if let AcpEvent::Exited {
            error: Some(message),
        } = next_event(&mut events).await
        {
            break message;
        }
    };
    tokio::time::timeout(Duration::from_secs(2), driver)
        .await
        .expect("stderr failure did not end driver")
        .unwrap();

    assert!(diagnostic.len() <= MAX_DIAGNOSTIC_BYTES);
    assert!(diagnostic.contains("ordinary diagnostic tail"));
    assert!(!diagnostic.contains("old-prefix-must-be-dropped"));
    for forbidden in [
        INJECTED_SECRET,
        PROMPT,
        "bearer-must-never-surface",
        "token-must-never-surface",
        "session/prompt",
        "\"jsonrpc\"",
    ] {
        assert!(
            !diagnostic.contains(forbidden),
            "diagnostic leaked {forbidden}: {diagnostic}"
        );
    }
}

#[tokio::test]
async fn cancel_reaches_a_hung_prompt_within_two_seconds() {
    let marker = temp_marker("prompt-received-before-cancel");
    let (client, mut events, driver) = launch_with_prompt_marker(&marker);
    wait_ready(&mut events).await;
    client.prompt("hung").unwrap();
    wait_for_marker(&marker).await;
    client.cancel().unwrap();
    assert!(matches!(
        next_event(&mut events).await,
        AcpEvent::TurnEnded { ref stop_reason, .. } if stop_reason == "cancelled"
    ));

    client.shutdown().unwrap();
    tokio::time::timeout(Duration::from_secs(2), driver)
        .await
        .expect("driver shutdown timeout")
        .unwrap();
    let _ = std::fs::remove_file(marker);
}

#[tokio::test]
async fn cancel_releases_local_prompt_when_agent_ignores_cancel() {
    let marker = temp_marker("prompt-received-before-cancel-ignored");
    let (client, mut events, driver) =
        launch_with_mode_and_prompt_marker("cancel-ignores", &marker);
    wait_ready(&mut events).await;
    client.prompt("hung").unwrap();
    wait_for_marker(&marker).await;
    client.cancel().unwrap();
    assert!(matches!(
        tokio::time::timeout(Duration::from_secs(2), next_event(&mut events))
            .await
            .expect("cancel did not release the prompt slot"),
        AcpEvent::TurnEnded { ref stop_reason, .. } if stop_reason == "cancelled"
    ));

    // A new prompt must not be rejected as busy after the adapter ignored the
    // cancellation response. The fake agent completes this second turn.
    client.prompt("after cancel").unwrap();
    assert!(matches!(
        tokio::time::timeout(Duration::from_secs(2), next_event(&mut events))
            .await
            .expect("second prompt did not complete"),
        AcpEvent::TurnEnded { ref stop_reason, .. } if stop_reason == "end_turn"
    ));

    client.shutdown().unwrap();
    tokio::time::timeout(Duration::from_secs(2), driver)
        .await
        .expect("driver shutdown timeout")
        .unwrap();
    let _ = std::fs::remove_file(marker);
}

#[test]
fn acp_logging_does_not_disable_unrelated_debug_and_trace_callsites() {
    assert_eq!(
        tracing::level_filters::STATIC_MAX_LEVEL,
        tracing::level_filters::LevelFilter::TRACE,
        "ACP must not globally compile out diagnostics from unrelated crates"
    );
}

#[tokio::test]
async fn shutdown_interrupts_a_hung_prompt_and_ends_driver() {
    let marker = temp_marker("prompt-received-before-shutdown");
    let (client, mut events, driver) = launch_with_prompt_marker(&marker);
    wait_ready(&mut events).await;
    client.prompt("hung").unwrap();
    wait_for_marker(&marker).await;

    client.shutdown().unwrap();
    tokio::time::timeout(Duration::from_secs(2), driver)
        .await
        .expect("hung prompt blocked shutdown")
        .unwrap();
    let _ = std::fs::remove_file(marker);
}

#[tokio::test]
async fn shutdown_interrupts_the_initialize_handshake() {
    let (client, mut events, driver) = launch("initialize-hang");
    assert!(matches!(
        next_event(&mut events).await,
        AcpEvent::HandshakeStarted {
            stage: AcpHandshakeStage::Initialize
        }
    ));

    client.shutdown().unwrap();
    tokio::time::timeout(Duration::from_secs(2), driver)
        .await
        .expect("initialize handshake blocked shutdown")
        .unwrap();
    assert!(matches!(
        next_event(&mut events).await,
        AcpEvent::Exited { error: None }
    ));
}

#[tokio::test]
async fn second_prompt_is_rejected_as_busy() {
    let (client, mut events, driver) = launch("hung-prompt");
    wait_ready(&mut events).await;
    client.prompt("first").unwrap();
    assert!(matches!(client.prompt("second"), Err(AcpError::Busy)));

    client.shutdown().unwrap();
    tokio::time::timeout(Duration::from_secs(2), driver)
        .await
        .expect("driver shutdown timeout")
        .unwrap();
}

#[cfg(windows)]
#[tokio::test]
async fn windows_job_terminates_the_owned_cmd_process_tree() {
    assert_handshake_timeout_terminates_process_tree().await;
}

#[cfg(unix)]
#[tokio::test]
async fn unix_process_group_terminates_the_owned_process_tree() {
    assert_handshake_timeout_terminates_process_tree().await;
}

async fn assert_handshake_timeout_terminates_process_tree() {
    let marker = temp_marker("process-tree-pid");
    let marker_text = marker.to_string_lossy().to_string();
    let (_client, mut events, driver) = AcpClient::launch_with_options(
        &profile(
            "process-tree",
            vec![("ZEROWALL_ACP_TREE_MARKER".to_string(), marker_text)],
        ),
        std::env::temp_dir(),
        AcpLaunchOptions {
            handshake_timeout: Duration::from_secs(2),
            shutdown_grace: Duration::from_millis(250),
        },
    );
    let driver = tokio::spawn(driver);
    assert!(matches!(
        next_event(&mut events).await,
        AcpEvent::HandshakeStarted {
            stage: AcpHandshakeStage::Initialize
        }
    ));
    let descendant_pid = wait_for_pid(&marker).await;
    loop {
        if matches!(
            next_event(&mut events).await,
            AcpEvent::Error {
                kind: AcpEventErrorKind::HandshakeTimeout { .. }
            }
        ) {
            break;
        }
    }
    tokio::time::timeout(Duration::from_secs(3), driver)
        .await
        .expect("process-tree driver did not stop")
        .unwrap();
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert!(
        !process_is_alive(descendant_pid),
        "descendant {descendant_pid} survived process-tree teardown"
    );
    let _ = std::fs::remove_file(marker);
}

fn temp_marker(label: &str) -> PathBuf {
    let unique = NEXT_TEMP.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!(
        "zerowall-acp-{label}-{}-{unique}.txt",
        std::process::id()
    ))
}

fn launch_with_prompt_marker(
    marker: &Path,
) -> (AcpClient, AcpEventReceiver, tokio::task::JoinHandle<()>) {
    launch_with_mode_and_prompt_marker("hung-prompt", marker)
}

fn launch_with_mode_and_prompt_marker(
    mode: &str,
    marker: &Path,
) -> (AcpClient, AcpEventReceiver, tokio::task::JoinHandle<()>) {
    let (client, events, driver) = AcpClient::launch_with_options(
        &profile(
            mode,
            vec![(
                "ZEROWALL_ACP_PROMPT_MARKER".to_string(),
                marker.to_string_lossy().to_string(),
            )],
        ),
        std::env::temp_dir(),
        options(),
    );
    (client, events, tokio::spawn(driver))
}

async fn wait_for_marker(marker: &Path) {
    tokio::time::timeout(Duration::from_secs(2), async {
        while !marker.exists() {
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("prompt marker timeout");
}

async fn wait_for_pid(marker: &Path) -> u32 {
    tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            if let Ok(text) = std::fs::read_to_string(marker) {
                if let Ok(pid) = text.trim().parse() {
                    return pid;
                }
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("process-tree marker timeout")
}

#[cfg(unix)]
fn process_is_alive(pid: u32) -> bool {
    unsafe extern "C" {
        fn kill(pid: i32, signal: i32) -> i32;
    }
    unsafe { kill(pid as i32, 0) == 0 }
}

#[cfg(windows)]
fn process_is_alive(pid: u32) -> bool {
    type Handle = *mut std::ffi::c_void;
    const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
    const STILL_ACTIVE: u32 = 259;
    unsafe extern "system" {
        fn OpenProcess(access: u32, inherit_handle: i32, process_id: u32) -> Handle;
        fn GetExitCodeProcess(process: Handle, exit_code: *mut u32) -> i32;
        fn CloseHandle(object: Handle) -> i32;
    }

    unsafe {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if process.is_null() {
            return false;
        }
        let mut exit_code = 0;
        let alive = GetExitCodeProcess(process, &mut exit_code) != 0 && exit_code == STILL_ACTIVE;
        CloseHandle(process);
        alive
    }
}
