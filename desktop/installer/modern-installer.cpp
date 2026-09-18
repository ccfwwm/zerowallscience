// Native presentation companion. NSIS owns all installation and upgrade writes.
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <windowsx.h>
#include <d2d1.h>
#include <dwrite.h>
#include <dwmapi.h>
#include <shlobj.h>
#include <shellapi.h>
#include <wincodec.h>
#include <tlhelp32.h>
#include <vector>
#include <set>
#include <string>
#include <cmath>
#include <algorithm>
#pragma comment(lib,"d2d1.lib")
#pragma comment(lib,"dwrite.lib")
#pragma comment(lib,"dwmapi.lib")
#pragma comment(lib,"shell32.lib")
#pragma comment(lib,"ole32.lib")
#pragma comment(lib,"user32.lib")
#pragma comment(lib,"gdi32.lib")
#pragma comment(lib,"windowscodecs.lib")

static HWND windowHandle, directoryEdit;
static ID2D1Factory* factory;
static ID2D1HwndRenderTarget* target;
static IDWriteFactory* textFactory;
static ID2D1Bitmap* brandBitmap;
static HANDLE parentProcess;
static std::wstring statePath, installPath, version, phase=L"welcome", failure;
static bool advanced=false, desktopShortcut=true, reducedMotion=false, finished=false;
static float scale=1, elapsed=0;
static ULONGLONG started=0;
static int parentPid=0;
// Exit 0 = target running, 1 = clear, 2 = cannot safely inspect/stop.
static int targetProcesses(const wchar_t* executable,bool stop) {
  HANDLE snapshot=CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS,0);
  if(snapshot==INVALID_HANDLE_VALUE)return 2;
  std::vector<PROCESSENTRY32W> entries; std::set<DWORD> selected;
  std::wstring basename=executable; basename=basename.substr(basename.find_last_of(L"\\/")+1);
  PROCESSENTRY32W entry{};entry.dwSize=sizeof(entry);
  if(Process32FirstW(snapshot,&entry)) do {
    entries.push_back(entry);
    if(_wcsicmp(entry.szExeFile,basename.c_str())!=0)continue;
    HANDLE process=OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION,FALSE,entry.th32ProcessID);
    if(!process){CloseHandle(snapshot);return 2;}
    wchar_t path[32768];DWORD length=32768;
    BOOL queried=QueryFullProcessImageNameW(process,0,path,&length);CloseHandle(process);
    if(!queried){CloseHandle(snapshot);return 2;}
    if(_wcsicmp(path,executable)==0)selected.insert(entry.th32ProcessID);
  }while(Process32NextW(snapshot,&entry));
  CloseHandle(snapshot);
  if(selected.empty())return 1;
  if(!stop)return 0;
  std::set<DWORD> protectedPids{GetCurrentProcessId()};
  DWORD ancestor=GetCurrentProcessId();
  for(size_t depth=0;depth<entries.size();depth++){
    auto found=std::find_if(entries.begin(),entries.end(),[ancestor](const auto& item){return item.th32ProcessID==ancestor;});
    if(found==entries.end()||found->th32ParentProcessID==0||selected.count(found->th32ParentProcessID))break;
    ancestor=found->th32ParentProcessID;if(!protectedPids.insert(ancestor).second)break;
  }
  bool changed=true;
  while(changed){changed=false;for(const auto& item:entries)if(selected.count(item.th32ParentProcessID)&&!selected.count(item.th32ProcessID)){selected.insert(item.th32ProcessID);changed=true;}}
  for(auto pid:selected){
    if(protectedPids.count(pid))continue;
    HANDLE process=OpenProcess(PROCESS_TERMINATE|SYNCHRONIZE,FALSE,pid);
    if(process){TerminateProcess(process,0);WaitForSingleObject(process,5000);CloseHandle(process);}
  }
  return targetProcesses(executable,false)==1?1:2;
}
static WNDPROC editProcedure;
static LRESULT CALLBACK directoryProcedure(HWND hwnd,UINT message,WPARAM wp,LPARAM lp) {
  if(message==WM_KEYDOWN&&wp=='A'&&(GetKeyState(VK_CONTROL)&0x8000)) {SendMessageW(hwnd,EM_SETSEL,0,-1);return 0;}
  return CallWindowProcW(editProcedure,hwnd,message,wp,lp);
}
template<class T> void release(T*& object) { if(object) {object->Release(); object=nullptr;} }
static std::wstring read(const wchar_t* key, const wchar_t* fallback=L"") {
  wchar_t value[32768]; GetPrivateProfileStringW(L"Install",key,fallback,value,32768,statePath.c_str()); return value;
}
static void write(const wchar_t* key,const std::wstring& value) { WritePrivateProfileStringW(L"Install",key,value.c_str(),statePath.c_str()); }
static D2D1_COLOR_F color(UINT rgb,float opacity=1) { return D2D1::ColorF(rgb,opacity); }
static void rect(float x,float y,float w,float h,UINT rgb,float radius=0,float opacity=1) {
  ID2D1SolidColorBrush* brush=nullptr; target->CreateSolidColorBrush(color(rgb,opacity),&brush);
  if(brush) { target->FillRoundedRectangle(D2D1::RoundedRect(D2D1::RectF(x,y,x+w,y+h),radius,radius),brush); brush->Release(); }
}
static void label(const std::wstring& value,float x,float y,float w,float h,float size,UINT rgb,bool bold=false) {
  IDWriteTextFormat* format=nullptr; ID2D1SolidColorBrush* brush=nullptr;
  textFactory->CreateTextFormat(L"Microsoft YaHei UI",nullptr,bold?DWRITE_FONT_WEIGHT_SEMI_BOLD:DWRITE_FONT_WEIGHT_NORMAL,DWRITE_FONT_STYLE_NORMAL,DWRITE_FONT_STRETCH_NORMAL,size,L"zh-CN",&format);
  target->CreateSolidColorBrush(color(rgb),&brush);
  if(format&&brush) { format->SetWordWrapping(DWRITE_WORD_WRAPPING_WRAP); target->DrawText(value.c_str(),(UINT32)value.size(),format,D2D1::RectF(x,y,x+w,y+h),brush); }
  release(format); release(brush);
}
static bool busy() { return phase!=L"welcome"&&phase!=L"complete"&&phase!=L"failed"; }
static void loadBrand() {
  IWICImagingFactory* wic=nullptr; IWICStream* stream=nullptr; IWICBitmapDecoder* decoder=nullptr; IWICBitmapFrameDecode* frame=nullptr; IWICFormatConverter* converter=nullptr;
  auto res=FindResourceW(nullptr,MAKEINTRESOURCEW(101),RT_RCDATA);
  if(res&&SUCCEEDED(CoCreateInstance(CLSID_WICImagingFactory,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&wic)))) {
    auto data=LockResource(LoadResource(nullptr,res)); auto size=SizeofResource(nullptr,res);
    if(SUCCEEDED(wic->CreateStream(&stream))&&SUCCEEDED(stream->InitializeFromMemory((BYTE*)data,size))&&SUCCEEDED(wic->CreateDecoderFromStream(stream,nullptr,WICDecodeMetadataCacheOnLoad,&decoder))&&SUCCEEDED(decoder->GetFrame(0,&frame))&&SUCCEEDED(wic->CreateFormatConverter(&converter))&&SUCCEEDED(converter->Initialize(frame,GUID_WICPixelFormat32bppPBGRA,WICBitmapDitherTypeNone,nullptr,0,WICBitmapPaletteTypeCustom))) target->CreateBitmapFromWicBitmap(converter,nullptr,&brandBitmap);
  }
  release(converter);release(frame);release(decoder);release(stream);release(wic);
}
static void paint() {
  PAINTSTRUCT ps; BeginPaint(windowHandle,&ps);
  if(!target) { RECT r; GetClientRect(windowHandle,&r); factory->CreateHwndRenderTarget(D2D1::RenderTargetProperties(),D2D1::HwndRenderTargetProperties(windowHandle,D2D1::SizeU(r.right,r.bottom)),&target); }
  if(target) {
    target->SetDpi(96*scale,96*scale); target->BeginDraw(); target->Clear(color(0xF7F8FC));
    rect(1,1,758,498,0xF7F8FC,16);
    label(L"ZeroWall Science",28,19,240,28,13,0x727A8D,true);
    label(L"v"+version,634,20,80,24,12,0x8590A3);
    if(!busy()) label(L"×",721,12,24,30,22,0x7A8190);
    rect(48,73,56,56,0xEBEDFC,16);
    if(!brandBitmap)loadBrand();
    if(brandBitmap)target->DrawBitmap(brandBitmap,D2D1::RectF(53,78,99,124));
    else label(L"Z",63,78,40,48,32,0x6968D6,true);
    label(phase==L"complete"?L"准备好了，开启你的探索":phase==L"failed"?L"安装尚未完成":L"让科研灵感，自然发生",122,76,575,40,27,0x242B3E,true);
    label(L"ZeroWall Science  ·  文献、知识与 AI 的科研工作台",123,115,580,28,13,0x7C8498);
    const wchar_t* cards[]={L"文献阅读",L"知识关联",L"AI 探索"};
    for(int i=0;i<3;i++) {
      float x=48.0f+i*226.0f, y=166.0f+(reducedMotion||phase==L"failed"?0:3*std::sin(elapsed*1.6f+i*1.7f));
      rect(x,y,212,80,0xFFFFFF,12); rect(x+16,y+18,30,36,i==2?0xEEEAFE:0xEFF2FA,6);
      rect(x+23,y+28,16,3,0xA9ACD9,1); rect(x+23,y+35,12,3,0xC6CCE3,1);
      label(cards[i],x+60,y+24,140,28,16,0x525E78,true);
    }
    if(phase==L"welcome") {
      label(L"安装到此电脑，开始你的科研探索",48,276,640,26,15,0x4E5970);
      label(advanced?L"⌄  高级选项":L"›  高级选项",48,318,180,28,13,0x6674BC);
      if(advanced) {
        label(L"安装位置",48,352,78,28,12,0x7C8498);
        rect(630,348,82,30,0xE9ECF7,7); label(L"浏览…",647,352,65,24,12,0x5868A4);
        label(desktopShortcut?L"☑ 创建桌面快捷方式":L"☐ 创建桌面快捷方式",48,391,270,24,12,0x657087);
      } else label(installPath,48,352,650,38,12,0x929AAC);
      rect(508,432,204,44,0x6867D8,11); label(L"安装 ZeroWall Science",529,443,185,28,14,0xFFFFFF,true);
      label(L"本地优先 · 专注科研",48,445,350,24,12,0x9199AA);
    } else {
      std::wstring message=phase==L"complete"?L"安装完成":phase==L"failed"?failure:phase==L"finalizing"?L"正在创建快捷方式，完成安装":phase==L"extracting"?L"正在解压应用与科研运行时":L"正在准备安装";
      label(message,48,286,662,60,16,phase==L"failed"?0xB35159:0x4E5970,true);
      rect(48,360,664,14,0xE2E6F0,7);
      if(phase==L"complete") rect(48,360,664,14,0x7473DB,7);
      else if(phase!=L"failed") {
        float amount=phase==L"finalizing"?.92f:phase==L"extracting"?.20f:.07f;
        rect(48,360,664*amount,14,0x7875D9,7);
        float travel=std::fmod(elapsed*(reducedMotion?90:175),790.0f)-125;
        target->PushAxisAlignedClip(D2D1::RectF(48,360,712,374),D2D1_ANTIALIAS_MODE_PER_PRIMITIVE);
        for(int j=0;j<20;j++) rect(48+travel+j*6,360,6,14,0x9A91E6,0,.12f+.55f*std::sin((float)j/20*3.14159f));
        target->PopAxisAlignedClip();
      }
      label(phase==L"complete"?L"所有步骤已完成":phase==L"failed"?L"原有项目和账户数据不会被清除":L"准备安装       ·       解压文件       ·       完成配置",48,394,664,30,12,0x8A93A7);
      if(phase==L"complete"||phase==L"failed") {
        rect(534,432,178,44,0x6867D8,11); label(phase==L"complete"?L"立即开启":L"关闭并重试",572,443,140,28,15,0xFFFFFF,true);
      } else label(L"正在处理，请稍候  ·  "+std::to_wstring((int)((GetTickCount64()-started)/1000))+L" 秒",48,445,640,26,12,0x9199AA);
    }
    HRESULT hr=target->EndDraw(); if(hr==D2DERR_RECREATE_TARGET) { release(brandBitmap);release(target); }
  }
  EndPaint(windowHandle,&ps);
}
static void browse() {
  IFileDialog* dialog=nullptr;
  if(SUCCEEDED(CoCreateInstance(CLSID_FileOpenDialog,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&dialog)))) {
    dialog->SetOptions(FOS_PICKFOLDERS|FOS_FORCEFILESYSTEM); dialog->SetTitle(L"选择安装文件夹");
    if(SUCCEEDED(dialog->Show(windowHandle))) { IShellItem* item=nullptr; if(SUCCEEDED(dialog->GetResult(&item))) { PWSTR path=nullptr; if(SUCCEEDED(item->GetDisplayName(SIGDN_FILESYSPATH,&path))) { installPath=path; if(installPath.find(L"ZeroWall Science")==std::wstring::npos) installPath+=L"\\ZeroWall Science"; SetWindowTextW(directoryEdit,installPath.c_str()); CoTaskMemFree(path); } item->Release(); } }
    dialog->Release();
  }
}
static bool validatePath() {
  wchar_t value[32768]; GetWindowTextW(directoryEdit,value,32768); installPath=value;
  if(installPath.size()<4 || installPath.size()>220 || installPath[1]!=L':' || installPath[2]!=L'\\' || installPath.find_first_of(L"\"<>|?*\r\n")!=std::wstring::npos) { MessageBoxW(windowHandle,L"请选择本地磁盘下的应用文件夹，不要选择磁盘根目录。",L"检查安装位置",MB_OK|MB_ICONINFORMATION); return false; }
  wchar_t windowsDir[MAX_PATH]; GetWindowsDirectoryW(windowsDir,MAX_PATH);
  std::wstring lowered=installPath; std::transform(lowered.begin(),lowered.end(),lowered.begin(),::towlower);
  std::wstring win=windowsDir; std::transform(win.begin(),win.end(),win.begin(),::towlower);
  if(lowered==win || lowered.rfind(win+L"\\",0)==0) { MessageBoxW(windowHandle,L"不能安装到 Windows 系统目录。",L"检查安装位置",MB_OK|MB_ICONWARNING); return false; }
  ULARGE_INTEGER freeBytes; std::wstring root=installPath.substr(0,3);
  if(!GetDiskFreeSpaceExW(root.c_str(),&freeBytes,nullptr,nullptr)||freeBytes.QuadPart<3ULL*1024*1024*1024) { MessageBoxW(windowHandle,L"安装需要至少 3 GB 可用空间，请选择其他磁盘。",L"可用空间不足",MB_OK|MB_ICONWARNING); return false; }
  int result=SHCreateDirectoryExW(windowHandle,installPath.c_str(),nullptr);
  if(result!=ERROR_SUCCESS&&result!=ERROR_ALREADY_EXISTS&&result!=ERROR_FILE_EXISTS) { MessageBoxW(windowHandle,L"无法创建安装目录，请选择当前用户可写入的位置。",L"无法安装",MB_OK|MB_ICONWARNING); return false; }
  auto probe=installPath+L"\\.zerowall-write-test-"+std::to_wstring(GetCurrentProcessId());
  HANDLE file=CreateFileW(probe.c_str(),GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_TEMPORARY|FILE_FLAG_DELETE_ON_CLOSE,nullptr);
  if(file==INVALID_HANDLE_VALUE) { MessageBoxW(windowHandle,L"安装目录不可写，请选择当前用户可写入的位置。",L"无法安装",MB_OK|MB_ICONWARNING); return false; } CloseHandle(file); return true;
}
static void finish(bool launch) { write(L"Action",launch?L"launch":L"close"); finished=true; DestroyWindow(windowHandle); }
static LRESULT CALLBACK procedure(HWND hwnd,UINT message,WPARAM wp,LPARAM lp) {
  switch(message) {
    case WM_PAINT: paint(); return 0;
    case WM_ERASEBKGND: return 1;
    case WM_TIMER: {
      elapsed=(GetTickCount64()-started)/1000.0f;
      auto next=read(L"Phase",L"welcome");
      if(phase!=L"failed" && next!=L"welcome") phase=next;
      if(parentProcess&&WaitForSingleObject(parentProcess,0)==WAIT_OBJECT_0&&phase!=L"complete") { phase=L"failed"; failure=L"安装进程已退出，请重新运行安装程序。"; }
      if(phase==L"failed"&&failure.empty()) failure=read(L"Error",L"安装失败，请检查磁盘空间与目录权限后重试。");
      bool showEdit=advanced&&phase==L"welcome";
      if((IsWindowVisible(directoryEdit)!=FALSE)!=showEdit)ShowWindow(directoryEdit,showEdit?SW_SHOWNA:SW_HIDE);
      InvalidateRect(hwnd,nullptr,FALSE); return 0;
    }
    case WM_LBUTTONUP: {
      float x=GET_X_LPARAM(lp)/scale,y=GET_Y_LPARAM(lp)/scale;
      if(x>716&&y<47&&!busy()) {finish(false);return 0;}
      if(phase==L"welcome") {
        if(y>312&&y<347&&x<250) advanced=!advanced;
        else if(advanced&&y>348&&y<380&&x>628) browse();
        else if(advanced&&y>385&&y<422&&x<350) desktopShortcut=!desktopShortcut;
        else if(y>432&&y<480&&x>508&&validatePath()) { write(L"Directory",installPath); write(L"DesktopShortcut",desktopShortcut?L"1":L"0"); write(L"Action",L"start"); phase=L"preparing"; started=GetTickCount64(); }
      } else if(y>432&&y<480&&x>534&&(phase==L"complete"||phase==L"failed")) finish(phase==L"complete");
      InvalidateRect(hwnd,nullptr,FALSE);return 0;
    }
    case WM_NCHITTEST: { LRESULT hit=DefWindowProcW(hwnd,message,wp,lp); POINT p{GET_X_LPARAM(lp),GET_Y_LPARAM(lp)}; ScreenToClient(hwnd,&p); return p.y<48*scale&&p.x<710*scale?HTCAPTION:hit; }
    case WM_CLOSE: if(!busy()) finish(false); return 0;
    case WM_KEYDOWN:
      if(wp==VK_ESCAPE&&!busy())finish(false);
      if(wp==VK_RETURN) {
        if(phase==L"welcome"&&validatePath()) {write(L"Directory",installPath);write(L"DesktopShortcut",desktopShortcut?L"1":L"0");write(L"Action",L"start");phase=L"preparing";started=GetTickCount64();}
        else if(phase==L"complete"||phase==L"failed")finish(phase==L"complete");
      }
      return 0;
    case WM_DESTROY: if(!finished) write(L"Action",L"close"); PostQuitMessage(0); return 0;
    case WM_DPICHANGED: { scale=HIWORD(wp)/96.0f; auto r=(RECT*)lp; SetWindowPos(hwnd,nullptr,r->left,r->top,(int)(760*scale),(int)(500*scale),SWP_NOZORDER); MoveWindow(directoryEdit,(int)(126*scale),(int)(348*scale),(int)(492*scale),(int)(30*scale),TRUE); release(brandBitmap);release(target);return 0; }
  }
  return DefWindowProcW(hwnd,message,wp,lp);
}
int WINAPI wWinMain(HINSTANCE instance,HINSTANCE,PWSTR,int) {
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  int argc; auto argv=CommandLineToArgvW(GetCommandLineW(),&argc);
  if(argc!=3) {if(argv)LocalFree(argv);return 2;}
  if(wcscmp(argv[1],L"--check-running")==0||wcscmp(argv[1],L"--stop-running")==0){int result=targetProcesses(argv[2],wcscmp(argv[1],L"--stop-running")==0);LocalFree(argv);return result;}
  statePath=argv[1]; parentPid=_wtoi(argv[2]); LocalFree(argv);
  parentProcess=OpenProcess(SYNCHRONIZE,FALSE,parentPid);
  version=read(L"Version"); installPath=read(L"Directory");
  BOOL animations=TRUE; SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION,0,&animations,0); reducedMotion=!animations;
  CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);
  if(FAILED(D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED,&factory))||FAILED(DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED,__uuidof(IDWriteFactory),(IUnknown**)&textFactory))) return 3;
  WNDCLASSW wc{}; wc.lpfnWndProc=procedure; wc.hInstance=instance; wc.lpszClassName=L"ZeroWallModernInstaller"; wc.hCursor=LoadCursorW(nullptr,IDC_ARROW); wc.hIcon=LoadIconW(instance,MAKEINTRESOURCEW(1)); RegisterClassW(&wc);
  scale=GetDpiForSystem()/96.0f;
  windowHandle=CreateWindowExW(WS_EX_APPWINDOW,wc.lpszClassName,L"ZeroWall Science 安装",WS_POPUP|WS_MINIMIZEBOX|WS_CLIPCHILDREN,(GetSystemMetrics(SM_CXSCREEN)-(int)(760*scale))/2,(GetSystemMetrics(SM_CYSCREEN)-(int)(500*scale))/2,(int)(760*scale),(int)(500*scale),nullptr,nullptr,instance,nullptr);
  int corners=2; DwmSetWindowAttribute(windowHandle,33,&corners,sizeof(corners)); MARGINS margins{1,1,1,1}; DwmExtendFrameIntoClientArea(windowHandle,&margins);
  directoryEdit=CreateWindowExW(WS_EX_CLIENTEDGE,L"EDIT",installPath.c_str(),WS_CHILD|ES_AUTOHSCROLL|WS_TABSTOP,(int)(126*scale),(int)(348*scale),(int)(492*scale),(int)(30*scale),windowHandle,(HMENU)101,instance,nullptr);
  editProcedure=(WNDPROC)SetWindowLongPtrW(directoryEdit,GWLP_WNDPROC,(LONG_PTR)directoryProcedure);
  HFONT font=CreateFontW((int)(-13*scale),0,0,0,FW_NORMAL,FALSE,FALSE,FALSE,DEFAULT_CHARSET,0,0,CLEARTYPE_QUALITY,0,L"Microsoft YaHei UI"); SendMessageW(directoryEdit,WM_SETFONT,(WPARAM)font,TRUE);
  write(L"UiPid",std::to_wstring(GetCurrentProcessId()));
  started=GetTickCount64(); SetTimer(windowHandle,1,33,nullptr); ShowWindow(windowHandle,SW_SHOW); SetForegroundWindow(windowHandle);
  MSG msg; while(GetMessageW(&msg,nullptr,0,0)>0) { TranslateMessage(&msg); DispatchMessageW(&msg); }
  release(brandBitmap);release(target);release(textFactory);release(factory);if(parentProcess)CloseHandle(parentProcess); DeleteObject(font);CoUninitialize();return 0;
}
