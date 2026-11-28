param([Parameter(Mandatory)][string]$Backend)

$ErrorActionPreference = 'Stop'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($Backend, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors) { throw ($parseErrors | Out-String) }

foreach ($name in @('Assert-TextInputReady', 'Set-FocusedEditText', 'Set-NativeEditText')) {
  $definition = $ast.Find({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name
  }, $true)
  if ($null -eq $definition) { throw "Missing backend function $name" }
  . ([scriptblock]::Create($definition.Extent.Text))
}

Add-Type -TypeDefinition @'
using System;
using System.Text;

public static class WindowsComputerUseNative {
  public const uint EM_SETSEL = 0xB1, EM_REPLACESEL = 0xC2, WM_GETTEXTLENGTH = 0xE;
  public static bool Enabled = true, Responsive = true, WriteCompleted = true;
  public static int ReadAttempts, WriteAttempts, SelectionAttempts, ReadToFail;
  public static IntPtr FocusedWindow(IntPtr window) { return new IntPtr(2); }
  public static bool IsWindow(IntPtr window) { return window != IntPtr.Zero; }
  public static bool IsWindowEnabled(IntPtr window) { return Enabled; }
  public static bool IsResponsive(IntPtr window) { return Responsive; }
  public static int GetWindowLong(IntPtr window, int style) { return 0; }
  public static int GetClassName(IntPtr window, StringBuilder text, int capacity) { text.Append("Edit"); return 4; }
  public static IntPtr SendMessageTimeout(IntPtr window, uint message, UIntPtr first, IntPtr second,
      uint flags, uint timeout, out UIntPtr result) {
    result = new UIntPtr(3u + (WriteAttempts == 0 ? 0u : 7u));
    if (message == EM_SETSEL) SelectionAttempts++;
    if (message == WM_GETTEXTLENGTH && ++ReadAttempts == ReadToFail) return IntPtr.Zero;
    return new IntPtr(1);
  }
  public static IntPtr SendMessageTimeoutW(IntPtr window, uint message, IntPtr first, string text,
      uint flags, uint timeout, out UIntPtr result) {
    result = UIntPtr.Zero;
    WriteAttempts++;
    return WriteCompleted ? new IntPtr(1) : IntPtr.Zero;
  }
}
'@

function Get-RootWindow { param([long]$Hwnd) return 1 }
function Get-WindowProcessId { param([long]$Hwnd) return 42 }
function Test-Failsafe { return $true }
function Invoke-Safe { param([scriptblock]$Read, $Default) & $Read }
function Expect-InputError {
  param([scriptblock]$Action, [string]$Code, [int]$WriteAttempts)
  try {
    [void](& $Action)
    throw "Expected $Code"
  } catch {
    if (-not $_.Exception.Message.StartsWith($Code + ':')) { throw }
  }
  if ([WindowsComputerUseNative]::WriteAttempts -ne $WriteAttempts) {
    throw "Expected $WriteAttempts write attempts after $Code"
  }
}

$script:NativeEditClass = '^Edit$'
[WindowsComputerUseNative]::Enabled = $false
Expect-InputError { Set-FocusedEditText 1 'fixture' } 'INPUT_TARGET_DISABLED' 0
[WindowsComputerUseNative]::Enabled = $true
[WindowsComputerUseNative]::Responsive = $false
Expect-InputError { Set-FocusedEditText 1 'fixture' } 'INPUT_TARGET_UNRESPONSIVE' 0
[WindowsComputerUseNative]::Responsive = $true

[WindowsComputerUseNative]::ReadToFail = 1
Expect-InputError { Set-FocusedEditText 1 'fixture' } 'INPUT_TARGET_UNRESPONSIVE' 0
[WindowsComputerUseNative]::WriteCompleted = $false
Expect-InputError { Set-FocusedEditText 1 'fixture' } 'INPUT_TEXT_INCOMPLETE' 1
$element = [pscustomobject]@{ Current = [pscustomobject]@{ NativeWindowHandle = 2 } }
Expect-InputError { Set-NativeEditText $element 'fixture' } 'INPUT_TEXT_INCOMPLETE' 2
if ([WindowsComputerUseNative]::SelectionAttempts -ne 1) { throw 'Expected one native selection' }

[WindowsComputerUseNative]::WriteCompleted = $true
[WindowsComputerUseNative]::ReadToFail = [WindowsComputerUseNative]::ReadAttempts + 2
Expect-InputError { Set-FocusedEditText 1 'fixture' } 'INPUT_TEXT_INCOMPLETE' 3
[WindowsComputerUseNative]::WriteAttempts = 0
$observed = Set-FocusedEditText 1 'fixture'
if ($observed.grew -ne 7 -or [WindowsComputerUseNative]::WriteAttempts -ne 1) { throw 'Expected one confirmed write' }
Write-Output 'WINDOWS_COMPUTER_USE_TEXT_OK'
