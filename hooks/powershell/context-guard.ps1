[CmdletBinding()]
param()

[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Write-JsonOutput {
  param([hashtable]$Value)
  $Value | ConvertTo-Json -Depth 8 -Compress
}

function Get-Number {
  param(
    [object]$Object,
    [string[]]$Names
  )

  foreach ($name in $Names) {
    if ($null -ne $Object -and $Object.PSObject.Properties.Name -contains $name) {
      $value = $Object.$name
      if ($null -ne $value -and "$value" -match '^\d+(\.\d+)?$') {
        return [double]$value
      }
    }
  }

  return $null
}

$raw = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($raw)) {
  exit 0
}

try {
  $payload = $raw | ConvertFrom-Json
} catch {
  # Do not block a session merely because a host sent an unfamiliar payload.
  exit 0
}

$usage = $payload.usage
if ($null -eq $usage) { $usage = $payload.context_usage }
if ($null -eq $usage) { $usage = $payload.contextWindow }

$used = Get-Number $payload @('used_tokens', 'context_tokens', 'total_tokens')
if ($null -eq $used) { $used = Get-Number $usage @('used_tokens', 'context_tokens', 'total_tokens', 'input_tokens') }

$window = Get-Number $payload @('context_window', 'context_window_size', 'max_context_tokens')
if ($null -eq $window) { $window = Get-Number $usage @('context_window', 'context_window_size', 'max_context_tokens') }

if ($null -eq $used) {
  exit 0
}

$thresholdText = [Environment]::GetEnvironmentVariable('CLAUDE_CONTEXT_GUARD_THRESHOLD', 'Process')
if (-not $thresholdText) { $thresholdText = [Environment]::GetEnvironmentVariable('CLAUDE_CONTEXT_GUARD_THRESHOLD', 'User') }
if (-not $thresholdText) { $thresholdText = '160000' }

$threshold = 0.0
if (-not [double]::TryParse($thresholdText, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$threshold)) {
  exit 0
}

$mode = [Environment]::GetEnvironmentVariable('CLAUDE_CONTEXT_GUARD_MODE', 'Process')
if (-not $mode) { $mode = [Environment]::GetEnvironmentVariable('CLAUDE_CONTEXT_GUARD_MODE', 'User') }
if (-not $mode) { $mode = 'warn' }
$mode = $mode.ToLowerInvariant()

if ($used -lt $threshold) {
  exit 0
}

$windowText = 'unknown'
if ($null -ne $window) { $windowText = [string][int64]$window }
$message = "Context usage ($([int64]$used) tokens) reached the guard threshold ($([int64]$threshold)); reported window: $windowText. Compact or start a fresh session before continuing."

if ($mode -eq 'block') {
  $output = @{
    decision = 'block'
    reason = $message
    hookSpecificOutput = @{
      hookEventName = 'UserPromptSubmit'
      additionalContext = $message
    }
  }
  Write-JsonOutput $output
  exit 2
}

$output = @{
  hookSpecificOutput = @{
    hookEventName = 'UserPromptSubmit'
    additionalContext = $message
  }
}
Write-JsonOutput $output
exit 0
