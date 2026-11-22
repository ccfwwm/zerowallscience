; Native welcome and finish pages for the electron-builder installer.
!ifndef HARNESS_INSTALLER_UI
!define HARNESS_INSTALLER_UI
!define WM_NOTIFY_OUTER_NEXT 0x408

Var InstallerDialog
Var InstallerPhase
Var InstallerDpi
Var InstallerScene
Var InstallerSuccessMark
Var InstallerHeadingFont
Var InstallerPathFont
Var InstallerButton
Var InstallerStatus
Var InstallerIntro
Var InstallerFeatures
Var InstallerFont
Var InstallerSmallFont
Var InstallerChoose
Var InstallerEdit
Var InstallerEditFrame
Var InstallerBrowse
Var InstallerLaunch
Var InstallerMinimizeButton
Var InstallerCloseButton
!include "${__FILEDIR__}\path.nsh"
!include "${__FILEDIR__}\scope.nsh"
!include "${__FILEDIR__}\drawing.nsh"

; All layout values are 96-DPI logical pixels.
!macro InstallerPlace HWND X Y W H
    System::Call '$PLUGINSDIR\window-frame.dll::InstallerGetDpi(p $HWNDPARENT) i.s ?c'
    Pop $InstallerDpi
    System::Call 'kernel32::MulDiv(i ${X}, i $InstallerDpi, i 96) i.r0'
    System::Call 'kernel32::MulDiv(i ${Y}, i $InstallerDpi, i 96) i.r1'
    System::Call 'kernel32::MulDiv(i ${W}, i $InstallerDpi, i 96) i.r2'
    System::Call 'kernel32::MulDiv(i ${H}, i $InstallerDpi, i 96) i.r3'
    System::Call 'user32::MoveWindow(p ${HWND}, i r0, i r1, i r2, i r3, i 1)'
!macroend

Function InstallerCreate
    nsDialogs::Create 1018
    Pop $InstallerDialog
    ${If} $InstallerDialog == error
        Abort
    ${EndIf}
    System::Call '$PLUGINSDIR\window-frame.dll::InstallerGetDpi(p $HWNDPARENT) i.s ?c'
    Pop $InstallerDpi
    !insertmacro InstallerPlace $InstallerDialog 0 0 ${INSTALLER_WINDOW_WIDTH} ${INSTALLER_WINDOW_HEIGHT}
    !insertmacro InstallerControlColors $HWNDPARENT
    !insertmacro InstallerControlColors $InstallerDialog
    StrCpy $0 0
    ${If} $InstallerTheme == "dark"
        StrCpy $0 1
    ${EndIf}
    StrCpy $1 0
    ${If} $InstallerPhase == "success"
        StrCpy $1 1
    ${EndIf}
    System::Call '$PLUGINSDIR\window-frame.dll::InstallerCreateScene(p $InstallerDialog, i r0, i $InstallerDpi, i r1, w "$PLUGINSDIR", w "$(INSTALLER_FEATURES)") p.s ?c'
    Pop $InstallerScene
    StrCpy $InstallerFontFamily "Microsoft YaHei UI"
    System::Call '$PLUGINSDIR\window-frame.dll::InstallerSceneFontReady(p $InstallerScene) i.r0 ?c'
    ${If} $0 != 0
        StrCpy $InstallerFontFamily "ZeroWall Research Sans"
    ${EndIf}
    !insertmacro InstallerPixelFont $InstallerFont 16 450
    !insertmacro InstallerPixelFont $InstallerSmallFont 14 450
    !insertmacro InstallerPixelFont $InstallerHeadingFont 31 500
    ; Arbitrary folder names use a system font with full Windows glyph fallback.
    StrCpy $5 $InstallerFontFamily
    StrCpy $InstallerFontFamily "Segoe UI"
    !insertmacro InstallerPixelFont $InstallerPathFont 13 400
    StrCpy $InstallerFontFamily $5
    System::Call '*(i 1, p 0, i 0, i 0) p.r0'
    System::Call 'gdiplus::GdiplusStartup(*p .r1, p r0, p 0) i.r2'
    StrCpy $InstallerGdiToken $1
    System::Free $0
    ${If} $2 != 0
        MessageBox MB_OK|MB_ICONSTOP "$(INSTALLER_UI_ERROR)"
        SetErrorLevel 2
        Quit
    ${EndIf}
    ${NSD_CreateLabel} 0 0 0 0 "$(INSTALLER_TITLE)"
    Pop $InstallerIntro
    !insertmacro InstallerPlace $InstallerIntro 404 119 392 88
    SendMessage $InstallerIntro ${WM_SETFONT} $InstallerHeadingFont 1
    !insertmacro InstallerControlColors $InstallerIntro
    ${NSD_CreateLabel} 0 0 0 0 "$(INSTALLER_INTRO)"
    Pop $InstallerFeatures
    !insertmacro InstallerPlace $InstallerFeatures 404 218 392 48
    SendMessage $InstallerFeatures ${WM_SETFONT} $InstallerFont 1
    !insertmacro InstallerControlColors $InstallerFeatures
    ${NSD_CreateButton} 0 0 0 0 "−"
    Pop $InstallerMinimizeButton
    !insertmacro InstallerPlace $InstallerMinimizeButton 744 8 40 32
    SendMessage $InstallerMinimizeButton ${WM_SETFONT} $InstallerFont 1
    ${NSD_OnClick} $InstallerMinimizeButton InstallerMinimize
    ${NSD_OnNotify} $InstallerMinimizeButton InstallerPaintButton
    ${NSD_CreateButton} 0 0 0 0 "×"
    Pop $InstallerCloseButton
    !insertmacro InstallerPlace $InstallerCloseButton 788 8 40 32
    SendMessage $InstallerCloseButton ${WM_SETFONT} $InstallerFont 1
    ${NSD_OnClick} $InstallerCloseButton InstallerClose
    ${NSD_OnNotify} $InstallerCloseButton InstallerPaintButton
    ${NSD_CreateLabel} 0 0 0 0 ""
    Pop $InstallerStatus
    !insertmacro InstallerPlace $InstallerStatus 404 490 392 58
    SendMessage $InstallerStatus ${WM_SETFONT} $InstallerSmallFont 1
    !insertmacro InstallerControlColors $InstallerStatus
    ${NSD_CreateLabel} 0 0 0 0 "$(INSTALLER_CHOOSE_PATH)"
    Pop $InstallerChoose
    !insertmacro InstallerPlace $InstallerChoose 404 283 392 25
    SendMessage $InstallerChoose ${WM_SETFONT} $InstallerSmallFont 1
    !insertmacro InstallerControlColors $InstallerChoose
    ${NSD_CreateBitmap} 0 0 0 0 ""
    Pop $InstallerEditFrame
    !insertmacro InstallerPlace $InstallerEditFrame 404 315 300 49
    Call InstallerDrawEditFrame
    ${NSD_CreateText} 0 0 0 0 "$InstallerPath"
    Pop $InstallerEdit
    System::Call 'user32::GetWindowLongW(p $InstallerEdit, i -16) i.r0'
    IntOp $0 $0 & 0xFF7FFFFF
    System::Call 'user32::SetWindowLongW(p $InstallerEdit, i -16, i r0)'
    System::Call 'user32::GetWindowLongW(p $InstallerEdit, i -20) i.r0'
    IntOp $0 $0 & 0xFFFFFDFF
    System::Call 'user32::SetWindowLongW(p $InstallerEdit, i -20, i r0)'
    SendMessage $InstallerEdit ${WM_SETFONT} $InstallerPathFont 1
    !insertmacro InstallerPlace $InstallerEdit 416 330 276 23
    System::Call 'user32::SetWindowPos(p $InstallerEditFrame, p 1, i 0, i 0, i 0, i 0, i 0x13)'
    System::Call 'user32::SetWindowPos(p $InstallerEdit, p 0, i 0, i 0, i 0, i 0, i 0x13)'
    SendMessage $InstallerEdit ${EM_SETLIMITTEXT} 180 0
    !insertmacro InstallerControlColors $InstallerEdit
    ${NSD_OnChange} $InstallerEdit InstallerPathChanged
    ${NSD_CreateButton} 0 0 0 0 "$(INSTALLER_BROWSE)"
    Pop $InstallerBrowse
    !insertmacro InstallerPlace $InstallerBrowse 716 315 80 49
    SendMessage $InstallerBrowse ${WM_SETFONT} $InstallerSmallFont 1
    ${NSD_OnClick} $InstallerBrowse InstallerBrowsePath
    ${NSD_OnNotify} $InstallerBrowse InstallerPaintButton
    ${NSD_CreateCheckbox} 0 0 0 0 "$(INSTALLER_ALL_USERS)"
    Pop $InstallerScopeControl
    !insertmacro InstallerPlace $InstallerScopeControl 396 374 400 32
    SendMessage $InstallerScopeControl ${WM_SETFONT} $InstallerSmallFont 1
    !insertmacro InstallerControlColors $InstallerScopeControl
    ${If} $installMode == "all"
        ${NSD_Check} $InstallerScopeControl
    ${EndIf}
    ${If} $InstallerScopeLocked == 1
        EnableWindow $InstallerScopeControl 0
    ${EndIf}
    ${NSD_OnClick} $InstallerScopeControl InstallerScopeChanged
    ${NSD_CreateCheckbox} 0 0 0 0 "$(INSTALLER_LAUNCH)"
    Pop $InstallerLaunch
    !insertmacro InstallerPlace $InstallerLaunch 396 374 400 32
    SendMessage $InstallerLaunch ${WM_SETFONT} $InstallerSmallFont 1
    !insertmacro InstallerControlColors $InstallerLaunch
    ${NSD_Check} $InstallerLaunch
    ${NSD_CreateButton} 0 0 0 0 "$(INSTALLER_INSTALL)"
    Pop $InstallerButton
    !insertmacro InstallerPlace $InstallerButton ${INSTALLER_BUTTON_X} ${INSTALLER_BUTTON_Y} ${INSTALLER_BUTTON_WIDTH} ${INSTALLER_BUTTON_HEIGHT}
    SendMessage $InstallerButton ${WM_SETFONT} $InstallerFont 1
    ${NSD_OnClick} $InstallerButton InstallerStart
    ${NSD_OnNotify} $InstallerButton InstallerPaintButton
    ${NSD_CreateLabel} 0 0 0 0 "✓"
    Pop $InstallerSuccessMark
    !insertmacro InstallerPlace $InstallerSuccessMark 404 109 70 58
    SendMessage $InstallerSuccessMark ${WM_SETFONT} $InstallerHeadingFont 1
    !insertmacro InstallerControlColors $InstallerSuccessMark
    Call InstallerRender
    System::Call '$PLUGINSDIR\window-frame.dll::InstallerBindPage(p $InstallerDialog) i.r0 ?c'
    System::Call 'user32::SetPropW(p $HWNDPARENT, w "HarnessInstaller.Ready", p 1)'
    ShowWindow $InstallerDialog 5
    ShowWindow $HWNDPARENT 5
    ${If} $InstallerPhase == "welcome"
        System::Call '$PLUGINSDIR\window-frame.dll::InstallerPresentWelcome(p $HWNDPARENT) i.r0 ?c'
    ${EndIf}
    nsDialogs::Show
    ${NSD_KillTimer} InstallerValidateEditedPath
    System::Call 'gdiplus::GdiplusShutdown(p $InstallerGdiToken)'
    System::Call 'gdi32::DeleteObject(p $InstallerFont)'
    System::Call 'gdi32::DeleteObject(p $InstallerSmallFont)'
    System::Call 'gdi32::DeleteObject(p $InstallerHeadingFont)'
    System::Call 'gdi32::DeleteObject(p $InstallerPathFont)'
    System::Call 'user32::DestroyWindow(p $InstallerScene)'
FunctionEnd

Function InstallerRender
    ShowWindow $InstallerSuccessMark 0
    ShowWindow $InstallerLaunch 0
    ShowWindow $InstallerStatus 0
    ${If} $InstallerPhase == "success"
        ShowWindow $InstallerScopeControl 0
        ShowWindow $InstallerSuccessMark 5
        ${NSD_SetText} $InstallerIntro "$(INSTALLER_READY)"
        !insertmacro InstallerPlace $InstallerIntro 404 188 392 88
        ShowWindow $InstallerIntro 5
        System::Call 'user32::InvalidateRect(p $InstallerIntro, p 0, i 1)'
        ${NSD_SetText} $InstallerFeatures "$(INSTALLER_NETWORK_NOTE)"
        !insertmacro InstallerPlace $InstallerFeatures 404 277 392 64
        SendMessage $InstallerFeatures ${WM_SETFONT} $InstallerSmallFont 1
        ShowWindow $InstallerFeatures 5
        System::Call 'user32::InvalidateRect(p $InstallerFeatures, p 0, i 1)'
        ${NSD_SetText} $InstallerButton "$(INSTALLER_FINISH)"
        ShowWindow $InstallerChoose 0
        ShowWindow $InstallerEdit 0
        ShowWindow $InstallerEditFrame 0
        ShowWindow $InstallerBrowse 0
        ShowWindow $InstallerLaunch 5
    ${EndIf}
FunctionEnd

Function InstallerStart
    Pop $0
    SendMessage $HWNDPARENT ${WM_NOTIFY_OUTER_NEXT} 1 0
FunctionEnd

; Page leave callbacks also run when Enter activates NSIS's hidden default button.
Function InstallerWelcomeLeave
    ${NSD_GetText} $InstallerEdit $InstallerPath
    Call InstallerValidatePath
    ${If} $InstallerError != ""
        MessageBox MB_OK|MB_ICONEXCLAMATION "$InstallerError"
        Abort
    ${EndIf}
    StrCpy $InstallerWelcomeAccepted 1
    Call InstallerEnsureElevation
    ${If} $InstallerError != ""
        StrCpy $InstallerWelcomeAccepted 0
        MessageBox MB_OK|MB_ICONEXCLAMATION "$InstallerError"
        Abort
    ${EndIf}
    Call InstallerPreflight
    ${If} $InstallerError != ""
        MessageBox MB_OK|MB_ICONEXCLAMATION "$InstallerError"
        Abort
    ${EndIf}
FunctionEnd

Function InstallerFinishLeave
    ${NSD_GetState} $InstallerLaunch $0
    HideWindow
    ${If} $0 == ${BST_CHECKED}
        StrCpy $0 ""
        ${If} ${isUpdated}
            StrCpy $0 "--updated"
        ${EndIf}
        ClearErrors
        ${If} ${UAC_IsAdmin}
            ; An explicitly elevated installer must still launch through the user's shell.
            ${StdUtils.ExecShellAsUser} $1 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "open" "$0"
            ${If} $1 != "ok"
            ${AndIf} $1 != "fallback"
                SetErrors
            ${EndIf}
        ${Else}
            ; Per-user installation can create the process without Explorer/shortcut dispatch.
            Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" $0'
        ${EndIf}
        ${If} ${Errors}
            ShowWindow $HWNDPARENT 5
            MessageBox MB_OK|MB_ICONEXCLAMATION "$(INSTALLER_LAUNCH_FAILED)"
            Abort
        ${EndIf}
    ${EndIf}
FunctionEnd


Function InstallerPathChanged
    Pop $0
    ${NSD_CreateTimer} InstallerValidateEditedPath 450
FunctionEnd

Function InstallerValidateEditedPath
    ${NSD_KillTimer} InstallerValidateEditedPath
    ${If} $InstallerPhase != "welcome"
        Return
    ${EndIf}
    ${NSD_GetText} $InstallerEdit $InstallerPath
    Call InstallerValidatePath
    ${NSD_SetText} $InstallerStatus "$InstallerError"
    !insertmacro InstallerPlace $InstallerStatus 404 490 392 58
    ShowWindow $InstallerStatus 5
FunctionEnd

Function InstallerBrowsePath
    Pop $0
    nsDialogs::SelectFolderDialog "$(INSTALLER_CHOOSE_PATH)" "$InstallerPath"
    Pop $0
    ${If} $0 != "error"
        ${NSD_SetText} $InstallerEdit "$0"
        Call InstallerValidateEditedPath
    ${EndIf}
FunctionEnd


; NM_CUSTOMDRAW keeps native button focus, keyboard input and accessible text.
; This NMCUSTOMDRAW layout is for the x86 NSIS stub, including on x64 Windows.
Function InstallerPaintButton
    Pop $R0
    Pop $R1
    Pop $R2
    ${If} $R1 != -12
        Return
    ${EndIf}
    System::Call '*$R2(p, p, i, i .R3, p .R4, i .R5, i .R6, i .R7, i .R8, p, i .R9)'
    ${If} $R3 != 1
        Return
    ${EndIf}
    System::Call '$PLUGINSDIR\window-frame.dll::InstallerGetDpi(p $HWNDPARENT) i.s ?c'
    Pop $InstallerDpi
    Call InstallerAccessibilityColors
    System::Call 'gdi32::SaveDC(p R4)'
    System::Alloc 16
    Pop $R2
    System::Call 'user32::GetClientRect(p R0, p R2)'
    System::Call 'gdi32::CreateSolidBrush(i $InstallerBgColorref) p.R3'
    System::Call 'user32::FillRect(p R4, p R2, p R3)'
    System::Call 'gdi32::DeleteObject(p R3)'
    StrCpy $R3 $InstallerBgArgb
    ${If} $R0 == $InstallerButton
        StrCpy $R3 $InstallerPrimary
        IntOp $R1 $R9 & 64
        ${If} $R1 != 0
            StrCpy $R3 $InstallerPrimaryHover
        ${EndIf}
        IntOp $R1 $R9 & 1
        ${If} $R1 != 0
            StrCpy $R3 $InstallerPrimaryPressed
        ${EndIf}
    ${Else}
        IntOp $R1 $R9 & 65
        ${If} $R1 != 0
            StrCpy $R3 $InstallerControlHover
        ${EndIf}
        ${If} $R0 == $InstallerMinimizeButton
        ${OrIf} $R0 == $InstallerCloseButton
            IntOp $R1 $R9 & 1
            ${If} $R1 != 0
                StrCpy $R3 $InstallerControlPressed
            ${EndIf}
        ${EndIf}
    ${EndIf}
    System::Call 'gdiplus::GdipCreateSolidFill(i R3, *p .R1)'
    System::Call 'gdiplus::GdipCreateFromHDC(p R4, *p .R5)'
    System::Call 'gdiplus::GdipSetSmoothingMode(p R5, i 4)'
    System::Call 'gdiplus::GdipSetPixelOffsetMode(p R5, i 4)'
    System::Call 'kernel32::MulDiv(i ${INSTALLER_BUTTON_DIAMETER}, i $InstallerDpi, i 96) i.R3'
    ${If} $R0 == $InstallerBrowse
        System::Call 'kernel32::MulDiv(i 12, i $InstallerDpi, i 96) i.R3'
    ${EndIf}
    !insertmacro InstallerRoundPath $R6 $R7 $R8 $R3
    System::Call 'gdiplus::GdipFillPath(p R5, p R1, p R6)'
    ${If} $R0 == $InstallerBrowse
        System::Call 'gdiplus::GdipCreatePen1(i $InstallerBorder, i 0x40000000, i 2, *p .r2)'
        System::Call 'gdiplus::GdipDrawPath(p R5, p r2, p R6)'
        System::Call 'gdiplus::GdipDeletePen(p r2)'
    ${EndIf}
    System::Call 'gdiplus::GdipDeletePath(p R6)'
    System::Call 'gdiplus::GdipDeleteGraphics(p R5)'
    System::Call 'gdiplus::GdipDeleteBrush(p R1)'
    System::Call 'gdi32::SetBkMode(p R4, i 1)'
    ${If} $R0 == $InstallerButton
        System::Call 'gdi32::SetTextColor(p R4, i $InstallerButtonText)'
    ${Else}
        System::Call 'gdi32::SetTextColor(p R4, i $InstallerTextColorref)'
    ${EndIf}
    SendMessage $R0 ${WM_GETFONT} 0 0 $R1
    System::Call 'gdi32::SelectObject(p R4, p R1)'
    ${NSD_GetText} $R0 $R3
    System::Call 'user32::DrawTextW(p R4, w R3, i -1, p R2, i 0x25)'
    IntOp $R9 $R9 & 16
    ${If} $R9 != 0
        System::Call 'user32::InflateRect(p R2, i -4, i -4)'
        System::Call 'user32::DrawFocusRect(p R4, p R2)'
    ${EndIf}
    System::Call 'gdi32::RestoreDC(p R4, i -1)'
    System::Free $R2
    ${NSD_Return} 4
FunctionEnd

Function InstallerMinimize
    Pop $0
    ShowWindow $HWNDPARENT 6
FunctionEnd

Function InstallerClose
    Pop $0
    System::Call 'user32::PostMessageW(p $HWNDPARENT, i ${WM_CLOSE}, p 0, p 0)'
FunctionEnd
!endif
