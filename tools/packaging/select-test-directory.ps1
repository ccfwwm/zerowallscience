param([Parameter(Mandatory=$true)][int]$PickerProcessId, [Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PickerRegressionWindow {
  public delegate bool Visitor(IntPtr window, IntPtr param);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, Visitor visitor, IntPtr param);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr window);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr window, StringBuilder value, int max);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wparam, string lparam);
  public static IntPtr Find(IntPtr parent, string kind, int id) {
    IntPtr found = IntPtr.Zero;
    EnumChildWindows(parent, (window, param) => {
      var name = new StringBuilder(256); GetClassName(window, name, 256);
      if (name.ToString() == kind && GetDlgCtrlID(window) == id) { found = window; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
'@
$processCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $PickerProcessId)
$deadline = [DateTime]::UtcNow.AddSeconds(30)
do {
  $window = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, $processCondition)
  if ($window) {
    $fieldCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, '1152')
    $field = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $fieldCondition)
    if ($field) { break }
  }
  Start-Sleep -Milliseconds 250
} while ([DateTime]::UtcNow -lt $deadline)
if (!$field) { throw 'The regression folder dialog did not expose its folder field.' }
$handle = [IntPtr]$window.Current.NativeWindowHandle
$edit = [PickerRegressionWindow]::Find($handle, 'Edit', 1152)
if ($edit -eq [IntPtr]::Zero) { throw 'The regression folder field did not expose its native text edit.' }
[void][PickerRegressionWindow]::SendMessage($edit, 12, [IntPtr]::Zero, $Directory)
$button = [PickerRegressionWindow]::Find($handle, 'Button', 1)
if ($button -eq [IntPtr]::Zero) { throw 'The regression folder dialog did not expose its native selection button.' }
[void][PickerRegressionWindow]::SendMessage($button, 245, [IntPtr]::Zero, $null)
