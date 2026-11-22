Var InstallerProgressWindow

Function InstallerGuiInit
    HideWindow
    System::Call 'user32::SetWindowLongW(p $HWNDPARENT, i -16, i 0x800A0000)'
    System::Call '$PLUGINSDIR\window-frame.dll::InstallerApplyFrame(p $HWNDPARENT) i.r0 ?c'
    ${If} $0 < 0
        MessageBox MB_OK|MB_ICONSTOP "$(INSTALLER_UI_ERROR)"
        SetErrorLevel 2
        Quit
    ${EndIf}
    System::Call '$PLUGINSDIR\window-frame.dll::InstallerInitialLayout(p $HWNDPARENT) i.s ?c'
    Pop $InstallerDpi
    GetDlgItem $0 $HWNDPARENT 1
    ShowWindow $0 0
    GetDlgItem $0 $HWNDPARENT 2
    ShowWindow $0 0
    GetDlgItem $0 $HWNDPARENT 3
    ShowWindow $0 0
    GetDlgItem $0 $HWNDPARENT 1028
    ShowWindow $0 0
    GetDlgItem $0 $HWNDPARENT 1256
    ShowWindow $0 0
FunctionEnd

Function InstallerWelcome
    ${If} $InstallerWelcomeAccepted == 1
        Abort
    ${EndIf}
    ${If} ${isUpdated}
        Abort
    ${EndIf}
    StrCpy $InstallerPhase "welcome"
    Call InstallerCreate
FunctionEnd

Function InstallerBeforeInstall
    SetAutoClose true
    Call InstallerEnsureElevation
    ${If} $InstallerError != ""
        MessageBox MB_OK|MB_ICONEXCLAMATION "$InstallerError" /SD IDOK
        SetErrorLevel 2
        Quit
    ${EndIf}
    Call InstallerPreflight
    ${If} $InstallerError != ""
        MessageBox MB_OK|MB_ICONEXCLAMATION "$InstallerError" /SD IDOK
        SetErrorLevel 2
        Quit
    ${EndIf}
    Call InstallerCheckAppRunning
FunctionEnd

Function InstallerProgressShow
    ; Only the stock worker executes installation; this overlay runs on the UI thread.
    ShowWindow $mui.InstFilesPage 0
    StrCpy $0 0
    ${If} $InstallerTheme == "dark"
        StrCpy $0 1
    ${EndIf}
    System::Call '$PLUGINSDIR\window-frame.dll::InstallerGetDpi(p $HWNDPARENT) i.s ?c'
    Pop $InstallerDpi
    System::Call '$PLUGINSDIR\window-frame.dll::InstallerShowProgress(p $HWNDPARENT, p $mui.InstFilesPage.ProgressBar, i r0, i $InstallerDpi, i $InstallerControlHover, i $InstallerControlPressed, w "$PLUGINSDIR", w "$(INSTALLER_NATIVE_PROGRESS)", w "$(INSTALLER_PROGRESS_EXTRACT)", w "$(INSTALLER_PROGRESS_COPY)", w "$(INSTALLER_PROGRESS_REGISTER)", w "$(INSTALLER_PROGRESS_CLEAN)", w "$(INSTALLER_INSTALLING_TITLE)", w "$(INSTALLER_INSTALLING_SUBTITLE)", w "$(INSTALLER_READY)", w "$(INSTALLER_STEP_PREPARE)", w "$(INSTALLER_STEP_FILES)", w "$(INSTALLER_STEP_CONFIGURE)", w "$(INSTALLER_STEP_READY)", w "$(INSTALLER_FEATURES)") p.s ?c'
    Pop $InstallerProgressWindow
    ${If} $InstallerProgressWindow == 0
        MessageBox MB_OK|MB_ICONSTOP "$(INSTALLER_UI_ERROR)"
        SetErrorLevel 2
        Quit
    ${EndIf}
    System::Call 'user32::SetPropW(p $HWNDPARENT, w "HarnessInstaller.Ready", p 1)'
    ShowWindow $HWNDPARENT 5
FunctionEnd

Function .onInstFailed
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(INSTALLER_FAILED)" /SD IDOK
    SetErrorLevel 2
    Quit
FunctionEnd

Function InstallerFinish
    System::Call '$PLUGINSDIR\window-frame.dll::InstallerFinishProgress(p $InstallerProgressWindow) i.r0 ?c'
    ${If} $0 == 0
        Quit
    ${EndIf}
    System::Call 'user32::DestroyWindow(p $InstallerProgressWindow)'
    StrCpy $InstallerPhase "success"
    Call InstallerCreate
FunctionEnd
