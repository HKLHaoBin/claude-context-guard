[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$skill = Join-Path $root 'skills/claude-context-guard/SKILL.md'
$settings = Join-Path $root 'examples/settings.env.json'
$hooks = Join-Path $root 'examples/hooks.json'
$hookScript = Join-Path $root 'hooks/powershell/context-guard.ps1'
$hookTests = Join-Path $root 'hooks/powershell/context-guard.tests.ps1'

foreach ($path in @($skill, $settings, $hooks, $hookScript, $hookTests)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing required file: $path" }
}

$frontmatter = Get-Content -LiteralPath $skill -Raw
if ($frontmatter -notmatch '(?ms)^---\s*\r?\nname:\s*[a-z0-9-]+\s*\r?\n') { throw 'Skill frontmatter is invalid' }
if (($frontmatter -split '\r?\n').Count -gt 500) { throw 'Skill exceeds 500 lines' }

foreach ($jsonPath in @($settings, $hooks)) {
  Get-Content -LiteralPath $jsonPath -Raw | ConvertFrom-Json | Out-Null
}

$secrets = @(
  'ANTHROPIC_AUTH_TOKEN',
  'OPENAI_API_KEY',
  'Bearer ',
  'gho_',
  'sk-ant-',
  '127.0.0.1:',
  'C:\Users\'
)
$tracked = & git -C $root ls-files
foreach ($path in $tracked) {
  if ($path -eq 'scripts/validate.ps1') { continue }
  $content = Get-Content -LiteralPath (Join-Path $root $path) -Raw -ErrorAction Stop
  foreach ($pattern in $secrets) {
    if ($content.Contains($pattern)) { throw "Potential sensitive pattern '$pattern' in $path" }
  }
}

if (Get-Command powershell.exe -ErrorAction SilentlyContinue) {
  $parseErrors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($hookScript, [ref]$null, [ref]$parseErrors) | Out-Null
  if ($parseErrors.Count -gt 0) { throw "Hook script has PowerShell parse errors" }
  [System.Management.Automation.Language.Parser]::ParseFile($hookTests, [ref]$null, [ref]$parseErrors) | Out-Null
  if ($parseErrors.Count -gt 0) { throw "Hook test script has PowerShell parse errors" }
}

'PASS: repository validation'
