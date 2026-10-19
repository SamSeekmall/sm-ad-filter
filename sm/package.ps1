param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    if (git status --porcelain) { throw 'Commit source and QA records before packaging.' }
    $version = Get-Content sm/release.json -Raw | ConvertFrom-Json
    $commit = (git rev-parse HEAD).Trim()
    node sm/build.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
    node sm/verify.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Verification failed' }
    foreach ($qaPath in @('build/qa-v2/browser-test.json','build/qa-v2-msedge/browser-test.json')) {
        $qaReport = Get-Content $qaPath -Raw | ConvertFrom-Json
        if ($qaReport.status -ne 'PASS' -or $qaReport.buildMetadata.localCommit -ne $commit) { throw "Missing passing browser verification for this commit: $qaPath" }
    }
    $performance = Get-Content build/qa-v3-performance/measurements.json -Raw | ConvertFrom-Json
    if ($performance.status -ne 'COMPLETE' -or $performance.build.localCommit -ne $commit) { throw 'Missing performance verification for this commit.' }
    if (Test-Path -LiteralPath $OutputDirectory) { throw 'Output directory already exists; preserve the previous release.' }
    New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
    $output = (Resolve-Path -LiteralPath $OutputDirectory).Path
    $extensionZip = Join-Path $output "sm-ad-filter-$($version.productVersion)-chromium.zip"
    $sourceZip = Join-Path $output "sm-ad-filter-source-$($commit.Substring(0,7)).zip"
    Compress-Archive -Path build/sm-ad-filter/* -DestinationPath $extensionZip
    git archive --format=zip --output=$sourceZip HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Source archive failed' }
    Copy-Item README-SM.md,QA-SM.md,PRIVACY-SM.md,RELEASE-SM.md,FEATURES-SM.md -Destination $output
    Copy-Item build/qa-v2/browser-test.json -Destination $output
    Copy-Item build/qa-v2-msedge/browser-test.json -Destination (Join-Path $output 'edge-browser-test.json')
    Copy-Item build/qa-v2/live/results.json -Destination (Join-Path $output 'historical-0.2-live-results.json')
    Copy-Item build/qa-v2/01-control-center.png,build/qa-v2/02-narrow-layout.png,build/qa-v2/03-popup.png -Destination $output
    Copy-Item build/qa-v3-performance/measurements.json -Destination (Join-Path $output 'performance-measurements.json')
    Copy-Item build/qa-v3-performance/02-feedback-error.png,build/qa-v3-performance/04-control-dark.png,build/qa-v3-performance/06-zoom-200.png -Destination $output
    $hashes = @($extensionZip,$sourceZip) | Get-FileHash -Algorithm SHA256 | Select-Object Hash,Path
    @{productVersion=$version.productVersion;extensionVersion=$version.extensionVersion;commit=$commit;engine=$version.engineVersion;upstreamCommit=$version.upstreamCommit;target='Chrome / Edge local unpacked extension';previousVersion='0.2.0 / 4866934';hashes=$hashes;storePublished=$false} | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $output 'RELEASE-RECEIPT.json') -Encoding utf8
    Get-ChildItem -LiteralPath $output | Select-Object Name,Length
} finally { Pop-Location }
