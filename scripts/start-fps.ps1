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

    Write-Host 'Starting NIGHTFALL tactical shooter...' -ForegroundColor Cyan
    Write-Host 'Local address: http://127.0.0.1:5189/'
    Write-Host 'Keep the server window open while playing. Press Ctrl+C to stop.'

    $typeChecker = Join-Path $projectDirectory 'node_modules\typescript\bin\tsc'
    $viteEntry = Join-Path $projectDirectory 'node_modules\vite\bin\vite.js'
    if (-not (Test-Path -LiteralPath $typeChecker) -or
        -not (Test-Path -LiteralPath $viteEntry)) {
        Write-Host 'Installing project dependencies...'
        & $npmCommand.Source ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check the network and try again.' }
    }

    Write-Host 'Checking the shooter source...'
    & $nodeCommand.Source $typeChecker --project (Join-Path $projectDirectory 'tsconfig.fps.json')
    if ($LASTEXITCODE -ne 0) { throw 'The shooter type check failed. See the error above; the server was not started.' }

    Write-Host 'Building the shooter...'
    & $nodeCommand.Source $viteEntry build --config (Join-Path $projectDirectory 'vite.fps.config.ts')
    if ($LASTEXITCODE -ne 0) { throw 'The shooter build failed. See the error above; the server was not started.' }

    $serverArguments = @((Join-Path $PSScriptRoot 'serve-fps.mjs'))
    if ($NoOpen) { $serverArguments += '--no-open' }
    & $nodeCommand.Source @serverArguments
    if ($LASTEXITCODE -ne 0) { throw 'The shooter server could not start. See the error above.' }
} catch {
    Write-Host ''
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
