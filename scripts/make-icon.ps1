$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$images=@()
foreach($size in @(16,24,32,48,64,128,256)) {
    $bitmap=[Drawing.Bitmap]::new($size,$size);$g=[Drawing.Graphics]::FromImage($bitmap);$g.SmoothingMode='AntiAlias';$g.Clear([Drawing.Color]::FromArgb(235,239,248));$g.ScaleTransform($size/64.0,$size/64.0)
    $brush=[Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(117,145,192));$pen=[Drawing.Pen]::new([Drawing.Color]::FromArgb(66,99,139),4)
    $g.FillPolygon($brush,[Drawing.PointF[]]@([Drawing.PointF]::new(32,12),[Drawing.PointF]::new(55,24),[Drawing.PointF]::new(32,36),[Drawing.PointF]::new(9,24)))
    foreach($y in @(34,44)){$g.DrawLines($pen,[Drawing.PointF[]]@([Drawing.PointF]::new(10,$y),[Drawing.PointF]::new(32,$y+12),[Drawing.PointF]::new(54,$y)))}
    $stream=[IO.MemoryStream]::new();$bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png);$images+=,@{Size=$size;Bytes=$stream.ToArray()};$stream.Dispose();$brush.Dispose();$pen.Dispose();$g.Dispose();$bitmap.Dispose()
}
$file=[IO.File]::Create((Join-Path $PSScriptRoot '../assets/thodcanvas.ico'));$writer=[IO.BinaryWriter]::new($file)
try{$writer.Write([uint16]0);$writer.Write([uint16]1);$writer.Write([uint16]$images.Count);$offset=6+16*$images.Count;foreach($image in $images){$s=if($image.Size-eq 256){0}else{$image.Size};$writer.Write([byte]$s);$writer.Write([byte]$s);$writer.Write([uint16]0);$writer.Write([uint16]1);$writer.Write([uint16]32);$writer.Write([uint32]$image.Bytes.Length);$writer.Write([uint32]$offset);$offset+=$image.Bytes.Length};foreach($image in $images){$writer.Write([byte[]]$image.Bytes)}}finally{$writer.Dispose();$file.Dispose()}
