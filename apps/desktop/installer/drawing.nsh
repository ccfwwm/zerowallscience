; Windows GDI+ supplies antialiasing for the native controls.
Var InstallerGdiToken

!macro InstallerPixelFont HANDLE SIZE WEIGHT
    System::Call 'kernel32::MulDiv(i -${SIZE}, i $InstallerDpi, i 96) i.r0'
    System::Call 'gdi32::CreateFontW(i r0, i 0, i 0, i 0, i ${WEIGHT}, i 0, i 0, i 0, i 1, i 0, i 0, i 5, i 0, w "$InstallerFontFamily") p.s'
    Pop ${HANDLE}
!macroend

; Produces a closed rounded rectangle. Inputs and output must not use $0/$1.
!macro InstallerRoundPath PATH WIDTH HEIGHT DIAMETER
    System::Call 'gdiplus::GdipCreatePath(i 0, *p .s)'
    Pop ${PATH}
    IntOp $0 ${WIDTH} - ${DIAMETER}
    IntOp $1 ${HEIGHT} - ${DIAMETER}
    ; System.dll has no float argument type. The arc angles use IEEE-754 bits.
    System::Call 'gdiplus::GdipAddPathArcI(p ${PATH}, i 0, i 0, i ${DIAMETER}, i ${DIAMETER}, i 0x43340000, i 0x42B40000)'
    System::Call 'gdiplus::GdipAddPathArcI(p ${PATH}, i r0, i 0, i ${DIAMETER}, i ${DIAMETER}, i 0x43870000, i 0x42B40000)'
    System::Call 'gdiplus::GdipAddPathArcI(p ${PATH}, i r0, i r1, i ${DIAMETER}, i ${DIAMETER}, i 0, i 0x42B40000)'
    System::Call 'gdiplus::GdipAddPathArcI(p ${PATH}, i 0, i r1, i ${DIAMETER}, i ${DIAMETER}, i 0x42B40000, i 0x42B40000)'
    System::Call 'gdiplus::GdipClosePathFigure(p ${PATH})'
!macroend

Function InstallerDrawEditFrame
    System::Call '$PLUGINSDIR\window-frame.dll::InstallerBindEditFrame(p $InstallerEditFrame, i $InstallerBgArgb, i $InstallerBorder) i.r0 ?c'
FunctionEnd
