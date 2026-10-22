param([string]$MagpieBin = $env:MAGPIE_BIN, [string]$InstallDir = $env:QWENWORK_PLUGIN_INSTALL_DIR)
$ErrorActionPreference = 'Stop'
if (-not $MagpieBin) {
  $cmd = Get-Command magpie -ErrorAction SilentlyContinue
  if ($cmd) { $MagpieBin = $cmd.Source }
}
if (-not $MagpieBin) {
  foreach ($base in @($env:LOCALAPPDATA, $env:ProgramFiles)) {
    if (-not $base) { continue }
    foreach ($candidate in @('Programs/magpie/magpie.exe', 'magpie/magpie.exe', 'Magpie/magpie.exe')) {
      $file = Join-Path $base $candidate
      if (Test-Path $file -PathType Leaf) { $MagpieBin = $file; break }
    }
    if ($MagpieBin) { break }
  }
}
if (-not $MagpieBin) { throw 'Magpie CLI not found. Set MAGPIE_BIN to its executable.' }
if (-not $InstallDir) { $InstallDir = Join-Path $env:LOCALAPPDATA 'magpie-plugins/qwenwork-community' }
$InstallDir = [IO.Path]::GetFullPath($InstallDir)
if ($InstallDir -eq [IO.Path]::GetPathRoot($InstallDir) -or $InstallDir -eq $env:USERPROFILE) { throw 'Unsafe install directory.' }
$marker = '.managed-by-magpie-qwenwork-auth'
$previous = "$InstallDir.previous"
foreach ($dir in @($InstallDir, $previous)) {
  if ((Test-Path $dir) -and -not (Test-Path (Join-Path $dir $marker) -PathType Leaf)) { throw 'Unrecognized installation directory; nothing was changed.' }
}
$parent = Split-Path -Parent $InstallDir
New-Item -ItemType Directory -Force -Path $parent | Out-Null
$stage = Join-Path $parent ('.qwenwork-install-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
try {
  foreach ($file in @('index.mjs', 'lib', 'assets', 'package.json', $marker, 'README.md', 'CHANGELOG.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'docs')) {
    Copy-Item -Recurse -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $stage
  }
  New-Item -ItemType Directory -Path (Join-Path $stage 'scripts') | Out-Null
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'scripts/diagnose.mjs') -Destination (Join-Path $stage 'scripts')
  if (Test-Path $previous) { Remove-Item -Recurse -Force -LiteralPath $previous }
  if (Test-Path $InstallDir) { Move-Item -LiteralPath $InstallDir -Destination $previous }
  Move-Item -LiteralPath $stage -Destination $InstallDir
  & $MagpieBin plugin add $InstallDir
  if ($LASTEXITCODE -ne 0) {
    Remove-Item -Recurse -Force -LiteralPath $InstallDir
    if (Test-Path $previous) { Move-Item -LiteralPath $previous -Destination $InstallDir }
    throw 'Magpie registration failed. Previous plugin files were restored.'
  }
  Write-Host 'Installed. Open Magpie > Providers > From plugins > QwenWork and sign in.'
  Write-Host 'Existing model routes were not selected or changed by this installer.'
} finally { if (Test-Path $stage) { Remove-Item -Recurse -Force -LiteralPath $stage } }
