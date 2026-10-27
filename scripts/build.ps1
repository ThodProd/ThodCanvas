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
& (Join-Path $HubRoot 'scripts/package-module.ps1') -PackageDirectory $stage -Repository ThodProd/ThodCanvas -OutputDirectory $OutputDirectory -Notes 'Слои сверху и параметры только выбранного инструмента. Быстрые подсказки, текст без обрезки выделением, Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z в русской раскладке.'
