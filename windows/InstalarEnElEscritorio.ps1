# Deja los tres juegos instalados en el Escritorio de Windows.
# Uso: clic derecho sobre este archivo > "Ejecutar con PowerShell"
$origen = Split-Path -Parent $PSScriptRoot
$destino = [Environment]::GetFolderPath('Desktop')
$navegador = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $navegador) { Write-Host "No encontre Chrome ni Edge."; exit 1 }

$juegos = @(
  @{ slug = 'maths';  nombre = 'Maths Make Me Crazy' },
  @{ slug = 'tildes'; nombre = 'Tildes Make Me Crazy' },
  @{ slug = 'tabla';  nombre = 'Tabla Make Me Crazy' }
)
$ws = New-Object -ComObject WScript.Shell
foreach ($j in $juegos) {
  $carpeta = Join-Path $origen $j.slug
  $html = Join-Path $carpeta 'index.html'
  if (-not (Test-Path $html)) { continue }
  $lnk = $ws.CreateShortcut((Join-Path $destino ($j.nombre + '.lnk')))
  $lnk.TargetPath = $navegador
  $lnk.Arguments = '--app="file:///' + ($html -replace '\\','/') + '" --window-size=980,940'
  $lnk.WorkingDirectory = $carpeta
  $lnk.IconLocation = (Join-Path $carpeta 'icon-192.png')
  $lnk.Description = $j.nombre
  $lnk.Save()
  Write-Host ("Listo: " + $j.nombre)
}
Write-Host "Los tres juegos quedaron en tu Escritorio."
