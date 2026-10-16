; Only electron-builder.installer-test.cjs selects this wrapper. The pinned
; electron-builder 26.15.3 accepts one include path, so define the test mode
; before including the shared lifecycle for both installer and uninstaller.
!searchreplace ZW_INSTALLER_TEST_KEY "${VERSION}" "." ""
!if "${APP_ID}" != "com.zerowall.science.installer-test-${ZW_INSTALLER_TEST_KEY}"
  !error "Isolated installer include requires the versioned test app ID"
!endif
!define ZW_INSTALLER_TEST_MODE
!include "${__FILEDIR__}\installer.nsh"
