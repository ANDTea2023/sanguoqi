param([switch]$NoOpen)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDirectory

try {
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $nodeCommand -or -not $npmCommand) {
        throw 'Node.js and npm are required. Install the Node.js LTS version, then run this launcher again.'
    }

    Write-Host 'Starting Three Kingdoms Xiangqi...' -ForegroundColor Cyan
    Write-Host 'Local address: http://127.0.0.1:5188/'
    Write-Host 'Keep this window open while playing. Press Ctrl+C to stop.'

    if (-not (Test-Path -LiteralPath 'node_modules\.bin\vite.cmd') -or
        -not (Test-Path -LiteralPath 'node_modules\.bin\tsc.cmd')) {
        Write-Host 'Installing project dependencies...'
        & $npmCommand.Source ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check the network and try again.' }
    }

    Write-Host 'Building the game...'
    & $npmCommand.Source run build
    if ($LASTEXITCODE -ne 0) { throw 'The build failed. See the error above; the server was not started.' }

    $serverArguments = @((Join-Path $PSScriptRoot 'serve-local.mjs'))
    if ($NoOpen) { $serverArguments += '--no-open' }
    & $nodeCommand.Source @serverArguments
    if ($LASTEXITCODE -ne 0) { throw 'The local server could not start. See the error above.' }
} catch {
    Write-Host ''
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
