; Logical pixels, independent of the Windows display scale.
!define INSTALLER_WINDOW_WIDTH 840
!define INSTALLER_WINDOW_HEIGHT 560
!define INSTALLER_BUTTON_X 404
!define INSTALLER_BUTTON_Y 436
!define INSTALLER_BUTTON_WIDTH 392
!define INSTALLER_BUTTON_HEIGHT 49
!define INSTALLER_BUTTON_DIAMETER 20
!define INSTALLER_STATUS_Y 490
!define INSTALLER_STATUS_HEIGHT 58
; GDI+ ARGB values; GDI text uses COLORREF below.
!define INSTALLER_PRIMARY 0xFF6555E8
!define INSTALLER_PRIMARY_HOVER 0xFF7667EF
!define INSTALLER_PRIMARY_PRESSED 0xFF5141CC
!define INSTALLER_CONTROL_HOVER 0xFFEEF0F2
!define INSTALLER_CONTROL_PRESSED 0xFFD4DBE9
!define INSTALLER_DARK_CONTROL_HOVER 0xFF303034
!define INSTALLER_DARK_CONTROL_PRESSED 0xFF45454B
!define INSTALLER_TRACK_COLOR 0xFFE9ECF2
!define INSTALLER_TEXT_COLORREF 0x3B2317

Var InstallerHighContrast
Var InstallerFontFamily
Var InstallerTheme
Var InstallerBgHex
Var InstallerTextHex
Var InstallerBgArgb
Var InstallerBgColorref
Var InstallerTextColorref
Var InstallerPrimary
Var InstallerPrimaryHover
Var InstallerPrimaryPressed
Var InstallerControlHover
Var InstallerControlPressed
Var InstallerTrack
Var InstallerButtonText
Var InstallerBorder

; SetCtlColors accepts only compile-time colors; choose between the two native palettes.
!macro InstallerControlColors HANDLE
    ${If} $InstallerHighContrast != 0
        SetCtlColors ${HANDLE} "" ""
    ${ElseIf} $InstallerTheme == "dark"
        SetCtlColors ${HANDLE} FFFFFF 192132
    ${Else}
        SetCtlColors ${HANDLE} 17233B FFFFFF
    ${EndIf}
!macroend

Function InstallerResolveTheme
    ${If} $InstallerTheme == "auto"
        ClearErrors
        ReadRegDWORD $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Themes\Personalize" "AppsUseLightTheme"
        ${If} ${Errors}
            StrCpy $0 1
        ${EndIf}
        ${If} $0 == 0
            StrCpy $InstallerTheme "dark"
        ${Else}
            StrCpy $InstallerTheme "light"
        ${EndIf}
    ${EndIf}
    ${If} $InstallerTheme == "dark"
        StrCpy $InstallerBgHex "192132"
        StrCpy $InstallerTextHex "FFFFFF"
        StrCpy $InstallerBgArgb 0xFF192132
        StrCpy $InstallerBgColorref 0x322119
        StrCpy $InstallerTextColorref 0xFFFFFF
        StrCpy $InstallerPrimary 0xFF6555E8
        StrCpy $InstallerPrimaryHover 0xFF7667EF
        StrCpy $InstallerPrimaryPressed 0xFF5141CC
        StrCpy $InstallerControlHover ${INSTALLER_DARK_CONTROL_HOVER}
        StrCpy $InstallerControlPressed ${INSTALLER_DARK_CONTROL_PRESSED}
        StrCpy $InstallerTrack 0xFF61666B
        StrCpy $InstallerButtonText 0xFFFFFF
        StrCpy $InstallerBorder 0xFF61666B
    ${Else}
        StrCpy $InstallerBgHex "FFFFFF"
        StrCpy $InstallerTextHex "17233B"
        StrCpy $InstallerBgArgb 0xFFFFFFFF
        StrCpy $InstallerBgColorref 0xFFFFFF
        StrCpy $InstallerTextColorref ${INSTALLER_TEXT_COLORREF}
        StrCpy $InstallerPrimary ${INSTALLER_PRIMARY}
        StrCpy $InstallerPrimaryHover ${INSTALLER_PRIMARY_HOVER}
        StrCpy $InstallerPrimaryPressed ${INSTALLER_PRIMARY_PRESSED}
        StrCpy $InstallerControlHover ${INSTALLER_CONTROL_HOVER}
        StrCpy $InstallerControlPressed ${INSTALLER_CONTROL_PRESSED}
        StrCpy $InstallerTrack ${INSTALLER_TRACK_COLOR}
        StrCpy $InstallerButtonText 0xFFFFFF
        StrCpy $InstallerBorder 0xFFBBC0C8
    ${EndIf}
    Call InstallerAccessibilityColors
FunctionEnd

!macro InstallerSystemArgb INDEX OUTPUT
    System::Call 'user32::GetSysColor(i ${INDEX}) i.r0'
    IntOp $1 $0 & 0xFF
    IntOp $1 $1 << 16
    IntOp $2 $0 & 0xFF00
    IntOp $1 $1 | $2
    IntOp $0 $0 >> 16
    IntOp $1 $1 | $0
    IntOp ${OUTPUT} $1 | 0xFF000000
!macroend

Function InstallerAccessibilityColors
    StrCpy $3 $InstallerHighContrast
    System::Call '*(i 12, i 0, p 0) p.r0'
    System::Call 'user32::SystemParametersInfoW(i 66, i 12, p r0, i 0)'
    System::Call '*$0(i, i .r1)'
    System::Free $0
    IntOp $InstallerHighContrast $1 & 1
    ${If} $3 != 0
    ${AndIf} $InstallerHighContrast == 0
        Call InstallerResolveTheme
        Return
    ${EndIf}
    ${If} $InstallerHighContrast != 0
        System::Call 'user32::GetSysColor(i 5) i.s'
        Pop $InstallerBgColorref
        System::Call 'user32::GetSysColor(i 8) i.s'
        Pop $InstallerTextColorref
        System::Call 'user32::GetSysColor(i 14) i.s'
        Pop $InstallerButtonText
        ; Convert COLORREF (BGR) into the ARGB expected by GDI+.
        !insertmacro InstallerSystemArgb 5 $InstallerBgArgb
        !insertmacro InstallerSystemArgb 8 $InstallerBorder
        !insertmacro InstallerSystemArgb 13 $InstallerPrimary
        StrCpy $InstallerPrimaryHover $InstallerPrimary
        StrCpy $InstallerPrimaryPressed $InstallerPrimary
        StrCpy $InstallerControlHover $InstallerPrimary
        StrCpy $InstallerControlPressed $InstallerPrimary
    ${EndIf}
FunctionEnd
