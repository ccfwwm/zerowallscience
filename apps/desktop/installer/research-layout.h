// Logical control geometry and owned fonts follow the active monitor's work area.
#pragma once

namespace research {
constexpr UINT Relayout = WM_APP + 410;
inline void OwnDialogScaling(HWND window) {
    using ChangeBehavior = BOOL(WINAPI *)(HWND, int, int);
    const auto setBehavior =
        reinterpret_cast<ChangeBehavior>(GetProcAddress(GetModuleHandleW(L"user32.dll"), "SetDialogDpiChangeBehavior"));
    if (setBehavior)
        setBehavior(window, 1, 1); // DDC_DISABLE_ALL: geometry and fonts are owned here.
}
inline UINT Dpi(HWND window) {
    const auto dpi = reinterpret_cast<UINT_PTR>(GetPropW(Root(window), L"HarnessInstaller.Dpi"));
    return dpi ? static_cast<UINT>(dpi) : 96;
}
inline UINT FitDpi(const RECT &work, UINT requested) {
    return std::max(48u,
                    std::min(requested, static_cast<UINT>(std::min(MulDiv(work.right - work.left - 24, 96, Width),
                                                                   MulDiv(work.bottom - work.top - 24, 96, Height)))));
}
struct ControlLayout {
    RECT logical{};
    LOGFONTW logicalFont{};
    HFONT ownedFont = nullptr;
    bool hasFont = false;
    bool label = false;
    bool checkbox = false;
    std::shared_ptr<Art> art;
    ~ControlLayout() {
        if (ownedFont)
            DeleteObject(ownedFont);
    }
};
inline LRESULT CALLBACK LayoutProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam, UINT_PTR id,
                                   DWORD_PTR data) {
    auto *layout = reinterpret_cast<ControlLayout *>(data);
    if ((message == WM_PAINT || message == WM_PRINT || message == WM_PRINTCLIENT) && !IsWindowVisible(window)) {
        ValidateRect(window, nullptr);
        return 0;
    }
    if ((layout->label || layout->checkbox) &&
        (message == WM_PAINT || message == WM_PRINTCLIENT || message == WM_PRINT)) {
        PAINTSTRUCT paint{};
        HDC dc = message == WM_PAINT ? BeginPaint(window, &paint) : reinterpret_cast<HDC>(wparam);
        const int saved = SaveDC(dc);
        RECT bounds{};
        GetClientRect(window, &bounds);
        const bool dark = GetPropW(Root(window), L"HarnessInstaller.Dark") != nullptr;
        const COLORREF background = HighContrast() ? GetSysColor(COLOR_WINDOW)
                                    : dark         ? RGB(25, 33, 50)
                                                   : RGB(255, 255, 255);
        HBRUSH brush = CreateSolidBrush(background);
        FillRect(dc, &bounds, brush);
        DeleteObject(brush);
        SetBkMode(dc, TRANSPARENT);
        SetTextColor(dc, HighContrast() ? GetSysColor(COLOR_WINDOWTEXT) : dark ? RGB(238, 241, 250) : RGB(23, 35, 59));
        SelectObject(dc, reinterpret_cast<HFONT>(SendMessageW(window, WM_GETFONT, 0, 0)));
        if (layout->checkbox) {
            Graphics graphics(dc);
            graphics.SetClip(Rect(0, 0, bounds.right, bounds.bottom));
            graphics.SetSmoothingMode(SmoothingModeAntiAlias);
            const REAL scale = Dpi(window) / 96.0f;
            const REAL left = 8 * scale, top = 7 * scale, size = 18 * scale, radius = 5 * scale;
            GraphicsPath path;
            path.AddArc(left, top, radius, radius, 180, 90);
            path.AddArc(left + size - radius, top, radius, radius, 270, 90);
            path.AddArc(left + size - radius, top + size - radius, radius, radius, 0, 90);
            path.AddArc(left, top + size - radius, radius, radius, 90, 90);
            path.CloseFigure();
            const bool checked = SendMessageW(window, BM_GETCHECK, 0, 0) == BST_CHECKED;
            SolidBrush fill(checked ? HighContrast() ? SystemColor(COLOR_HIGHLIGHT) : Color(255, 101, 85, 232)
                                    : Color(255, GetRValue(background), GetGValue(background), GetBValue(background)));
            graphics.FillPath(&fill, &path);
            Pen border(HighContrast() ? SystemColor(COLOR_WINDOWTEXT) : Color(255, 170, 180, 200), 1);
            if (!checked)
                graphics.DrawPath(&border, &path);
            if (checked) {
                Pen check(HighContrast() ? SystemColor(COLOR_HIGHLIGHTTEXT) : Color(255, 255, 255, 255), 2 * scale);
                graphics.DrawLine(&check, left + 4 * scale, top + 9 * scale, left + 8 * scale, top + 13 * scale);
                graphics.DrawLine(&check, left + 8 * scale, top + 13 * scale, left + 14 * scale, top + 5 * scale);
            }
            bounds.left = MulDiv(34, Dpi(window), 96);
        }
        WCHAR text[2048]{};
        GetWindowTextW(window, text, 2048);
        if (layout->art && layout->art->fontReady && -layout->logicalFont.lfHeight >= 20) {
            Graphics graphics(dc);
            graphics.SetClip(Rect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top));
            graphics.SetTextRenderingHint(TextRenderingHintAntiAliasGridFit);
            const bool large = -layout->logicalFont.lfHeight >= 20;
            FontFamily family(large ? L"ZeroWall Research Sans" : L"Microsoft YaHei UI",
                              large ? &layout->art->fonts : nullptr);
            Font font(&family, static_cast<REAL>(-MulDiv(layout->logicalFont.lfHeight, Dpi(window), 96)),
                      FontStyleRegular, UnitPixel);
            StringFormat format;
            format.SetLineAlignment(layout->checkbox ? StringAlignmentCenter : StringAlignmentNear);
            SolidBrush ink(HighContrast() ? SystemColor(COLOR_WINDOWTEXT)
                           : dark         ? Color(255, 238, 241, 250)
                                          : Color(255, 23, 35, 59));
            graphics.DrawString(text, -1, &font,
                                RectF(static_cast<REAL>(bounds.left), static_cast<REAL>(bounds.top),
                                      static_cast<REAL>(bounds.right - bounds.left),
                                      static_cast<REAL>(bounds.bottom - bounds.top)),
                                &format, &ink);
        } else {
            DrawTextW(dc, text, -1, &bounds,
                      DT_LEFT | DT_NOPREFIX | (layout->checkbox ? DT_SINGLELINE | DT_VCENTER : DT_WORDBREAK));
        }
        if (layout->checkbox && GetFocus() == window && !(SendMessageW(window, WM_QUERYUISTATE, 0, 0) & UISF_HIDEFOCUS))
            DrawFocusRect(dc, &bounds);
        // Caller-owned print DCs contain all text when this callback returns.
        GdiFlush();
        RestoreDC(dc, saved);
        if (message == WM_PAINT)
            EndPaint(window, &paint);
        return 0;
    }
    if (HighContrast() && (message == WM_CTLCOLORSTATIC || message == WM_CTLCOLOREDIT || message == WM_CTLCOLORBTN)) {
        HDC dc = reinterpret_cast<HDC>(wparam);
        SetTextColor(dc, GetSysColor(COLOR_WINDOWTEXT));
        SetBkColor(dc, GetSysColor(COLOR_WINDOW));
        return reinterpret_cast<LRESULT>(GetSysColorBrush(COLOR_WINDOW));
    }
    if (message == Relayout) {
        const int dpi = static_cast<int>(wparam);
        const RECT &r = layout->logical;
        MoveWindow(window, MulDiv(r.left, dpi, 96), MulDiv(r.top, dpi, 96), MulDiv(r.right - r.left, dpi, 96),
                   MulDiv(r.bottom - r.top, dpi, 96), FALSE);
        if (layout->hasFont) {
            LOGFONTW font = layout->logicalFont;
            font.lfHeight = MulDiv(font.lfHeight, dpi, 96);
            HFONT replacement = CreateFontIndirectW(&font);
            if (replacement) {
                SendMessageW(window, WM_SETFONT, reinterpret_cast<WPARAM>(replacement), FALSE);
                if (layout->ownedFont)
                    DeleteObject(layout->ownedFont);
                layout->ownedFont = replacement;
            }
        }
    }
    if (message == WM_NCDESTROY) {
        RemoveWindowSubclass(window, LayoutProc, id);
        delete layout;
    }
    return DefSubclassProc(window, message, wparam, lparam);
}

struct EditFrame {
    ARGB background;
    ARGB border;
};
inline LRESULT CALLBACK EditFrameProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam, UINT_PTR id,
                                      DWORD_PTR data) {
    auto *colors = reinterpret_cast<EditFrame *>(data);
    if ((message == WM_PAINT || message == WM_PRINT || message == WM_PRINTCLIENT) && !IsWindowVisible(window)) {
        ValidateRect(window, nullptr);
        return 0;
    }
    if (message == WM_PAINT || message == WM_PRINTCLIENT) {
        PAINTSTRUCT paint{};
        HDC dc = message == WM_PAINT ? BeginPaint(window, &paint) : reinterpret_cast<HDC>(wparam);
        RECT client{};
        GetClientRect(window, &client);
        Graphics graphics(dc);
        graphics.SetClip(Rect(0, 0, client.right, client.bottom));
        SolidBrush background(HighContrast() ? SystemColor(COLOR_WINDOW) : Color(colors->background));
        graphics.FillRectangle(&background, 0, 0, client.right, client.bottom);
        graphics.SetSmoothingMode(SmoothingModeAntiAlias);
        const REAL diameter = 12.0f * Dpi(window) / 96;
        const REAL width = static_cast<REAL>(client.right - 1), height = static_cast<REAL>(client.bottom - 1);
        GraphicsPath path;
        path.AddArc(0.0f, 0.0f, diameter, diameter, 180, 90);
        path.AddArc(width - diameter, 0.0f, diameter, diameter, 270, 90);
        path.AddArc(width - diameter, height - diameter, diameter, diameter, 0, 90);
        path.AddArc(0.0f, height - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        Pen pen(HighContrast() ? SystemColor(COLOR_WINDOWTEXT) : Color(colors->border), 1);
        graphics.DrawPath(&pen, &path);
        if (message == WM_PAINT)
            EndPaint(window, &paint);
        return 0;
    }
    if (message == WM_NCDESTROY) {
        RemoveWindowSubclass(window, EditFrameProc, id);
        delete colors;
    }
    return DefSubclassProc(window, message, wparam, lparam);
}
inline bool IsScene(HWND window) {
    WCHAR name[64]{};
    GetClassNameW(window, name, 64);
    return wcscmp(name, L"HarnessInstallerScene") == 0 || wcscmp(name, L"HarnessInstallerProgress") == 0;
}
inline BOOL CALLBACK BindControl(HWND window, LPARAM data) {
    if (IsScene(window))
        return TRUE;
    const int dpi = static_cast<int>(Dpi(window));
    std::unique_ptr<ControlLayout> layout(new (std::nothrow) ControlLayout{});
    if (!layout)
        return FALSE;
    WCHAR className[32]{};
    GetClassNameW(window, className, 32);
    const LONG style = GetWindowLongW(window, GWL_STYLE);
    layout->label = wcscmp(className, L"Static") == 0 && (style & SS_TYPEMASK) <= SS_RIGHT;
    layout->checkbox = wcscmp(className, L"Button") == 0 && (style & BS_TYPEMASK) == BS_AUTOCHECKBOX;
    GetWindowRect(window, &layout->logical);
    MapWindowPoints(nullptr, GetParent(window), reinterpret_cast<POINT *>(&layout->logical), 2);
    auto &r = layout->logical;
    r = {MulDiv(r.left, 96, dpi), MulDiv(r.top, 96, dpi), MulDiv(r.right, 96, dpi), MulDiv(r.bottom, 96, dpi)};
    HFONT font = reinterpret_cast<HFONT>(SendMessageW(window, WM_GETFONT, 0, 0));
    layout->hasFont = font && GetObjectW(font, sizeof(LOGFONTW), &layout->logicalFont);
    if (layout->hasFont)
        layout->logicalFont.lfHeight = MulDiv(layout->logicalFont.lfHeight, 96, dpi);
    if (layout->hasFont && (layout->label || layout->checkbox) && -layout->logicalFont.lfHeight < 20) {
        lstrcpynW(layout->logicalFont.lfFaceName, L"Microsoft YaHei UI", LF_FACESIZE);
        LOGFONTW systemFont = layout->logicalFont;
        systemFont.lfHeight = MulDiv(systemFont.lfHeight, dpi, 96);
        layout->ownedFont = CreateFontIndirectW(&systemFont);
        if (layout->ownedFont)
            SendMessageW(window, WM_SETFONT, reinterpret_cast<WPARAM>(layout->ownedFont), FALSE);
    }
    layout->art = *reinterpret_cast<std::shared_ptr<Art> *>(data);
    if (!SetWindowSubclass(window, LayoutProc, 1, reinterpret_cast<DWORD_PTR>(layout.get())))
        return FALSE;
    layout.release();
    return TRUE;
}
inline BOOL CALLBACK ResizeControl(HWND window, LPARAM dpi) {
    SendMessageW(window, Relayout, static_cast<WPARAM>(dpi), 0);
    return TRUE;
}
inline BOOL CALLBACK SettingsControl(HWND window, LPARAM) {
    if (IsScene(window))
        SendMessageW(window, WM_SETTINGCHANGE, 0, 0);
    return TRUE;
}
} // namespace research

// A control's font registration outlives the scene until its final native control is destroyed.
extern "C" __declspec(dllexport) BOOL __cdecl InstallerBindPage(HWND dialog) {
    research::OwnDialogScaling(dialog);
    HWND scene = FindWindowExW(dialog, nullptr, L"HarnessInstallerScene", nullptr);
    auto *page = reinterpret_cast<ProgressPage *>(GetWindowLongPtrW(scene, GWLP_USERDATA));
    std::shared_ptr<research::Art> art = page ? page->art : nullptr;
    return research::BindControl(dialog, reinterpret_cast<LPARAM>(&art)) &&
           EnumChildWindows(dialog, research::BindControl, reinterpret_cast<LPARAM>(&art));
}

extern "C" __declspec(dllexport) UINT __cdecl InstallerGetDpi(HWND window) {
    return research::Dpi(window);
}

// Native painting keeps the edit border sharp when monitor scale changes.
extern "C" __declspec(dllexport) BOOL __cdecl InstallerBindEditFrame(HWND window, ARGB background, ARGB border) {
    auto *colors = new (std::nothrow) research::EditFrame{background, border};
    if (!colors)
        return FALSE;
    if (!SetWindowSubclass(window, research::EditFrameProc, 2, reinterpret_cast<DWORD_PTR>(colors))) {
        delete colors;
        return FALSE;
    }
    return TRUE;
}

// The visible cursor's monitor determines initial DPI and a bounded, centered window.
extern "C" __declspec(dllexport) UINT __cdecl InstallerInitialLayout(HWND window) {
    research::OwnDialogScaling(window);
    POINT cursor{};
    GetCursorPos(&cursor);
    HMONITOR monitor = MonitorFromPoint(cursor, MONITOR_DEFAULTTONEAREST);
    MONITORINFO info{sizeof(info), {}, {}, 0};
    GetMonitorInfoW(monitor, &info);
    UINT dpi = 96;
    HMODULE shcore = LoadLibraryW(L"shcore.dll");
    if (shcore) {
        using MonitorDpi = HRESULT(WINAPI *)(HMONITOR, int, UINT *, UINT *);
        const auto getDpi = reinterpret_cast<MonitorDpi>(GetProcAddress(shcore, "GetDpiForMonitor"));
        UINT vertical = 96;
        if (getDpi)
            getDpi(monitor, 0, &dpi, &vertical);
        FreeLibrary(shcore);
    }
    dpi = research::FitDpi(info.rcWork, dpi);
    SetPropW(window, L"HarnessInstaller.Dpi", reinterpret_cast<HANDLE>(static_cast<UINT_PTR>(dpi)));
    const int width = MulDiv(840, dpi, 96), height = MulDiv(560, dpi, 96);
    SetWindowPos(window, nullptr, info.rcWork.left + (info.rcWork.right - info.rcWork.left - width) / 2,
                 info.rcWork.top + (info.rcWork.bottom - info.rcWork.top - height) / 2, width, height,
                 SWP_NOZORDER | SWP_NOACTIVATE);
    using WindowDpi = UINT(WINAPI *)(HWND);
    const auto getWindowDpi =
        reinterpret_cast<WindowDpi>(GetProcAddress(GetModuleHandleW(L"user32.dll"), "GetDpiForWindow"));
    if (getWindowDpi)
        dpi = research::FitDpi(info.rcWork, getWindowDpi(window));
    SetPropW(window, L"HarnessInstaller.Dpi", reinterpret_cast<HANDLE>(static_cast<UINT_PTR>(dpi)));
    const int actualWidth = MulDiv(840, dpi, 96), actualHeight = MulDiv(560, dpi, 96);
    SetWindowPos(window, nullptr, info.rcWork.left + (info.rcWork.right - info.rcWork.left - actualWidth) / 2,
                 info.rcWork.top + (info.rcWork.bottom - info.rcWork.top - actualHeight) / 2, actualWidth, actualHeight,
                 SWP_NOZORDER | SWP_NOACTIVATE);
    return dpi;
}
