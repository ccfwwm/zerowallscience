; Adapted by prepare-nsis-overlay.mjs after verifying the upstream templates.
!macro extractUsing7za FILE
  File /oname=$PLUGINSDIR\zerowall-copy-files.mjs "@ZW_COPY_SCRIPT@"
  File /oname=$PLUGINSDIR\zerowall-owned-files.ps1 "@ZW_UNINSTALL_SCRIPT@"
  File /oname=$PLUGINSDIR\zerowall-access-check.exe "${ZW_UI_BINARY}"
  StrCpy $ZeroWallAttempt 0
  zerowall_extract_retry:
  ${If} $ZeroWallAttempt > 0
    ; These are exclusively owned temporary payloads, never installation data.
    RMDir /r "$ZeroWallPayloadDirectory"
    RMDir /r "$PLUGINSDIR\copy-runtime-$ZeroWallAttempt"
  ${EndIf}
  IntOp $ZeroWallAttempt $ZeroWallAttempt + 1
  ; --move-source consumes files. Every attempt must extract a fresh payload.
  StrCpy $ZeroWallPayloadDirectory "$PLUGINSDIR\payload-$ZeroWallAttempt"
  StrCpy $ZeroWallFailureStage "archive-preflight"
  StrCpy $ZeroWallFailureReason "无法验证解压空间或路径，请查看日志。"
  FileOpen $R0 "$PLUGINSDIR\preflight.ini" w
  FileWriteByte $R0 255
  FileWriteByte $R0 254
  FileClose $R0
  WriteINIStr "$PLUGINSDIR\preflight.ini" "Install" "Directory" "$INSTDIR"
  WriteINIStr "$PLUGINSDIR\preflight.ini" "Install" "PayloadBytes" "${ZW_PAYLOAD_BYTES}"
  WriteINIStr "$PLUGINSDIR\preflight.ini" "Install" "HelperBytes" "${ZW_HELPER_BYTES}"
  WriteINIStr "$PLUGINSDIR\preflight.ini" "Install" "PayloadPath" "${ZW_PAYLOAD_PATH}"
  WriteINIStr "$PLUGINSDIR\preflight.ini" "Install" "TempDirectory" "$ZeroWallPayloadDirectory"
  nsExec::ExecToStack '"$PLUGINSDIR\zerowall-access-check.exe" --preflight "$PLUGINSDIR\preflight.ini"'
  Pop $R0
  Pop $R1
  ${If} $R0 != 0
    ReadINIStr $ZeroWallFailureReason "$PLUGINSDIR\preflight.ini" "Result" "Reason"
    Goto zerowall_extract_failed
  ${EndIf}
  !insertmacro ZW_PHASE "extracting"
  StrCpy $ZeroWallFailureStage "archive-extraction"
  StrCpy $ZeroWallFailureReason "解压未完成或关键文件缺失。请检查临时磁盘空间后重试。"
  Push $OUTDIR
  CreateDirectory "$ZeroWallPayloadDirectory"
  SetOutPath "$ZeroWallPayloadDirectory"
  ClearErrors
  Nsis7z::Extract "${FILE}"
  ; Nsis7z does not push a status: this Pop restores our saved OUTDIR.
  Pop $R0
  SetOutPath $R0
  IfErrors zerowall_extract_failed
  IfFileExists "$ZeroWallPayloadDirectory\ZeroWallScience.exe" 0 zerowall_extract_failed
  IfFileExists "$ZeroWallPayloadDirectory\resources\app.asar" 0 zerowall_extract_failed
  IfFileExists "$ZeroWallPayloadDirectory\resources\installer-owned.json" 0 zerowall_extract_failed
  StrCpy $ZeroWallFailureStage "copy-helper-start"
  StrCpy $ZeroWallFailureReason "复制助手未能启动。请查看日志并重试；若系统阻止程序运行，请联系管理员。"
  CreateDirectory "$PLUGINSDIR\copy-runtime-$ZeroWallAttempt"
  ClearErrors
  CopyFiles /SILENT "$ZeroWallPayloadDirectory\ZeroWallScience.exe" "$PLUGINSDIR\copy-runtime-$ZeroWallAttempt\copy-runtime.exe"
  CopyFiles /SILENT "$ZeroWallPayloadDirectory\icudtl.dat" "$PLUGINSDIR\copy-runtime-$ZeroWallAttempt\icudtl.dat"
  CopyFiles /SILENT "$ZeroWallPayloadDirectory\snapshot_blob.bin" "$PLUGINSDIR\copy-runtime-$ZeroWallAttempt\snapshot_blob.bin"
  CopyFiles /SILENT "$ZeroWallPayloadDirectory\v8_context_snapshot.bin" "$PLUGINSDIR\copy-runtime-$ZeroWallAttempt\v8_context_snapshot.bin"
  IfErrors zerowall_extract_failed
  System::Call 'kernel32::SetEnvironmentVariableW(w "ELECTRON_RUN_AS_NODE", w "1")'
  Delete "$PLUGINSDIR\copy-result.ini"
  nsExec::ExecToStack '"$PLUGINSDIR\copy-runtime-$ZeroWallAttempt\copy-runtime.exe" "$PLUGINSDIR\zerowall-copy-files.mjs" --self-test --result "$PLUGINSDIR\copy-result.ini"'
  Pop $R0
  Pop $R1
  !insertmacro ZW_LOG "helper-self-test-exit=$R0; $R1"
  ${If} $R0 != 0
    Goto zerowall_extract_failed
  ${EndIf}
  ReadINIStr $R0 "$PLUGINSDIR\copy-result.ini" "Result" "Phase"
  ${If} $R0 != "helper-self-test"
    Goto zerowall_extract_failed
  ${EndIf}
  StrCpy $ZeroWallFailureStage "payload-validation"
  StrCpy $ZeroWallFailureReason "安装载荷验证或文件事务未完成。请查看日志。"
  Delete "$PLUGINSDIR\copy-result.ini"
  nsExec::ExecToStack '"$PLUGINSDIR\copy-runtime-$ZeroWallAttempt\copy-runtime.exe" "$PLUGINSDIR\zerowall-copy-files.mjs" "$ZeroWallPayloadDirectory" "$INSTDIR" --move-source --log "$ZeroWallLogFile" --result "$PLUGINSDIR\copy-result.ini"'
  Pop $R0
  Pop $R1
  !insertmacro ZW_LOG "transaction-exit=$R0; $R1"
  System::Call 'kernel32::SetEnvironmentVariableW(w "ELECTRON_RUN_AS_NODE", p 0)'
  ${If} $R0 == 0
    ReadINIStr $R0 "$PLUGINSDIR\copy-result.ini" "Result" "Phase"
    ${If} $R0 == "complete"
      Goto zerowall_extract_complete
    ${EndIf}
  ${EndIf}
  IfFileExists "$PLUGINSDIR\copy-result.ini" 0 zerowall_extract_failed
  ReadINIStr $ZeroWallFailureStage "$PLUGINSDIR\copy-result.ini" "Result" "Phase"
  ReadINIStr $ZeroWallFailureReason "$PLUGINSDIR\copy-result.ini" "Result" "Reason"
  ReadINIStr $R1 "$PLUGINSDIR\copy-result.ini" "Result" "Rollback"
  StrCpy $ZeroWallFailureReason "$ZeroWallFailureReason；恢复状态：$R1"
  zerowall_extract_failed:
  System::Call 'kernel32::SetEnvironmentVariableW(w "ELECTRON_RUN_AS_NODE", p 0)'
  !insertmacro ZW_LOG "installation-failed; stage=$ZeroWallFailureStage; reason=$ZeroWallFailureReason; attempt=$ZeroWallAttempt"
  ${If} $ZeroWallUiState != ""
    WriteINIStr "$ZeroWallUiState" "Install" "FailureStage" "$ZeroWallFailureStage"
    WriteINIStr "$ZeroWallUiState" "Install" "Error" "$ZeroWallFailureReason"
    WriteINIStr "$ZeroWallUiState" "Install" "Action" "waiting"
    !insertmacro ZW_PHASE "failed"
    ${Do}
      ReadINIStr $R0 "$ZeroWallUiState" "Install" "Action"
      ${If} $R0 == "retry-install"
        Goto zerowall_extract_retry
      ${EndIf}
      ${If} $R0 == "change-directory"
        ${If} ${UAC_IsInnerInstance}
          ; Return to the original-user wrapper, which offers per-user setup.
          SetErrorLevel 2
          Quit
        ${EndIf}
        WriteINIStr "$ZeroWallUiState" "Install" "Action" "waiting"
        WriteINIStr "$ZeroWallUiState" "Install" "Notice" "请选择可写目录后继续安装。"
        !insertmacro ZW_PHASE "welcome"
      ${EndIf}
      ${If} $R0 == "start"
        ReadINIStr $INSTDIR "$ZeroWallUiState" "Install" "Directory"
        nsExec::Exec '"$PLUGINSDIR\zerowall-access-check.exe" --can-write "$INSTDIR"'
        Pop $R0
        ${If} $R0 == 0
          StrCpy $appExe "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
          !insertmacro setLinkVars
          SetOutPath "$INSTDIR"
          nsExec::Exec '"$PLUGINSDIR\zerowall-access-check.exe" --stop-running "$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
          Pop $R0
          ${If} $R0 != 1
            StrCpy $ZeroWallFailureStage "destination-preflight"
            StrCpy $ZeroWallFailureReason "请关闭目标目录中运行的应用后重试。"
            Goto zerowall_extract_failed
          ${EndIf}
          Goto zerowall_extract_retry
        ${EndIf}
        WriteINIStr "$ZeroWallUiState" "Install" "Action" "waiting"
        WriteINIStr "$ZeroWallUiState" "Install" "Notice" "此目录仍不可写，请选择当前用户目录，或重新运行安装程序申请授权。"
        !insertmacro ZW_PHASE "welcome"
      ${EndIf}
      ${If} $R0 == "close"
        SetErrorLevel 2
        Quit
      ${EndIf}
      System::Call 'kernel32::WaitForSingleObject(p $ZeroWallUiProcess, i 100)i.r1'
      ${If} $1 == 0
        SetErrorLevel 2
        Quit
      ${EndIf}
    ${Loop}
  ${EndIf}
  SetErrorLevel 2
  Abort
  zerowall_extract_complete:
  ; Directory changes must be reflected in registration and shortcuts.
  StrCpy $appExe "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  !insertmacro setLinkVars
  SetOutPath "$INSTDIR"
!macroend
