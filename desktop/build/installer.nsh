!include LogicLib.nsh

!macro customHeader
  ShowInstDetails show
  ShowUninstDetails show
!macroend

!define ZW_UI_BINARY "${__FILEDIR__}\..\..\.build\installer-ui\modern-installer.exe"
Var ZeroWallUiState
!ifdef BUILD_UNINSTALLER
!macro customUnInit
  StrCpy $ZeroWallUiState ""
!macroend
!endif
!ifndef BUILD_UNINSTALLER
Var ZeroWallUiProcess
!endif
!macro ZW_PHASE value
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
  SetDetailsPrint both
  DetailPrint "桌面和开始菜单应用图标已创建，卸载信息已写入。"
  DetailPrint "ZeroWall Science 安装完成。"
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
        ExecShell "open" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
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
    ; --force-run is already handled by electron-builder: do not launch twice.
    ${IfNot} ${isForceRun}
      ExecShell "open" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ${EndIf}
  ${EndIf}
!macroend

!macro customInit
  StrCpy $ZeroWallUiState ""
  ; Do not silently create a second installation next to a machine-wide copy.
  ReadRegStr $R5 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $hasPerMachineInstallation == "1"
  ${OrIf} $R5 != ""
    ${IfNot} ${Silent}
      MessageBox MB_OK|MB_ICONINFORMATION "检测到为所有用户安装的旧版本。请由管理员卸载旧程序（保留数据），再运行此安装包安装到当前用户。"
    ${EndIf}
    SetErrorLevel 2
    Quit
  ${EndIf}
  !insertmacro setInstallModePerUser
  ${IfNot} ${Silent}
    InitPluginsDir
    StrCpy $ZeroWallUiState "$PLUGINSDIR\zerowall-install.ini"
    FileOpen $R0 "$ZeroWallUiState" w
    FileWriteByte $R0 255
    FileWriteByte $R0 254
    FileClose $R0
    WriteINIStr "$ZeroWallUiState" "Install" "Version" "${VERSION}"
    WriteINIStr "$ZeroWallUiState" "Install" "Directory" "$INSTDIR"
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
  !insertmacro ZW_PHASE "extracting"
!macroend
