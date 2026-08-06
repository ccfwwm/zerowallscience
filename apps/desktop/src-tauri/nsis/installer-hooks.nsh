; Keep upgrades out of temporary smoke-test directories. Tauri's NSIS
; current-user default is %LOCALAPPDATA%\ZeroWall Science, but NSIS restores
; any path saved by an older installer before this hook runs.
!macro NSIS_HOOK_PREINSTALL
  ; Check the restored (possibly legacy Temp) directory before redirecting it.
  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"
  StrCpy $INSTDIR "$LOCALAPPDATA\ZeroWall Science"
  SetOutPath "$INSTDIR"
!macroend
