// Shared native artwork, animation and progress for the three installer pages.
#pragma once
#include <memory>
#include <string>

namespace research {
constexpr int Width = 840;
constexpr int Height = 560;
constexpr int Panel = 360;
constexpr int Content = 404;
constexpr int ContentWidth = 392;
constexpr int Minimize = 744;
constexpr int Close = 788;

inline HWND Root(HWND window) {
    return GetAncestor(window, GA_ROOT);
}
inline bool HighContrast() {
    HIGHCONTRASTW setting{sizeof(setting), 0, nullptr};
    return SystemParametersInfoW(SPI_GETHIGHCONTRAST, sizeof(setting), &setting, 0) &&
           (setting.dwFlags & HCF_HIGHCONTRASTON);
}
inline Color SystemColor(int index) {
    const COLORREF value = GetSysColor(index);
    return Color(255, GetRValue(value), GetGValue(value), GetBValue(value));
}

struct GdiLifetime {
    ULONG_PTR token = 0;
    GdiLifetime() {
        GdiplusStartupInput input;
        GdiplusStartup(&token, &input, nullptr);
    }
    ~GdiLifetime() {
        if (token)
            GdiplusShutdown(token);
    }
};
struct Art {
    GdiLifetime runtime;
    std::unique_ptr<Image> background;
    std::unique_ptr<Image> logo;
    PrivateFontCollection fonts;
    std::wstring fontPath;
    bool fontReady = false;
    explicit Art(const WCHAR *directory) {
        const std::wstring prefix = std::wstring(directory) + L"\\";
        background.reset(new Image((prefix + L"research-background.png").c_str()));
        if (background->GetLastStatus() != Ok)
            background.reset();
        logo.reset(new Image((prefix + L"research-logo.png").c_str()));
        if (logo->GetLastStatus() != Ok)
            logo.reset();
        fontPath = prefix + L"research-font.ttf";
        if (fonts.AddFontFile(fontPath.c_str()) == Ok) {
            fontReady = AddFontResourceExW(fontPath.c_str(), FR_PRIVATE, nullptr) != 0;
        }
    }
    ~Art() {
        if (fontReady)
            RemoveFontResourceExW(fontPath.c_str(), FR_PRIVATE, nullptr);
    }
    Art(const Art &) = delete;
    Art &operator=(const Art &) = delete;
};

inline void Text(Graphics &graphics, const Art &art, const WCHAR *text, REAL size, RectF bounds, Color color,
                 StringAlignment alignment = StringAlignmentNear) {
    FontFamily family(art.fontReady ? L"ZeroWall Research Sans" : L"Microsoft YaHei UI",
                      art.fontReady ? &art.fonts : nullptr);
    Font font(&family, size, FontStyleRegular, UnitPixel);
    StringFormat format;
    format.SetAlignment(alignment);
    format.SetLineAlignment(StringAlignmentCenter);
    SolidBrush brush(color);
    graphics.DrawString(text, -1, &font, bounds, &format, &brush);
}
} // namespace research

struct ProgressPage {
    InstallProgress progress{GetTickCount64()};
    bool windowOwns = false;
    bool dark = false;
    bool contrast = false;
    bool animations = true;
    int mode = 1; // 0 welcome, 1 installation, 2 completion.
    UINT dpi = 96;
    ULONG_PTR gdiplus = 0;
    std::shared_ptr<research::Art> art;
    Bitmap *base = nullptr;
    Bitmap *buffer = nullptr;
    HDC bufferDc = nullptr;
    HBITMAP bufferBitmap = nullptr;
    HGDIOBJ previousBitmap = nullptr;
    UINT pressedCommand = 0;
    UINT hoveredCommand = 0;
    ARGB controlHover = 0;
    ARGB controlPressed = 0;
    ULONGLONG created = GetTickCount64();
    WCHAR captions[5][128]{};
    WCHAR intro[128]{};
    WCHAR features[128]{};
    WCHAR ready[128]{};
    WCHAR tagline[128]{};
    WCHAR steps[4][64]{};

    void ReleaseBuffer() {
        delete buffer;
        buffer = nullptr;
        delete base;
        base = nullptr;
        if (previousBitmap)
            SelectObject(bufferDc, previousBitmap);
        if (bufferBitmap)
            DeleteObject(bufferBitmap);
        if (bufferDc)
            DeleteDC(bufferDc);
        previousBitmap = nullptr;
        bufferBitmap = nullptr;
        bufferDc = nullptr;
    }
    ~ProgressPage() {
        ReleaseBuffer();
        art.reset();
        if (gdiplus)
            GdiplusShutdown(gdiplus);
    }
};

static Color PageBackground(const ProgressPage &page) {
    return page.contrast ? research::SystemColor(COLOR_WINDOW)
           : page.dark   ? Color(255, 25, 33, 50)
                         : Color(255, 255, 255, 255);
}
static Color PageInk(const ProgressPage &page) {
    return page.contrast ? research::SystemColor(COLOR_WINDOWTEXT)
           : page.dark   ? Color(255, 238, 241, 250)
                         : Color(255, 23, 35, 59);
}

static void PaintResearchBase(Graphics &graphics, const ProgressPage &page) {
    graphics.Clear(PageBackground(page));
    if (!page.contrast) {
        SolidBrush left(page.dark ? Color(255, 23, 34, 57) : Color(255, 246, 249, 253));
        graphics.FillRectangle(&left, 0, 0, research::Panel, research::Height);
        if (page.art->background) {
            ColorMatrix matrix = {
                {{0.43f, 0, 0, 0, 0}, {0, 0.45f, 0, 0, 0}, {0, 0, 0.49f, 0, 0}, {0, 0, 0, 1, 0}, {0, 0, 0, 0, 1}}};
            ImageAttributes tint;
            if (page.dark)
                tint.SetColorMatrix(&matrix);
            const REAL width = static_cast<REAL>(page.art->background->GetWidth());
            const REAL height = static_cast<REAL>(page.art->background->GetHeight());
            graphics.DrawImage(page.art->background.get(), RectF(0, 0, 360, 560), 0, 0, width * 360 / 840, height,
                               UnitPixel, page.dark ? &tint : nullptr);
        }
        const Color transparent(0, 246, 249, 253);
        const Color pearl = page.dark ? Color(245, 23, 34, 57) : Color(245, 246, 249, 253);
        LinearGradientBrush fade(Point(0, 350), Point(0, 560), transparent, pearl);
        graphics.FillRectangle(&fade, 0, 350, 360, 210);
    }
    if (page.art->logo)
        graphics.DrawImage(page.art->logo.get(), Rect(30, 29, 34, 40));
    Font brand(L"Segoe UI", 19, FontStyleRegular, UnitPixel);
    SolidBrush ink(PageInk(page));
    graphics.DrawString(L"ZeroWallScience", -1, &brand, PointF(75, 35), &ink);
    research::Text(graphics, *page.art, page.tagline, 23, RectF(31, 445, 315, 48), PageInk(page));
    if (page.mode == 1) {
        research::Text(graphics, *page.art, page.intro, 31, RectF(404, 116, 392, 70), PageInk(page));
        research::Text(graphics, *page.art, page.features, 16, RectF(404, 185, 392, 32),
                       page.contrast ? PageInk(page)
                       : page.dark   ? Color(255, 155, 169, 190)
                                     : Color(255, 111, 123, 143));
    }
}

static bool BuildResearchBuffer(ProgressPage &page) {
    page.ReleaseBuffer();
    const int width = MulDiv(research::Width, page.dpi, 96);
    const int height = MulDiv(research::Height, page.dpi, 96);
    BITMAPINFO info{};
    info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    info.bmiHeader.biWidth = width;
    info.bmiHeader.biHeight = -height;
    info.bmiHeader.biPlanes = 1;
    info.bmiHeader.biBitCount = 32;
    void *pixels = nullptr;
    page.bufferDc = CreateCompatibleDC(nullptr);
    page.bufferBitmap = CreateDIBSection(nullptr, &info, DIB_RGB_COLORS, &pixels, nullptr, 0);
    if (!page.bufferDc || !page.bufferBitmap)
        return false;
    page.previousBitmap = SelectObject(page.bufferDc, page.bufferBitmap);
    if (!page.previousBitmap)
        return false;
    page.buffer = new Bitmap(width, height, width * 4, PixelFormat32bppPARGB, static_cast<BYTE *>(pixels));
    page.base = new Bitmap(width, height, PixelFormat32bppPARGB);
    if (page.buffer->GetLastStatus() != Ok || page.base->GetLastStatus() != Ok)
        return false;
    Graphics graphics(page.base);
    graphics.ScaleTransform(page.dpi / 96.0f, page.dpi / 96.0f);
    graphics.SetSmoothingMode(SmoothingModeAntiAlias);
    graphics.SetInterpolationMode(InterpolationModeHighQualityBicubic);
    graphics.SetTextRenderingHint(TextRenderingHintAntiAliasGridFit);
    PaintResearchBase(graphics, page);
    return true;
}

static void PaintResearchMotion(Graphics &graphics, const ProgressPage &page, ULONGLONG now) {
    if (page.contrast)
        return;
    const double seconds = page.animations ? static_cast<double>(now - page.created) / 1000 : 0;
    const double convergence = page.mode == 2 && page.animations ? std::max(0.0, 1 - seconds / 0.8) * 0.1 : 0;
    for (int index = 0; index < 21; ++index) {
        const double angle = index * 2.3999632297;
        const int ring = index % 3;
        const REAL x = 175 + static_cast<REAL>(std::cos(angle) * (74 + ring * 23) * (1 - convergence) +
                                               std::sin(seconds * .38 + index * 1.7) * 5);
        const REAL y = 272 + static_cast<REAL>(std::sin(angle) * (61 + ring * 25) * (1 - convergence) +
                                               std::cos(seconds * .32 + index * 1.7) * 4);
        const REAL radius = index % 7 == 0 ? 2.2f : 1.2f;
        const BYTE alpha = static_cast<BYTE>(110 + std::sin(seconds * .9 + index) * 35);
        SolidBrush glow(Color(18, 105, 122, 226));
        SolidBrush dot(index % 3 == 0 ? Color(alpha, 122, 95, 231) : Color(alpha, 56, 173, 220));
        graphics.FillEllipse(&glow, x - 5, y - 5, 10.0f, 10.0f);
        graphics.FillEllipse(&dot, x - radius, y - radius, radius * 2, radius * 2);
    }
    for (int orbit = 0; orbit < 3; ++orbit) {
        const GraphicsState saved = graphics.Save();
        graphics.TranslateTransform(175, 270);
        graphics.RotateTransform(static_cast<REAL>(orbit * 46 - 34));
        const REAL angle = static_cast<REAL>(seconds / 18 * 360 * (orbit % 2 ? -1 : 1) + orbit * 120);
        Pen line(Color(65, 112, 110, 224), .8f);
        graphics.DrawArc(&line, RectF(-132, -60.0f - orbit * 8, 264, 120.0f + orbit * 16), angle, 24);
        const double radians = (angle + 24) * 3.141592653589793 / 180;
        const REAL x = static_cast<REAL>(std::cos(radians) * 132);
        const REAL y = static_cast<REAL>(std::sin(radians) * (60 + orbit * 8));
        SolidBrush halo(Color(24, 116, 100, 224)), point(Color(180, 116, 100, 224));
        graphics.FillEllipse(&halo, x - 7, y - 7, 14.0f, 14.0f);
        graphics.FillEllipse(&point, x - 2.4f, y - 2.4f, 4.8f, 4.8f);
        graphics.Restore(saved);
    }
}

// NSIS's stock installation page is hidden only after its replacement is ready.
static LRESULT CALLBACK HiddenPageProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam, UINT_PTR id,
                                       DWORD_PTR) {
    if (message == WM_WINDOWPOSCHANGING) {
        auto *position = reinterpret_cast<WINDOWPOS *>(lparam);
        position->flags = (position->flags & ~SWP_SHOWWINDOW) | SWP_HIDEWINDOW;
    }
    if (message == WM_NCDESTROY)
        RemoveWindowSubclass(window, HiddenPageProc, id);
    return DefSubclassProc(window, message, wparam, lparam);
}

static UINT CaptionCommand(const ProgressPage &page, LPARAM position) {
    const int x = static_cast<short>(LOWORD(position)), y = static_cast<short>(HIWORD(position));
    if (y < 0 || y >= MulDiv(48, page.dpi, 96) || x < MulDiv(research::Minimize, page.dpi, 96) ||
        x >= MulDiv(840, page.dpi, 96))
        return 0;
    return x >= MulDiv(research::Close, page.dpi, 96) ? SC_CLOSE : SC_MINIMIZE;
}
static void PaintCaptionButtons(Graphics &graphics, const ProgressPage &page) {
    SolidBrush ink(PageInk(page));
    for (UINT command : {SC_MINIMIZE, SC_CLOSE}) {
        const int x = command == SC_MINIMIZE ? research::Minimize : research::Close;
        if (page.hoveredCommand == command && (!page.pressedCommand || page.pressedCommand == command)) {
            SolidBrush fill(page.contrast
                                ? research::SystemColor(COLOR_HIGHLIGHT)
                                : Color(page.pressedCommand == command ? page.controlPressed : page.controlHover));
            graphics.FillRectangle(&fill, x, 8, 40, 32);
        }
        Pen pen(PageInk(page), 1.2f);
        if (command == SC_MINIMIZE)
            graphics.DrawLine(&pen, static_cast<REAL>(x + 15), 24.0f, static_cast<REAL>(x + 25), 24.0f);
        if (command == SC_CLOSE) {
            graphics.DrawLine(&pen, static_cast<REAL>(x + 16), 20.0f, static_cast<REAL>(x + 24), 28.0f);
            graphics.DrawLine(&pen, static_cast<REAL>(x + 24), 20.0f, static_cast<REAL>(x + 16), 28.0f);
        }
    }
}
static void PaintProgress(Graphics &graphics, ProgressPage &page, HWND window, ULONGLONG now) {
    HWND root = research::Root(window);
    const int stage = static_cast<int>(reinterpret_cast<INT_PTR>(GetPropW(root, L"HarnessInstaller.Stage")));
    const double fraction = reinterpret_cast<UINT_PTR>(GetPropW(root, L"HarnessInstaller.ExtractProgress")) / 100.0;
    page.progress.Advance(stage, fraction, now);
    const int active = page.progress.succeeded ? 3 : stage == 0 ? 0 : stage <= 2 ? 1 : 2;
    Pen connector(page.contrast ? PageInk(page) : Color(255, 230, 233, 244), 1);
    graphics.DrawLine(&connector, 434, 267, 766, 267);
    for (int index = 0; index < 4; ++index) {
        const REAL x = 434 + index * 110.6f;
        SolidBrush dot(page.contrast     ? research::SystemColor(COLOR_HIGHLIGHT)
                       : index <= active ? Color(255, 118, 94, 230)
                                         : Color(255, 225, 230, 242));
        graphics.FillEllipse(&dot, x - 5, 262.0f, 10.0f, 10.0f);
        research::Text(graphics, *page.art, page.steps[index], 13, RectF(x - 50, 285, 100, 30),
                       index <= active && !page.contrast ? Color(255, 132, 111, 205) : PageInk(page),
                       StringAlignmentCenter);
    }
    const int percent = static_cast<int>(page.progress.value);
    WCHAR number[32], caption[160];
    wsprintfW(number, L"%d", percent);
    wsprintfW(caption, page.captions[page.progress.CaptionStage()], percent);
    if (page.progress.succeeded)
        wsprintfW(caption, L"%s \x00b7 %d%%", page.ready, percent);
    SetWindowTextW(window, caption);
    Font numberFont(L"Segoe UI Light", 49, FontStyleRegular, UnitPixel);
    SolidBrush ink(PageInk(page));
    graphics.DrawString(number, -1, &numberFont, PointF(400, 350), &ink);
    Font percentFont(L"Segoe UI", 20, FontStyleRegular, UnitPixel);
    const REAL offset = percent < 10 ? 28.0f : percent < 100 ? 55.0f : 80.0f;
    graphics.DrawString(L"%", -1, &percentFont, PointF(404 + offset, 377), &ink);
    research::Text(graphics, *page.art, caption, 13, RectF(510, 354, 286, 56), PageInk(page), StringAlignmentFar);
    SolidBrush track(page.contrast ? research::SystemColor(COLOR_GRAYTEXT) : Color(255, 235, 234, 249));
    graphics.FillRectangle(&track, 404, 427, 392, 7);
    LinearGradientBrush fill(Point(404, 427), Point(796, 427), Color(255, 69, 198, 227), Color(255, 122, 93, 236));
    SolidBrush accessibleFill(research::SystemColor(COLOR_HIGHLIGHT));
    graphics.FillRectangle(page.contrast ? static_cast<Brush *>(&accessibleFill) : static_cast<Brush *>(&fill), 404.0f,
                           427.0f, 392 * static_cast<REAL>(page.progress.value) / 100, 7.0f);
}

static LRESULT CALLBACK ProgressProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
    auto *page = reinterpret_cast<ProgressPage *>(GetWindowLongPtrW(window, GWLP_USERDATA));
    if (message == WM_NCCREATE) {
        page = static_cast<ProgressPage *>(reinterpret_cast<CREATESTRUCTW *>(lparam)->lpCreateParams);
        SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(page));
        SetTimer(window, 1, page->animations ? 33 : 150, nullptr);
        return TRUE;
    }
    if (!page)
        return DefWindowProcW(window, message, wparam, lparam);
    if (message == WM_APP + 410) {
        page->dpi = static_cast<UINT>(wparam);
        if (!BuildResearchBuffer(*page)) {
            DestroyWindow(window);
            return 0;
        }
        MoveWindow(window, 0, 0, MulDiv(page->mode == 1 ? 840 : 360, page->dpi, 96), MulDiv(560, page->dpi, 96), TRUE);
        return 0;
    }
    if (message == WM_SETTINGCHANGE) {
        page->contrast = research::HighContrast();
        BOOL animations = TRUE;
        SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION, 0, &animations, 0);
        page->animations = animations != FALSE && !page->contrast;
        SetTimer(window, 1, page->animations ? 33 : 150, nullptr);
        BuildResearchBuffer(*page);
        InvalidateRect(window, nullptr, FALSE);
        return 0;
    }
    if (message == WM_ERASEBKGND)
        return 1;
    if (message == WM_TIMER) {
        if (!IsIconic(research::Root(window)) && IsWindowVisible(window) && (page->animations || page->mode == 1)) {
            RECT left{0, 0, MulDiv(360, page->dpi, 96), MulDiv(560, page->dpi, 96)};
            InvalidateRect(window, page->mode == 1 ? nullptr : &left, FALSE);
        }
        return 0;
    }
    if (message == WM_MOUSEMOVE) {
        TRACKMOUSEEVENT tracking{sizeof(tracking), TME_LEAVE, window, 0};
        TrackMouseEvent(&tracking);
        page->hoveredCommand = CaptionCommand(*page, lparam);
    }
    if (message == WM_MOUSELEAVE)
        page->hoveredCommand = 0;
    if (message == WM_LBUTTONDOWN) {
        page->pressedCommand = CaptionCommand(*page, lparam);
        if (page->pressedCommand) {
            page->hoveredCommand = page->pressedCommand;
            SetCapture(window);
        } else if (HIWORD(lparam) < MulDiv(48, page->dpi, 96)) {
            ReleaseCapture();
            SendMessageW(research::Root(window), WM_NCLBUTTONDOWN, HTCAPTION, 0);
        }
    }
    if (message == WM_LBUTTONUP) {
        const UINT command = page->pressedCommand;
        const bool activate = command && GetCapture() == window && CaptionCommand(*page, lparam) == command;
        page->pressedCommand = 0;
        if (GetCapture() == window)
            ReleaseCapture();
        if (activate) {
            if (command == SC_CLOSE)
                PostMessageW(research::Root(window), WM_CLOSE, 0, 0);
            else
                ShowWindow(research::Root(window), SW_MINIMIZE);
        }
    }
    if (message == WM_CAPTURECHANGED || message == WM_CANCELMODE) {
        page->pressedCommand = 0;
        if (message == WM_CANCELMODE && GetCapture() == window)
            ReleaseCapture();
    }
    if ((message >= WM_MOUSEFIRST && message <= WM_MOUSELAST) || message == WM_MOUSELEAVE || message == WM_CANCELMODE ||
        message == WM_CAPTURECHANGED) {
        RECT caption{MulDiv(744, page->dpi, 96), 0, MulDiv(840, page->dpi, 96), MulDiv(48, page->dpi, 96)};
        InvalidateRect(window, &caption, FALSE);
    }
    if (message == WM_PAINT || message == WM_PRINTCLIENT) {
        PAINTSTRUCT paint{};
        const bool printing = message == WM_PRINTCLIENT;
        HDC dc = printing ? reinterpret_cast<HDC>(wparam) : BeginPaint(window, &paint);
        if (printing)
            GetClientRect(window, &paint.rcPaint);
        if (page->buffer && page->base) {
            Graphics graphics(page->buffer);
            graphics.DrawImage(page->base, 0, 0);
            graphics.ScaleTransform(page->dpi / 96.0f, page->dpi / 96.0f);
            graphics.SetSmoothingMode(SmoothingModeAntiAlias);
            graphics.SetTextRenderingHint(TextRenderingHintAntiAliasGridFit);
            const ULONGLONG now = GetTickCount64();
            PaintResearchMotion(graphics, *page, now);
            if (page->mode == 1) {
                PaintCaptionButtons(graphics, *page);
                PaintProgress(graphics, *page, window, now);
            }
        }
        BitBlt(dc, paint.rcPaint.left, paint.rcPaint.top, paint.rcPaint.right - paint.rcPaint.left,
               paint.rcPaint.bottom - paint.rcPaint.top, page->bufferDc, paint.rcPaint.left, paint.rcPaint.top,
               SRCCOPY);
        if (!printing)
            EndPaint(window, &paint);
        if (page->mode == 1 && page->progress.value == 100)
            SetPropW(research::Root(window), L"HarnessInstaller.CompletedPercent", reinterpret_cast<HANDLE>(100));
        return 0;
    }
    if (message == WM_NCDESTROY) {
        KillTimer(window, 1);
        SetWindowLongPtrW(window, GWLP_USERDATA, 0);
        if (page->windowOwns)
            delete page;
    }
    return DefWindowProcW(window, message, wparam, lparam);
}

static HWND CreateResearchScene(HWND parent, BOOL dark, UINT dpi, const WCHAR *assets, const WCHAR *tagline, ARGB hover,
                                ARGB pressed, int mode, const WCHAR *const *captions, const WCHAR *intro,
                                const WCHAR *features, const WCHAR *ready, const WCHAR *const *steps) {
    try {
        if (!assets || !assets[0] || dpi < 48 || dpi > 768)
            return nullptr;
        std::unique_ptr<ProgressPage> page(new (std::nothrow) ProgressPage{});
        if (!page)
            return nullptr;
        GdiplusStartupInput startup;
        if (GdiplusStartup(&page->gdiplus, &startup, nullptr) != Ok)
            return nullptr;
        page->art = std::make_shared<research::Art>(assets);
        page->dark = dark != FALSE;
        page->contrast = research::HighContrast();
        page->dpi = dpi;
        SetPropW(research::Root(parent), L"HarnessInstaller.Dark", dark ? reinterpret_cast<HANDLE>(1) : nullptr);
        page->mode = mode;
        page->controlHover = hover;
        page->controlPressed = pressed;
        BOOL animations = TRUE;
        SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION, 0, &animations, 0);
        page->animations = animations != FALSE && !page->contrast;
        lstrcpynW(page->tagline, tagline, 128);
        if (captions)
            for (int index = 0; index < 5; ++index)
                lstrcpynW(page->captions[index], captions[index], 128);
        if (steps)
            for (int index = 0; index < 4; ++index)
                lstrcpynW(page->steps[index], steps[index], 64);
        if (intro)
            lstrcpynW(page->intro, intro, 128);
        if (features)
            lstrcpynW(page->features, features, 128);
        if (ready)
            lstrcpynW(page->ready, ready, 128);
        if (!BuildResearchBuffer(*page))
            return nullptr;
        WNDCLASSW type{};
        type.lpfnWndProc = ProgressProc;
        type.hInstance = GetModuleHandleW(nullptr);
        type.lpszClassName = mode == 1 ? L"HarnessInstallerProgress" : L"HarnessInstallerScene";
        type.hCursor = LoadCursorW(nullptr, IDC_ARROW);
        if (!RegisterClassW(&type) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS)
            return nullptr;
        HWND window = CreateWindowExW(0, type.lpszClassName, L"", WS_CHILD | WS_CLIPSIBLINGS, 0, 0,
                                      MulDiv(mode == 1 ? 840 : 360, dpi, 96), MulDiv(560, dpi, 96), parent, nullptr,
                                      type.hInstance, page.get());
        if (!window)
            return nullptr;
        page->windowOwns = true;
        page.release();
        return window;
    } catch (const std::bad_alloc &) {
        return nullptr;
    }
}

// The caller owns the returned child window and destroys it after deleting its native control fonts.
extern "C" __declspec(dllexport) HWND __cdecl InstallerCreateScene(HWND parent, BOOL dark, UINT dpi, int complete,
                                                                   const WCHAR *assets, const WCHAR *tagline) {
    HWND window = CreateResearchScene(parent, dark, dpi, assets, tagline, 0, 0, complete ? 2 : 0, nullptr, nullptr,
                                      nullptr, nullptr, nullptr);
    if (window)
        SetWindowPos(window, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
    return window;
}
// A false result selects the system font; the scene retains its own private font registration.
extern "C" __declspec(dllexport) BOOL __cdecl InstallerSceneFontReady(HWND window) {
    auto *page = reinterpret_cast<ProgressPage *>(GetWindowLongPtrW(window, GWLP_USERDATA));
    return page && page->art->fontReady;
}
// Empty asset-directory input or rendering allocation failure leaves the stock installation page available.
extern "C" __declspec(dllexport) HWND __cdecl InstallerShowProgress(
    HWND parent, HWND source, BOOL dark, UINT dpi, ARGB controlHover, ARGB controlPressed, const WCHAR *assets,
    const WCHAR *preparing, const WCHAR *extracting, const WCHAR *copying, const WCHAR *registering,
    const WCHAR *cleaning, const WCHAR *intro, const WCHAR *features, const WCHAR *ready, const WCHAR *prepareStep,
    const WCHAR *filesStep, const WCHAR *configureStep, const WCHAR *readyStep, const WCHAR *tagline) {
    const WCHAR *captions[] = {preparing, extracting, copying, registering, cleaning};
    const WCHAR *steps[] = {prepareStep, filesStep, configureStep, readyStep};
    HWND window = CreateResearchScene(parent, dark, dpi, assets, tagline, controlHover, controlPressed, 1, captions,
                                      intro, features, ready, steps);
    if (!window)
        return nullptr;
    HWND stock = GetParent(source);
    if (!SetWindowSubclass(stock, HiddenPageProc, 1, 0)) {
        DestroyWindow(window);
        return nullptr;
    }
    ShowWindow(stock, SW_HIDE);
    ShowWindow(window, SW_SHOW);
    return window;
}
