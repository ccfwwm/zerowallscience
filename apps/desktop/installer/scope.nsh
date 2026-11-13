; Scope selection and UAC handoff belong to the custom welcome page.
Var InstallerScopeControl
Var InstallerScopeLocked
Var InstallerWelcomeAccepted

Function InstallerInitializeScope
    StrCpy $InstallerScopeLocked 0
    StrCpy $InstallerWelcomeAccepted 0
    StrCpy $InstallerPath $INSTDIR
    ${If} ${UAC_IsInnerInstance}
        !insertmacro UAC_AsUser_GetGlobalVar $InstallerPath
        !insertmacro UAC_AsUser_GetGlobalVar $InstallerTheme
        !insertmacro UAC_AsUser_GetGlobalVar $InstallerWelcomeAccepted
        !insertmacro setInstallModePerAllUsers
        StrCpy $INSTDIR $InstallerPath
        StrCpy $InstallerScopeLocked 1
        Return
    ${EndIf}
    ${If} ${isForAllUsers}
    ${OrIf} ${isForCurrentUser}
        StrCpy $InstallerScopeLocked 1
        Return
    ${EndIf}
    ${If} ${isUpdated}
        StrCpy $InstallerScopeLocked 1
        !insertmacro GetDParameter $R0
        ${If} $R0 != ""
            GetFullPathName $1 "$R0\."
            ${If} $perUserInstallationFolder != ""
                GetFullPathName $2 "$perUserInstallationFolder\."
                ${If} $1 == $2
                    !insertmacro setInstallModePerUser
                    StrCpy $InstallerPath $INSTDIR
                    Return
                ${EndIf}
            ${EndIf}
            ${If} $perMachineInstallationFolder != ""
                GetFullPathName $2 "$perMachineInstallationFolder\."
                ${If} $1 == $2
                    !insertmacro setInstallModePerAllUsers
                    StrCpy $InstallerPath $INSTDIR
                    Return
                ${EndIf}
            ${EndIf}
            MessageBox MB_OK|MB_ICONEXCLAMATION "$(INSTALLER_SCOPE_ERROR)" /SD IDOK
            SetErrorLevel 2
            Quit
        ${ElseIf} $hasPerMachineInstallation == 1
        ${AndIf} $hasPerUserInstallation == 1
            MessageBox MB_OK|MB_ICONEXCLAMATION "$(INSTALLER_SCOPE_ERROR)" /SD IDOK
            SetErrorLevel 2
            Quit
        ${EndIf}
    ${EndIf}
FunctionEnd

; The elevated instance reads the edited path and theme from its waiting outer instance.
Function InstallerEnsureElevation
    StrCpy $InstallerError ""
    ${If} $installMode != "all"
        Return
    ${EndIf}
    ${If} ${UAC_IsAdmin}
        Return
    ${EndIf}
    HideWindow
    !insertmacro UAC_RunElevated
    ${If} $0 == 0
    ${AndIf} $1 == 1
        SetErrorLevel $2
        Quit
    ${EndIf}
    StrCpy $InstallerError "$(INSTALLER_ELEVATION_FAILED)"
    ${If} ${Silent}
        SetErrorLevel 2
        Quit
    ${EndIf}
    ShowWindow $HWNDPARENT 5
    BringToFront
FunctionEnd

Function InstallerScopeChanged
    Pop $0
    ${NSD_GetState} $InstallerScopeControl $0
    ${If} $0 == ${BST_CHECKED}
        !insertmacro setInstallModePerAllUsers
    ${Else}
        !insertmacro setInstallModePerUser
    ${EndIf}
    StrCpy $InstallerPath $INSTDIR
    ${NSD_SetText} $InstallerEdit $InstallerPath
    Call InstallerValidateEditedPath
FunctionEnd
