$ErrorActionPreference = 'Stop'
$serviceRoot = $PSScriptRoot
$pythonExe = Join-Path $serviceRoot '.venv/Scripts/python.exe'
& $pythonExe (Join-Path $serviceRoot 'server.py')
