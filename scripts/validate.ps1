[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$skillRoot = Join-Path $root 'skills'
$manifestPath = Join-Path $skillRoot 'manifest.json'
$settings = Join-Path $root 'examples/settings.env.json'
$hooks = Join-Path $root 'examples/hooks.json'
$hookScript = Join-Path $root 'hooks/powershell/context-guard.ps1'
$hookTests = Join-Path $root 'hooks/powershell/context-guard.tests.ps1'

foreach ($path in @($manifestPath, $settings, $hooks, $hookScript, $hookTests)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing required file: $path" }
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1) { throw 'Unsupported skill manifest schema' }
if (-not $manifest.skills -or $manifest.skills.Count -lt 1) { throw 'Skill manifest is empty' }

$seenNames = @{}
foreach ($entry in $manifest.skills) {
  if ([string]::IsNullOrWhiteSpace($entry.name) -or $entry.name -notmatch '^[a-z0-9]+(?:-[a-z0-9]+)*$') {
    throw "Invalid skill name in manifest: $($entry.name)"
  }
  if ($seenNames.ContainsKey($entry.name)) { throw "Duplicate skill name: $($entry.name)" }
  $seenNames[$entry.name] = $true

  $skillPath = Join-Path $root $entry.path
  $entryPath = Join-Path $root $entry.entry
  if (-not (Test-Path -LiteralPath $skillPath -PathType Container)) { throw "Missing skill directory: $($entry.path)" }
  if (-not (Test-Path -LiteralPath $entryPath -PathType Leaf)) { throw "Missing skill entry: $($entry.entry)" }
  if ((Split-Path -Leaf $skillPath) -ne $entry.name) { throw "Skill directory does not match name: $($entry.path)" }

  $skillText = Get-Content -LiteralPath $entryPath -Raw
  if ($skillText -notmatch '(?ms)^---\s*\r?\nname:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*\r?\n') { throw "Skill frontmatter is invalid: $($entry.entry)" }
  if ($Matches[1] -ne $entry.name) { throw "Skill frontmatter name does not match manifest: $($entry.entry)" }
  if ($skillText -notmatch '(?m)^description:\s*\S') { throw "Skill description is missing: $($entry.entry)" }
  if (($skillText -split '\r?\n').Count -gt 500) { throw "Skill exceeds 500 lines: $($entry.entry)" }

  foreach ($relative in @($entry.files)) {
    $listedPath = Join-Path $skillPath ($relative -replace '/', [IO.Path]::DirectorySeparatorChar)
    if (-not (Test-Path -LiteralPath $listedPath -PathType Leaf)) { throw "Manifest file is missing: $($entry.name)/$relative" }
  }
}

$actualSkillDirs = @(Get-ChildItem -LiteralPath $skillRoot -Directory | Select-Object -ExpandProperty Name)
$manifestSkillDirs = @($manifest.skills | ForEach-Object { Split-Path -Leaf $_.path })
if (@(Compare-Object $actualSkillDirs $manifestSkillDirs).Count -gt 0) { throw 'Skill directories and manifest entries differ' }

$goalRoot = Join-Path $root 'plugins/goal'
$goalPlugin = Join-Path $goalRoot '.claude-plugin/plugin.json'
$goalPackage = Join-Path $goalRoot 'package.json'
$goalHooks = Join-Path $goalRoot 'hooks/hooks.json'
$marketplacePath = Join-Path $root '.claude-plugin/marketplace.json'
foreach ($relative in @('.claude-plugin/plugin.json', 'package.json', 'hooks/hooks.json', 'hooks/register.ts', 'skills/goal/SKILL.md')) {
  if (-not (Test-Path -LiteralPath (Join-Path $goalRoot $relative) -PathType Leaf)) { throw "Missing Goal plugin file: $relative" }
}
$plugin = Get-Content -LiteralPath $goalPlugin -Raw | ConvertFrom-Json
$package = Get-Content -LiteralPath $goalPackage -Raw | ConvertFrom-Json
$moduleHooks = Get-Content -LiteralPath $goalHooks -Raw | ConvertFrom-Json
$marketplace = Get-Content -LiteralPath $marketplacePath -Raw | ConvertFrom-Json
$listing = @($marketplace.plugins | Where-Object { $_.name -eq 'goal' })
if ($plugin.name -ne 'goal' -or $plugin.version -ne $package.version -or $listing.Count -ne 1 -or $listing[0].version -ne $plugin.version) { throw 'Goal plugin versions/listing disagree' }
if ($listing[0].source -ne './plugins/goal' -or $moduleHooks.modules.Count -ne 1 -or $moduleHooks.modules[0] -ne './register.ts') { throw 'Goal plugin entry points disagree' }
$goalSkills = @(Get-ChildItem -LiteralPath $goalRoot -Filter SKILL.md -Recurse -File)
if ($goalSkills.Count -ne 1) { throw 'Goal must have exactly one canonical skill entry' }

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
$files = Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object {
  $_.FullName -notmatch '[\\/]\.git[\\/]'
}
foreach ($file in $files) {
  $path = $file.FullName.Substring($root.Length + 1).Replace('\', '/')
  if ($path -eq 'scripts/validate.ps1') { continue }
  $content = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction Stop
  foreach ($pattern in $secrets) {
    if ($content.Contains($pattern)) { throw "Potential sensitive pattern '$pattern' in $path" }
  }
}

if (Get-Command powershell.exe -ErrorAction SilentlyContinue) {
  foreach ($path in @($hookScript, $hookTests)) {
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$null, [ref]$parseErrors) | Out-Null
    if ($parseErrors.Count -gt 0) { throw "PowerShell parse errors: $path" }
  }
}

'PASS: repository validation'
