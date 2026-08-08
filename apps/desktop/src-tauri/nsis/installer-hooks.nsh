; Keep upgrades out of temporary smoke-test directories. Tauri's NSIS
; current-user default is %LOCALAPPDATA%\ZeroWall Science, but NSIS restores
; any path saved by an older installer before this hook runs.
!macro NSIS_HOOK_PREINSTALL
  ; Check the restored (possibly legacy Temp) directory before redirecting it.
  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"

  ; ZeroWall Science 1.0 starts clean. Do not preserve pre-1.0 app data.
  ; Prefer the legacy uninstaller when present, then remove known legacy roots.
  IfFileExists "$LOCALAPPDATA\ZeroWall Science\uninstall.exe" 0 +2
    ExecWait '"$LOCALAPPDATA\ZeroWall Science\uninstall.exe" /S'
  RMDir /r "$LOCALAPPDATA\ZeroWall Science"
  RMDir /r "$LOCALAPPDATA\com.zerowall.science"
  RMDir /r "$APPDATA\com.zerowall.science"
  RMDir /r "$DOCUMENTS\ZeroWallScience"

  StrCpy $INSTDIR "$LOCALAPPDATA\ZeroWall Science"
  SetOutPath "$INSTDIR"
!macroend
