// Keeps the DWM frame and shadow while the NSIS page owns the entire client area.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#define UNICODE
#include <windows.h>
#include <tlhelp32.h>
#include <objidl.h>
#include <commctrl.h>
#include <dwmapi.h>
#include <gdiplus.h>
#include <new>
#include <algorithm>
#include <cmath>
#include "progress.h"
#include "extract.h"
#include "extract-report.h"
#include "directory-report.h"
#include "uninstall-data.h"

using namespace Gdiplus;

// Returns whether the UTF-8 report was saved; failure still presents the original error unless silent.
extern "C" __declspec(dllexport) int __cdecl InstallerReportDirectoryFailure(
    HWND parent, DWORD error, LPCWSTR source, LPCWSTR destination, DWORD restoreError, LPCWSTR backup,
    LPCWSTR log, LPCWSTR reportPath, int show, LPCWSTR title, LPCWSTR heading, LPCWSTR hint, LPCWSTR copy,
    LPCWSTR expand, LPCWSTR collapse, LPCWSTR savedFormat, LPCWSTR unsaved, LPCWSTR copied) {
    try {
        const std::wstring report = directory_report::Compose(error, source, destination, restoreError, backup, extract_report::ReadOutput(log));
        const bool saved = extract_report::WriteUtf8(reportPath, report);
        if (show) {
            std::wstring footer = saved ? savedFormat : unsaved;
            const auto placeholder = footer.find(L"%s");
            if (saved && placeholder != std::wstring::npos) footer.replace(placeholder, 2, reportPath);
            const extract_report::DialogStrings strings{title, heading, copy, expand, collapse, footer.c_str(), copied};
            const std::wstring content = directory_report::Content(error, hint, restoreError, backup);
            extract_report::Show(parent, content, extract_report::BoundedExcerpt(extract_report::Lines(extract_report::Trim(report))), report, strings);
        }
        return saved ? 1 : 0;
    } catch (const std::bad_alloc&) {
        if (show) MessageBoxW(parent, hint, heading, MB_OK | MB_ICONEXCLAMATION);
        return 0;
    }
}

// Saves the extraction failure report and, unless silent, presents its headline with a copy action.
// Returns 1 when the report file was written and 0 otherwise; the dialog outcome never fails the caller.
extern "C" __declspec(dllexport) int __cdecl InstallerReportExtractFailure(
    HWND parent, int code, LPCWSTR archive, LPCWSTR destination, LPCWSTR log, LPCWSTR reportPath, int show,
    LPCWSTR title, LPCWSTR heading, LPCWSTR hint, LPCWSTR copy, LPCWSTR expand, LPCWSTR collapse, LPCWSTR savedFormat, LPCWSTR unsaved, LPCWSTR copied) {
    try {
        const std::wstring output = extract_report::ReadOutput(log);
        const std::wstring report = extract_report::Compose(code, archive, destination, output,
            extract_report::Timestamp(), extract_report::WindowsVersion());
        const bool saved = extract_report::WriteUtf8(reportPath, report);
        if (show) {
            std::wstring footer = saved ? savedFormat : unsaved;
            const auto placeholder = footer.find(L"%s");
            if (saved && placeholder != std::wstring::npos) footer.replace(placeholder, 2, reportPath);
            const extract_report::DialogStrings strings{title, heading, copy, expand, collapse, footer.c_str(), copied};
            const std::wstring content = extract_report::Headline(code, output, archive) + L"\r\n\r\n" + hint;
            extract_report::Show(parent, content, extract_report::Excerpt(report), report, strings);
        }
        return saved ? 1 : 0;
    } catch (const std::bad_alloc&) {
        return 0;
    }
}

// Returns a Win32 error code; no cleanup request may traverse a linked root or touch the protected root.
extern "C" __declspec(dllexport) DWORD __cdecl UninstallRemoveData(LPCWSTR path, LPCWSTR installation, LPCWSTR protectedRoot) {
    return uninstall_data::Remove(path, installation, protectedRoot);
}

// Returns a Win32 error code; only ordinary empty directories strictly below the stop directory are removed.
extern "C" __declspec(dllexport) DWORD __cdecl UninstallRemoveEmptyParents(LPCWSTR path, LPCWSTR stop) {
    return uninstall_data::RemoveEmptyParents(path, stop);
}

// Match the affected executable, not another user's or directory's same-named application.
// Returns 0 while running, 1 when absent, and -1 if the process list cannot be read.
extern "C" __declspec(dllexport) int __cdecl InstallerFindProcess(LPCWSTR executable) {
    WCHAR target[32768];
    DWORD length = GetLongPathNameW(executable, target, ARRAYSIZE(target));
    LPCWSTR expected = length > 0 && length < ARRAYSIZE(target) ? target : executable;
    LPCWSTR filename = wcsrchr(expected, L'\\');
    filename = filename ? filename + 1 : expected;
    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE) return -1;
    PROCESSENTRY32W entry = {};
    entry.dwSize = sizeof(entry);
    int result = 1;
    BOOL present = Process32FirstW(snapshot, &entry);
    while (present) {
        if (_wcsicmp(entry.szExeFile, filename) == 0) {
            HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, entry.th32ProcessID);
            if (process) {
                WCHAR path[32768];
                DWORD count = ARRAYSIZE(path);
                if (QueryFullProcessImageNameW(process, 0, path, &count) && _wcsicmp(path, expected) == 0) result = 0;
                CloseHandle(process);
                if (result == 0) break;
            }
        }
        present = Process32NextW(snapshot, &entry);
    }
    if (!present && GetLastError() != ERROR_NO_MORE_FILES) result = -1;
    CloseHandle(snapshot);
    return result;
}

#include "research-scene.h"

// NSIS has already reported success. Pump the UI for the bounded final animation,
// including a painted 100% frame, before constructing the interactive finish page.
extern "C" __declspec(dllexport) BOOL __cdecl InstallerFinishProgress(HWND window) {
    auto* page = reinterpret_cast<ProgressPage*>(GetWindowLongPtrW(window, GWLP_USERDATA));
    if (!page) return FALSE;
    const ULONGLONG started = GetTickCount64();
    SetPropW(GetParent(window), L"HarnessInstaller.Succeeded", reinterpret_cast<HANDLE>(1));
    page->progress.Complete(started);
    while (IsWindow(window) && GetTickCount64() - started < 750) {
        MSG message;
        if (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
            if (message.message == WM_QUIT) { PostQuitMessage(static_cast<int>(message.wParam)); return FALSE; }
            TranslateMessage(&message);
            DispatchMessageW(&message);
        } else {
            MsgWaitForMultipleObjectsEx(0, nullptr, 16, QS_ALLINPUT, MWMO_INPUTAVAILABLE);
        }
    }
    if (!IsWindow(window)) return FALSE;
    InvalidateRect(window, nullptr, FALSE);
    UpdateWindow(window);
    return TRUE;
}

#include "research-layout.h"

static LRESULT CALLBACK FrameProc(HWND window, UINT message, WPARAM wparam,
                                 LPARAM lparam, UINT_PTR id, DWORD_PTR) {
    if (message == WM_DPICHANGED) {
        MONITORINFO info{sizeof(info),{}, {},0};
        const auto* suggested=reinterpret_cast<RECT*>(lparam);
        GetMonitorInfoW(MonitorFromRect(suggested,MONITOR_DEFAULTTONEAREST),&info);
        const UINT dpi=research::FitDpi(info.rcWork,HIWORD(wparam));
        SetPropW(window,L"HarnessInstaller.Dpi",reinterpret_cast<HANDLE>(static_cast<UINT_PTR>(dpi)));
        const int width=MulDiv(840,dpi,96),height=MulDiv(560,dpi,96);
        SetWindowPos(window,nullptr,std::max(info.rcWork.left,std::min(suggested->left,info.rcWork.right-width)),
            std::max(info.rcWork.top,std::min(suggested->top,info.rcWork.bottom-height)),width,height,SWP_NOZORDER|SWP_NOACTIVATE);
        EnumChildWindows(window,research::ResizeControl,static_cast<LPARAM>(dpi));
        RedrawWindow(window,nullptr,nullptr,RDW_INVALIDATE|RDW_ALLCHILDREN);
        return 0;
    }
    if (message == WM_SETTINGCHANGE) EnumChildWindows(window,research::SettingsControl,0);
    if (message == WM_NCCALCSIZE && wparam) return 0;
    // Activation must not repaint the standard frame over the custom client area.
    if (message == WM_NCACTIVATE) return DefSubclassProc(window, message, wparam, -1);
    if (message == WM_NCHITTEST) {
        const LRESULT hit = DefSubclassProc(window, message, wparam, lparam);
        // The installer has a fixed size; its page provides the drag area.
        return hit >= HTLEFT && hit <= HTBOTTOMRIGHT ? HTCLIENT : hit;
    }
    if (message == WM_NCDESTROY) RemoveWindowSubclass(window, FrameProc, id);
    return DefSubclassProc(window, message, wparam, lparam);
}

extern "C" __declspec(dllexport) HRESULT __cdecl InstallerApplyFrame(HWND window) {
    // NSIS may release its DLL reference before the window receives WM_NCDESTROY.
    HMODULE module = nullptr;
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_PIN | GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,
                           reinterpret_cast<LPCWSTR>(&FrameProc), &module)) return E_FAIL;
    if (!SetWindowSubclass(window, FrameProc, 1, 0)) return E_FAIL;
    const int stockControls[] = {1, 2, 3, 1028, 1256, 1034, 1035, 1036, 1037, 1038, 1039};
    for (int id : stockControls) {
        HWND child = GetDlgItem(window, id);
        if (child) {
            if (!SetWindowSubclass(child, HiddenPageProc, 1, 0)) return E_FAIL;
            ShowWindow(child, SW_HIDE);
        }
    }
    // DWM retains native transitions; WM_NCCALCSIZE removes the visible caption.
    SetWindowLongW(window, GWL_STYLE, GetWindowLongW(window, GWL_STYLE) | WS_THICKFRAME | WS_CAPTION);
    const DWMNCRENDERINGPOLICY policy = DWMNCRP_ENABLED;
    HRESULT result = DwmSetWindowAttribute(window, DWMWA_NCRENDERING_POLICY, &policy, sizeof(policy));
    if (FAILED(result)) return result;
    const DWORD rounded = 2;
    // Windows 10 does not support the Windows 11 corner preference.
    DwmSetWindowAttribute(window, 33, &rounded, sizeof(rounded));
    const MARGINS margins = {1, 1, 1, 1};
    result = DwmExtendFrameIntoClientArea(window, &margins);
    SetWindowPos(window, nullptr, 0, 0, 0, 0,
                 SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
    return result;
}

// Present the first interactive page after resource preparation without keeping the installer topmost.
extern "C" __declspec(dllexport) BOOL __cdecl InstallerPresentWelcome(HWND window) {
    if (!IsWindowVisible(window)) return FALSE;
    if (!SetWindowPos(window, HWND_TOP, 0, 0, 0, 0,
                      SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)) return FALSE;
    if (GetForegroundWindow() != window) {
        FLASHWINFO flash = {sizeof(flash), window, FLASHW_TRAY | FLASHW_TIMERNOFG, 0, 0};
        FlashWindowEx(&flash);
    }
    SetPropW(window, L"HarnessInstaller.Presented", reinterpret_cast<HANDLE>(1));
    return TRUE;
}
