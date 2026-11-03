<# Render the native installer artwork from the application's ZeroWall icon. #>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$appRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$icon = [Drawing.Image]::FromFile((Join-Path $appRoot 'resources/icon.png'))
try {
    foreach ($dark in @($false, $true)) {
        foreach ($scale in @(1, 2)) {
            $bitmap = [Drawing.Bitmap]::new(600 * $scale, 208 * $scale)
            $graphics = [Drawing.Graphics]::FromImage($bitmap)
            $font = [Drawing.Font]::new('Segoe UI', 30, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
            $brush = [Drawing.SolidBrush]::new($(if ($dark) { [Drawing.Color]::FromArgb(245, 247, 255) } else { [Drawing.Color]::FromArgb(23, 31, 52) }))
            $format = [Drawing.StringFormat]::new()
            $clip = [Drawing.Drawing2D.GraphicsPath]::new()
            try {
                $graphics.Clear($(if ($dark) { [Drawing.Color]::FromArgb(21, 21, 23) } else { [Drawing.Color]::White }))
                $graphics.ScaleTransform($scale, $scale)
                $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
                $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
                $clip.AddArc(244, 12, 40, 40, 180, 90)
                $clip.AddArc(316, 12, 40, 40, 270, 90)
                $clip.AddArc(316, 84, 40, 40, 0, 90)
                $clip.AddArc(244, 84, 40, 40, 90, 90)
                $clip.CloseFigure()
                $graphics.SetClip($clip)
                $graphics.FillRectangle([Drawing.Brushes]::White, 244, 12, 112, 112)
                $graphics.DrawImage($icon, 248, 16, 104, 104)
                $graphics.ResetClip()
                $format.Alignment = [Drawing.StringAlignment]::Center
                $format.LineAlignment = [Drawing.StringAlignment]::Center
                $graphics.DrawString('ZeroWall Science', $font, $brush, [Drawing.RectangleF]::new(32, 152, 536, 48), $format)
                $name = 'brand' + $(if ($dark) { '-dark' } else { '' }) + $(if ($scale -eq 2) { '-2x' } else { '' })
                $bitmap.Save((Join-Path $appRoot "installer/assets/$name.png"), [Drawing.Imaging.ImageFormat]::Png)
            } finally {
                $clip.Dispose(); $format.Dispose(); $brush.Dispose(); $font.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
            }
        }
    }
    $sidebar = [Drawing.Bitmap]::new(164, 314)
    $graphics = [Drawing.Graphics]::FromImage($sidebar)
    $font = [Drawing.Font]::new('Segoe UI', 17, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
    $format = [Drawing.StringFormat]::new()
    try {
        $graphics.Clear([Drawing.Color]::FromArgb(242, 245, 255))
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
        $graphics.DrawImage($icon, 34, 68, 96, 96)
        $format.Alignment = [Drawing.StringAlignment]::Center
        $graphics.DrawString("ZeroWall`nScience", $font, [Drawing.Brushes]::MidnightBlue, [Drawing.RectangleF]::new(8, 192, 148, 76), $format)
        $sidebar.Save((Join-Path $appRoot 'installer/assets/uninstaller-sidebar.png'), [Drawing.Imaging.ImageFormat]::Png)
    } finally { $format.Dispose(); $font.Dispose(); $graphics.Dispose(); $sidebar.Dispose() }
} finally { $icon.Dispose() }
