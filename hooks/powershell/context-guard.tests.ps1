[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'context-guard.ps1'

# Invoke the script in a child PowerShell process so its stdin and exit code are tested.
function Invoke-GuardInProcess {
  param(
    [string]$Json,
    [string]$Mode = 'warn',
    [string]$Threshold = '160000'
  )

  $inputFile = [IO.Path]::GetTempFileName()
  try {
    Set-Content -LiteralPath $inputFile -Value $Json -Encoding UTF8 -NoNewline
    $env:CLAUDE_CONTEXT_GUARD_MODE = $Mode
    $env:CLAUDE_CONTEXT_GUARD_THRESHOLD = $Threshold
    $result = Get-Content -Raw -LiteralPath $inputFile | & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath 2>&1
    [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($result -join "`n") }
  } finally {
    Remove-Item -LiteralPath $inputFile -Force -ErrorAction SilentlyContinue
    Remove-Item Env:CLAUDE_CONTEXT_GUARD_MODE -ErrorAction SilentlyContinue
    Remove-Item Env:CLAUDE_CONTEXT_GUARD_THRESHOLD -ErrorAction SilentlyContinue
  }
}

$below = Invoke-GuardInProcess '{"usage":{"input_tokens":120000}}'
if ($below.ExitCode -ne 0 -or $below.Output.Trim()) { throw 'below-threshold case failed' }

$warn = Invoke-GuardInProcess '{"usage":{"input_tokens":160000}}'
if ($warn.ExitCode -ne 0) { throw 'warn case exit code failed' }
if ($warn.Output -notmatch 'guard threshold') { throw 'warn case did not report threshold' }

$block = Invoke-GuardInProcess '{"usage":{"input_tokens":160000}}' 'block'
if ($block.ExitCode -ne 2) { throw "block case exit code was $($block.ExitCode), expected 2" }

$missing = Invoke-GuardInProcess '{"event":"prompt"}'
if ($missing.ExitCode -ne 0 -or $missing.Output.Trim()) { throw 'missing-usage case failed' }

$invalid = Invoke-GuardInProcess '{not-json'
if ($invalid.ExitCode -ne 0 -or $invalid.Output.Trim()) { throw 'invalid-json case failed' }

'PASS: context guard cases'
