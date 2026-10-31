param([Parameter(Mandatory=$true)][string]$HubRoot,[Parameter(Mandatory=$true)][string]$ModelFile,[string]$OutputDirectory='')
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if(!$OutputDirectory){$OutputDirectory=Join-Path $root 'artifacts/release'}
$manifest=Get-Content (Join-Path $root 'hub/manifest.json') -Raw | ConvertFrom-Json
$stage=Join-Path $root ('artifacts/stage-'+[guid]::NewGuid().ToString('N'))
if(!(Test-Path -LiteralPath $ModelFile)){throw 'IS-Net model is required'}
if((Get-FileHash -LiteralPath $ModelFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne (Get-Content (Join-Path $root 'model-sha256.txt') -Raw).Trim()){throw 'IS-Net SHA-256 mismatch'}
dotnet publish (Join-Path $root 'src/ThodCanvas.Worker') -c Release -r win-x64 --self-contained true -o (Join-Path $stage 'worker') --nologo
if($LASTEXITCODE){throw 'Worker build failed'}
node --check (Join-Path $root 'ui/editor.js')
if($LASTEXITCODE){throw 'Editor JavaScript is invalid'}
Copy-Item (Join-Path $root 'ui') (Join-Path $stage 'ui') -Recurse
Copy-Item (Join-Path $HubRoot 'sdk/thodhub.js') (Join-Path $stage 'ui/thodhub.js')
New-Item (Join-Path $stage 'worker/models') -ItemType Directory -Force | Out-Null
Copy-Item -LiteralPath $ModelFile -Destination (Join-Path $stage 'worker/models/isnet-general-use.onnx')
Copy-Item (Join-Path $root 'hub/manifest.json') (Join-Path $stage 'manifest.json')
foreach($name in @('README.md','LICENSE','THIRD-PARTY-NOTICES.md','licenses')){Copy-Item (Join-Path $root $name) $stage -Recurse}
& (Join-Path $HubRoot 'scripts/package-module.ps1') -PackageDirectory $stage -Repository ThodProd/ThodCanvas -OutputDirectory $OutputDirectory -Notes 'Текст вводится прямо на холсте с кареткой, шрифтами и живым обновлением. Кадрирование с рамкой по краям, видимое выделение, инверсия, заливка, копирование и вырезание на новый слой. AI-выделение объекта щелчком и удаление фона нейросетью с мягким краем.'
$zipPath=Join-Path $OutputDirectory ("$($manifest.id)-$($manifest.version)-win-x64.zip")
if(!(Test-Path -LiteralPath $zipPath)){throw 'Package was not created'}
# The catalog format uses forward slashes inside ZIP archives; rewrite entries created by .NET on Windows.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$temp=$zipPath+'.tmp'
Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
$source=[IO.Compression.ZipFile]::OpenRead($zipPath)
$target=[IO.Compression.ZipFile]::Open($temp,[IO.Compression.ZipArchiveMode]::Create)
try{
    foreach($entry in $source.Entries){
        if($entry.FullName.EndsWith('/')){continue}
        $newEntry=$target.CreateEntry($entry.FullName.Replace('\','/'),[IO.Compression.CompressionLevel]::Optimal)
        $inputStream=$entry.Open();$outputStream=$newEntry.Open()
        try{$inputStream.CopyTo($outputStream)}finally{$outputStream.Dispose();$inputStream.Dispose()}
    }
}finally{$source.Dispose();$target.Dispose()}
Move-Item -LiteralPath $temp -Destination $zipPath -Force
$releasePath=Join-Path $OutputDirectory 'thodhub-release.json'
$release=[IO.File]::ReadAllText($releasePath,[Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
$release.sha256=(Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
$release.size=(Get-Item -LiteralPath $zipPath).Length
[IO.File]::WriteAllText($releasePath,($release | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
& (Join-Path $HubRoot 'scripts/validate-package.ps1') -Package $zipPath -Release $releasePath -Repository ThodProd/ThodCanvas | Write-Host
