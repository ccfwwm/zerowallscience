<# Rebuild the uninstaller sidebar from the approved installer artwork. #>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$assets = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../installer/assets'))
$background = [Drawing.Image]::FromFile((Join-Path $assets 'research-background.png'))
$logo = [Drawing.Image]::FromFile((Join-Path $assets 'research-logo.png'))
$sidebar = [Drawing.Bitmap]::new(164, 314)
$graphics = [Drawing.Graphics]::FromImage($sidebar)
$font = [Drawing.Font]::new('Segoe UI', 17, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
$format = [Drawing.StringFormat]::new()
try {
    $graphics.Clear([Drawing.Color]::FromArgb(246, 249, 253))
    $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.DrawImage($background, [Drawing.Rectangle]::new(0,0,164,314), 0,0,535,1024,[Drawing.GraphicsUnit]::Pixel)
    $graphics.DrawImage($logo, 56, 40, 51, 60)
    $format.Alignment = [Drawing.StringAlignment]::Center
    $graphics.DrawString("ZeroWall`nScience", $font, [Drawing.Brushes]::MidnightBlue, [Drawing.RectangleF]::new(8, 235, 148, 64), $format)
    $sidebar.Save((Join-Path $assets 'uninstaller-sidebar.png'), [Drawing.Imaging.ImageFormat]::Png)
} finally {
    $format.Dispose(); $font.Dispose(); $graphics.Dispose(); $sidebar.Dispose(); $logo.Dispose(); $background.Dispose()
}
