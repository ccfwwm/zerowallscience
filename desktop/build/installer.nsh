!include LogicLib.nsh
!include "${__FILEDIR__}\..\out\installer-paths.nsh"

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    RequestExecutionLevel user
  !endif
  ; makensis searches its working directory before include directories.
  ; Select the generated section explicitly without replacing the main script
  ; (which would disable electron-builder's uninstaller generation/signing).
  !ifndef BUILD_UNINSTALLER
    !cd "${ZW_NSIS_OVERLAY}"
    !include "${ZW_NSIS_OVERLAY}\installer-definitions.nsh"
    Function ZeroWallRegisterUser
      SetShellVarContext current
      StrCpy $appExe "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      StrCpy $keepShortcuts "false"
      !insertmacro setLinkVars
      !insertmacro registryAddInstallInfo
      !insertmacro addStartMenuLink $keepShortcuts
      !insertmacro addDesktopLink $keepShortcuts
      ${If} $ZeroWallUiState != ""
        ReadINIStr $R0 "$ZeroWallUiState" "Install" "DesktopShortcut"
        ${If} $R0 == "0"
          Delete "$newDesktopLink"
        ${EndIf}
      ${EndIf}
    FunctionEnd
    !ifndef ZW_INSTALLER_TEST_MODE
    Function ZeroWallUserPath
      nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\commands\installer-user-upgrade.ps1" -InstallRoot "$INSTDIR" -OldInstallRoot "$ZeroWallOldDirectory"'
      Pop $R0
      !ifndef ZW_INSTALLER_TEST_MODE
        nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\commands\install-command-path.ps1" install'
        Pop $R0
      !endif
    FunctionEnd
    !endif
  !endif
  ShowInstDetails show
  ShowUninstDetails show
!macroend

Var ZeroWallUiState
Var ZeroWallPerfFile
Var ZeroWallLogFile
Var ZeroWallOldDirectory
!ifndef BUILD_UNINSTALLER
Var ZeroWallSelectedDirectory
Var ZeroWallSelectedMode
Var keepShortcuts
!endif
!ifdef BUILD_UNINSTALLER
!macro customUnInit
  StrCpy $ZeroWallUiState ""
  StrCpy $ZeroWallPerfFile ""
  StrCpy $ZeroWallLogFile ""
  StrCpy $ZeroWallOldDirectory ""
!macroend
!endif
!ifndef BUILD_UNINSTALLER
Var ZeroWallUiProcess
!endif
!macro ZW_LOG message
  ${If} $ZeroWallLogFile != ""
    Push $R8
    Push $R9
    System::Call 'kernel32::GetTickCount64() l.R8'
    ClearErrors
    FileOpen $R9 "$ZeroWallLogFile" a
    ${IfNot} ${Errors}
      ; NSIS append mode preserves content but leaves the cursor at offset 0.
      FileSeek $R9 0 END
      FileWriteUTF16LE /BOM $R9 "$R8|${message}$\r$\n"
      FileClose $R9
    ${EndIf}
    Pop $R9
    Pop $R8
  ${EndIf}
!macroend
!macro ZW_PHASE value
  !insertmacro ZW_LOG "phase=${value}"
  ${If} $ZeroWallPerfFile != ""
    Push $R8
    Push $R9
    System::Call 'kernel32::GetTickCount64() l.R8'
    ClearErrors
    FileOpen $R9 "$ZeroWallPerfFile" a
    ${IfNot} ${Errors}
      FileSeek $R9 0 END
      FileWrite $R9 "$R8|${value}$\r$\n"
      FileClose $R9
    ${EndIf}
    Pop $R9
    Pop $R8
  ${EndIf}
  ${If} $ZeroWallUiState != ""
    WriteINIStr "$ZeroWallUiState" "Install" "Phase" "${value}"
  ${EndIf}
!macroend

!ifndef BUILD_UNINSTALLER
Function .onInstFailed
  !insertmacro ZW_PHASE "failed"
  ${If} $ZeroWallUiState != ""
    MessageBox MB_OK|MB_ICONSTOP "安装未完成，请检查磁盘空间和目录权限后重试。用户数据未被删除。"
  ${EndIf}
FunctionEnd
!endif

!ifndef ZEROWALL_V2_UNINSTALL_REGKEY
  !define ZEROWALL_V2_UNINSTALL_REGKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ZeroWall Science"
!endif
!ifndef ZEROWALL_V2_LOCAL_DIR
  !define ZEROWALL_V2_LOCAL_DIR "$LOCALAPPDATA\ZeroWall Science"
!endif
!ifndef ZEROWALL_V1_LOCAL_DIR
  !define ZEROWALL_V1_LOCAL_DIR "$LOCALAPPDATA\科研无界 ZeroWallScience"
!endif

!macro customFiles_x64
  !insertmacro ZW_PHASE "finalizing"
  SetDetailsPrint both
  DetailPrint "应用与科研运行时解压完成，正在完成安装..."
!macroend

!macro customInstall
  ; The isolated regression installer must not touch the formal command PATH
  ; owner (HKCU\Software\ZeroWallScience\Command). Production builds leave
  ; this guard undefined and retain the normal registration behavior.
  !ifndef ZW_INSTALLER_TEST_MODE
  ${If} ${UAC_IsInnerInstance}
    !insertmacro UAC_AsUser_Call Function ZeroWallUserPath ${UAC_SYNCINSTDIR}
  ${Else}
    Call ZeroWallUserPath
  ${EndIf}
  !endif
  ${If} $ZeroWallOldDirectory != ""
  ${AndIf} $ZeroWallOldDirectory != $INSTDIR
    ; Incoming signed payload and ownership have committed. Remove only files
    ; listed by the old installation; its Python and user files remain in place.
    nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\commands\uninstall-owned-files.ps1" -InstallRoot "$ZeroWallOldDirectory" -PreserveIfUnmanaged'
    Pop $R0
    Pop $R1
    !insertmacro ZW_LOG "old-application-cleanup-exit=$R0; $R1"
  ${EndIf}
  SetDetailsPrint both
  DetailPrint "桌面和开始菜单应用图标已创建，卸载信息已写入。"
  DetailPrint "ZeroWall Science 安装完成。"
  !insertmacro ZW_PHASE "complete"
  ; The deployed 2.x updater invokes the verified 3.0 installer with /S and
  ; then exits. Start the new Electron app from the installer so the updater
  ; never needs to know the new executable or installation directory.
  ${If} $ZeroWallUiState != ""
    ReadINIStr $R0 "$ZeroWallUiState" "Install" "DesktopShortcut"
    ${If} $R0 == "0"
    ${AndIf} $keepShortcuts == "false"
      Delete "$newDesktopLink"
    ${EndIf}
    !insertmacro ZW_PHASE "complete"
    ${Do}
      ReadINIStr $R0 "$ZeroWallUiState" "Install" "Action"
      ${If} $R0 == "launch"
        !insertmacro UAC_AsUser_ExecShell "open" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR" SW_SHOWNORMAL
        ${Break}
      ${EndIf}
      ${If} $R0 == "close"
        ${Break}
      ${EndIf}
      System::Call 'kernel32::WaitForSingleObject(p $ZeroWallUiProcess, i 100)i.r1'
    ${LoopUntil} $1 == 0
    System::Call 'kernel32::CloseHandle(p $ZeroWallUiProcess)'
    SetErrorLevel 0
    Quit
  ${ElseIf} ${Silent}
    ${If} ${isForceRun}
      !insertmacro UAC_AsUser_ExecShell "open" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--updated" "$INSTDIR" SW_SHOWNORMAL
    ${Else}
      ${GetParameters} $R0
      ${GetOptions} $R0 "/no-launch" $R1
      ${If} ${Errors}
        !insertmacro UAC_AsUser_ExecShell "open" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR" SW_SHOWNORMAL
      ${EndIf}
    ${EndIf}
    SetErrorLevel 0
    Quit
  ${EndIf}
!macroend

!macro customUnInstall
  !ifndef ZW_INSTALLER_TEST_MODE
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\commands\install-command-path.ps1" remove'
  Pop $R0
  !endif
!macroend

; electron-builder's default recursively removes $INSTDIR. Use the exact
; afterPack ownership inventory so the fixed Python runtime and user files stay.
!macro customRemoveFiles
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\commands\uninstall-owned-files.ps1" -InstallRoot "$INSTDIR"'
  Pop $R0
  ${If} $R0 != 0
    MessageBox MB_OK|MB_ICONSTOP "无法核验安装文件归属，卸载已停止。Python 和用户文件已保留。"
    Abort
  ${EndIf}
  SetOutPath $TEMP
  Delete "$INSTDIR\${UNINSTALL_FILENAME}"
  RMDir "$INSTDIR"
!macroend

!macro customCheckAppRunning
  !insertmacro ZW_PHASE "stopping"
  InitPluginsDir
  File /oname=$PLUGINSDIR\zerowall-process-control.exe "${ZW_UI_BINARY}"
  zerowall_retry_process:
  !insertmacro ZW_PHASE "stopping"
  nsExec::Exec '"$PLUGINSDIR\zerowall-process-control.exe" --stop-running "$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  Pop $R0
  ${If} $R0 != 1
    !ifndef BUILD_UNINSTALLER
    ${If} $ZeroWallUiState != ""
      ; Modern UI intentionally runs NSIS silently. Never use a silent
      ; MessageBox default to decide whether this interactive user cancels.
      WriteINIStr "$ZeroWallUiState" "Install" "Action" "waiting"
      WriteINIStr "$ZeroWallUiState" "Install" "TargetExecutable" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      !insertmacro ZW_PHASE "process-blocked"
      ${Do}
        ReadINIStr $R0 "$ZeroWallUiState" "Install" "Action"
        ${If} $R0 == "retry-process"
          Goto zerowall_retry_process
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
    !endif
    ${IfNot} ${Silent}
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "请关闭 ZeroWall Science 后点击重试，安装将继续。" IDRETRY zerowall_retry_process
    ${EndIf}
    SetErrorLevel 2
    Quit
  ${EndIf}
  ${If} $ZeroWallOldDirectory != ""
  ${AndIf} $ZeroWallOldDirectory != $INSTDIR
    nsExec::Exec '"$PLUGINSDIR\zerowall-process-control.exe" --stop-running "$ZeroWallOldDirectory\${APP_EXECUTABLE_FILENAME}"'
    Pop $R0
    ${If} $R0 != 1
      !insertmacro ZW_LOG "old-executable-still-running; path=$ZeroWallOldDirectory\${APP_EXECUTABLE_FILENAME}"
      SetErrorLevel 2
      Quit
    ${EndIf}
  ${EndIf}
  !insertmacro ZW_PHASE "extracting"
!macroend

!macro customInit
  ${If} ${UAC_IsInnerInstance}
    !insertmacro UAC_AsUser_GetGlobal $INSTDIR $ZeroWallSelectedDirectory
    !insertmacro UAC_AsUser_GetGlobal $installMode $ZeroWallSelectedMode
    !insertmacro UAC_AsUser_GetGlobal $ZeroWallOldDirectory $ZeroWallOldDirectory
    !insertmacro UAC_AsUser_GetGlobal $ZeroWallUiState $ZeroWallUiState
    !insertmacro UAC_AsUser_GetGlobal $ZeroWallLogFile $ZeroWallLogFile
    !insertmacro UAC_AsUser_GetGlobal $ZeroWallPerfFile $ZeroWallPerfFile
    ${If} $ZeroWallUiState != ""
      ReadINIStr $R1 "$ZeroWallUiState" "Install" "UiPid"
      System::Call 'kernel32::OpenProcess(i 0x100000, i 0, i R1)p.s'
      Pop $ZeroWallUiProcess
    ${EndIf}
    ${If} $installMode == "all"
      SetShellVarContext all
    ${Else}
      SetShellVarContext current
      StrCpy $hasPerMachineInstallation "0"
    ${EndIf}
    SetSilent silent
    Goto zerowall_identity_ready
  ${EndIf}
  StrCpy $ZeroWallUiState ""
  StrCpy $ZeroWallPerfFile ""
  CreateDirectory "$LOCALAPPDATA\zerowall-science\logs"
  System::Call 'kernel32::GetCurrentProcessId()i.r0'
  StrCpy $ZeroWallLogFile "$LOCALAPPDATA\zerowall-science\logs\installer-${VERSION}-$0.log"
  !insertmacro ZW_LOG "installer-start; version=${VERSION}"
  !insertmacro ZW_LOG "entry-token=invoker"
  ${GetParameters} $R0
  ${GetOptions} $R0 "/ZW_PERF=" $ZeroWallPerfFile
  ClearErrors
  ; When both scopes exist, the running updater's explicit directory decides
  ; which registration to replace instead of starting a different installed copy.
  !insertmacro GetDParameter $R0
  ${If} $R0 != ""
    ReadRegStr $R1 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $R0 == $R1
      !insertmacro setInstallModePerAllUsers
    ${Else}
      ReadRegStr $R1 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
      ${If} $R0 == $R1
        !insertmacro setInstallModePerUser
      ${EndIf}
    ${EndIf}
  ${EndIf}
  ; initMultiUser already restores the existing scope and directory, including
  ; /currentuser, /allusers and /D from the updater. Never force a scope migration.
  ${If} $installMode != "all"
    ; The standard silent install section otherwise prefers HKLM even when
    ; a current-user installation was explicitly selected alongside it.
    StrCpy $hasPerMachineInstallation "0"
  ${EndIf}
  ReadRegStr $ZeroWallOldDirectory SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${IfNot} ${Silent}
    InitPluginsDir
    StrCpy $ZeroWallUiState "$PLUGINSDIR\zerowall-install.ini"
    FileOpen $R0 "$ZeroWallUiState" w
    FileWriteByte $R0 255
    FileWriteByte $R0 254
    FileClose $R0
    WriteINIStr "$ZeroWallUiState" "Install" "Version" "${VERSION}"
    WriteINIStr "$ZeroWallUiState" "Install" "Directory" "$INSTDIR"
    WriteINIStr "$ZeroWallUiState" "Install" "Scope" "$installMode"
    WriteINIStr "$ZeroWallUiState" "Install" "LogFile" "$ZeroWallLogFile"
    File /oname=$PLUGINSDIR\modern-installer.exe "${ZW_UI_BINARY}"
    System::Call 'kernel32::GetCurrentProcessId()i.r0'
    Exec '"$PLUGINSDIR\modern-installer.exe" "$ZeroWallUiState" $0'
    StrCpy $R2 0
    ${Do}
      ReadINIStr $R1 "$ZeroWallUiState" "Install" "UiPid"
      ${If} $R1 != ""
        ${Break}
      ${EndIf}
      Sleep 100
      IntOp $R2 $R2 + 1
    ${LoopUntil} $R2 > 150
    System::Call 'kernel32::OpenProcess(i 0x100000, i 0, i R1)p.s'
    Pop $ZeroWallUiProcess
    ${If} $ZeroWallUiProcess == 0
      MessageBox MB_OK|MB_ICONSTOP "无法打开安装界面，请重新运行安装程序。"
      SetErrorLevel 2
      Quit
    ${EndIf}
    ${Do}
      ReadINIStr $R0 "$ZeroWallUiState" "Install" "Action"
      ${If} $R0 == "start"
        ${Break}
      ${EndIf}
      ${If} $R0 == "close"
        Quit
      ${EndIf}
      System::Call 'kernel32::WaitForSingleObject(p $ZeroWallUiProcess, i 100)i.r1'
      ${If} $1 == 0
        Quit
      ${EndIf}
    ${Loop}
    ReadINIStr $INSTDIR "$ZeroWallUiState" "Install" "Directory"
    SetSilent silent
    !insertmacro ZW_PHASE "preparing"
  ${EndIf}
  StrCpy $ZeroWallSelectedDirectory $INSTDIR
  StrCpy $ZeroWallSelectedMode $installMode
  InitPluginsDir
  File /oname=$PLUGINSDIR\zerowall-access-check.exe "${ZW_UI_BINARY}"
  nsExec::ExecToStack '"$PLUGINSDIR\zerowall-access-check.exe" --can-write "$INSTDIR"'
  Pop $R0
  Pop $R1
  ${If} $R0 == 0
  ${AndIf} $ZeroWallOldDirectory != ""
  ${AndIf} $ZeroWallOldDirectory != $INSTDIR
    nsExec::ExecToStack '"$PLUGINSDIR\zerowall-access-check.exe" --can-write "$ZeroWallOldDirectory"'
    Pop $R0
    Pop $R1
  ${EndIf}
  ${If} $R0 != 0
  ${OrIf} $installMode == "all"
    ${IfNot} ${UAC_IsAdmin}
      !insertmacro ZW_PHASE "elevating"
      StrCpy $R6 0
      zerowall_retry_elevation:
      !insertmacro UAC_RunElevated
      ${If} $0 == 0
      ${AndIf} $1 == 3
        IntOp $R6 $R6 + 1
        ${If} $R6 < 3
          Goto zerowall_retry_elevation
        ${EndIf}
        StrCpy $0 740
      ${EndIf}
      ${If} $0 == 0
      ${AndIf} $1 == 1
        ; The wrapper has waited for the inner process. Preserve its result.
        SetErrorLevel $2
        Quit
      ${EndIf}
      ${If} $0 != 0
        !insertmacro ZW_LOG "elevation-failed; code=$0"
        ${If} $ZeroWallUiState != ""
          WriteINIStr "$ZeroWallUiState" "Install" "Error" "授权已取消或无法获得目录写入权限。用户数据未修改。"
        ${EndIf}
        SetErrorLevel $0
        Quit
      ${EndIf}
      ${If} $1 != 2
        SetErrorLevel 740
        Quit
      ${EndIf}
    ${EndIf}
  ${EndIf}
  zerowall_identity_ready:
  !insertmacro ZW_LOG "install-directory=$INSTDIR; scope=$installMode"
  ; electron-builder skips CHECK_APP_RUNNING for an elevated inner instance.
  ${If} ${UAC_IsInnerInstance}
    !insertmacro customCheckAppRunning
  ${EndIf}
  ; Legacy 2.x probing can find and invoke a real user's old uninstaller. It is
  ; part of the formal product upgrade only; the isolated test must never
  ; inspect or stop that installation.
  !ifndef ZW_INSTALLER_TEST_MODE
  StrCmp "${PRODUCT_NAME}" "ZeroWall Science" zerowall_migrate_v2 zerowall_migrate_done

  zerowall_migrate_v2:
    StrCpy $R8 ""
    ; Tauri 2.x registers its uninstaller under the product name. Reading the
    ; command first also covers a user-selected installation directory.
    ReadRegStr $R8 HKCU "${ZEROWALL_V2_UNINSTALL_REGKEY}" "UninstallString"
    ${If} $R8 == ""
      ReadRegStr $R8 HKLM "${ZEROWALL_V2_UNINSTALL_REGKEY}" "UninstallString"
    ${EndIf}
    ; Historical releases predate the stable registry contract. Keep their
    ; two known per-user paths as explicit, auditable fallbacks.
    ${If} $R8 == ""
    ${AndIf} ${FileExists} "${ZEROWALL_V2_LOCAL_DIR}\uninstall.exe"
      StrCpy $R8 '"${ZEROWALL_V2_LOCAL_DIR}\uninstall.exe"'
    ${EndIf}
    ${If} $R8 == ""
    ${AndIf} ${FileExists} "${ZEROWALL_V1_LOCAL_DIR}\uninstall.exe"
      StrCpy $R8 '"${ZEROWALL_V1_LOCAL_DIR}\uninstall.exe"'
    ${EndIf}

    ${If} $R8 != ""
      ${IfNot} ${Silent}
        Banner::show /NOUNLOAD "ZeroWall Science 升级" "检测到 ZeroWall Science 2.x，正在安全卸载旧程序。项目和账户数据不会删除。"
      ${EndIf}
      ; /T terminates the Tauri process tree, including any legacy DSH Host,
      ; before the old uninstaller removes locked files.
      nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM "zerowall-tauri.exe"`
      ExecWait '$R8 /S' $R9
      ${IfNot} ${Silent}
        Banner::destroy
      ${EndIf}
      ${If} $R9 != 0
        SetErrorLevel 2
        Abort "ZeroWall Science 2.x 卸载失败（退出代码 $R9）。请关闭旧版本后重试。"
      ${EndIf}
    ${EndIf}

  zerowall_migrate_done:
  !endif
!macroend
