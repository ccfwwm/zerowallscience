!macro customHeader
  ShowInstDetails show
  ShowUninstDetails show
!macroend

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
  ${If} ${Silent}
    DetailPrint "正在启动 ZeroWall Science 4.1..."
    ExecShell "open" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ${EndIf}
!macroend

!macro customInit
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
        Banner::show /NOUNLOAD "ZeroWall Science 4.1 升级" "检测到 ZeroWall Science 2.x，正在安全卸载旧程序。项目和账户数据不会删除。"
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
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
  ${if} $R0 == 0
    ${ifNot} ${Silent}
      MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDCANCEL IDOK zerowall_close_process
      Quit
    ${endIf}

    zerowall_close_process:
      DetailPrint "$(appClosing)"
      ${if} $IsPowerShellAvailable == 0
        nsExec::Exec `"$PowerShellPath" -NoProfile -NonInteractive -Command "Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith('$INSTDIR', 'CurrentCultureIgnoreCase')} | % { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"`
      ${else}
        nsExec::Exec `"$CmdPath" /C taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}" /FI "USERNAME eq %USERNAME%"`
      ${endIf}
      Sleep 750
      !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
      ${if} $R0 == 0
        DetailPrint "$(appCannotBeClosed)"
        SetErrorLevel 2
        Quit
      ${endIf}
  ${endIf}
  ; electron-builder hides details before this hook. Re-enable them immediately
  ; before the approximately 500 MB application is copied and decompressed.
  ${IfNot} ${Silent}
    SetDetailsView show
    SetDetailsPrint both
    DetailPrint "准备安装 ZeroWall Science ${VERSION}..."
    DetailPrint "正在解压应用与科研运行时（约 500 MB），大型文件可能需要数分钟..."
  ${EndIf}
!macroend
