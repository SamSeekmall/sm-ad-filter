param(
    [Parameter(Mandatory=$true)][string]$OutputDirectory,
    # Packaging with a performance gate that is not MET needs a written reason; it is recorded in the receipt.
    [string]$PerformanceWaiver = '',
    # Recorded in the receipt so the rollback target is explicit.
    [string]$PreviousVersion = '0.4.7 / d632c6f'
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    if (git status --porcelain) { throw 'Commit source and QA records before packaging.' }
    $version = Get-Content sm/release.json -Raw | ConvertFrom-Json
    $commit = (git rev-parse HEAD).Trim()
    foreach ($test in @('worker','updates','welcome','perf-stats')) {
        node --test "sm/$test.test.mjs"
        if ($LASTEXITCODE -ne 0) { throw "Logic tests failed: $test" }
    }
    # Release builds must use the esbuild version pinned in the lockfile, and must be reproducible.
    $env:SM_REQUIRE_PINNED_ESBUILD = '1'
    node sm/determinism.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Build is not deterministic' }
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
    foreach ($channel in @('chromium','msedge')) {
        $native = Get-Content "build/qa-native-$channel/native-popup.json" -Raw | ConvertFrom-Json
        if ($native.status -ne 'PASS' -or $native.build.localCommit -ne $commit) { throw "Missing native popup verification: $channel" }
    }
    # Popup latency: COMPLETE only means the harness finished. The gate needs enough samples, no failures, and limits met.
    $gateReceipt = Join-Path ([System.IO.Path]::GetTempPath()) ("sm-perf-gate-" + [guid]::NewGuid().ToString('N') + '.json')
    node sm/perf-gate.mjs build/qa-popup-performance-chromium/native-timing.json build/qa-popup-performance-msedge/native-timing.json --commit $commit --out $gateReceipt
    $gateExit = $LASTEXITCODE
    $performanceGate = 'MET'
    if ($gateExit -ne 0) {
        if ([string]::IsNullOrWhiteSpace($PerformanceWaiver)) { throw 'Popup performance gate is not MET (see output above). Fix it, collect more samples, or pass -PerformanceWaiver with a reason.' }
        $performanceGate = "WAIVED: $PerformanceWaiver"
    }
    if (Test-Path -LiteralPath $OutputDirectory) { throw 'Output directory already exists; preserve the previous release.' }
    New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
    $output = (Resolve-Path -LiteralPath $OutputDirectory).Path
    $extensionZip = Join-Path $output "sm-ad-filter-$($version.productVersion)-chromium.zip"
    $sourceZip = Join-Path $output "sm-ad-filter-source-$($commit.Substring(0,7)).zip"
    Compress-Archive -Path build/sm-ad-filter/* -DestinationPath $extensionZip
    git archive --format=zip --output=$sourceZip HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Source archive failed' }
    Copy-Item PERFORMANCE-REVIEW-042.md,design-qa.md,sm/site-catalog.json,SUPPORT-SM.md,PILOT-PLAN-SM.md,IMPLEMENTATION-MATRIX-043.md,README-SM.md,QA-SM.md,PRIVACY-SM.md,RELEASE-SM.md,FEATURES-SM.md -Destination $output
    Copy-Item build/qa-v2/browser-test.json -Destination $output
    Copy-Item build/qa-v2-msedge/browser-test.json -Destination (Join-Path $output 'edge-browser-test.json')
    if (Test-Path build/qa-v2/live/results.json) { Copy-Item build/qa-v2/live/results.json -Destination (Join-Path $output 'historical-0.2-live-results.json') }
    Copy-Item build/qa-v2/01-control-center.png,build/qa-v2/02-narrow-layout.png,build/qa-v2/03-popup.png -Destination $output
    Copy-Item build/qa-v3-performance/measurements.json -Destination (Join-Path $output 'performance-measurements.json')
    Copy-Item build/qa-v3-performance/02-feedback-error.png,build/qa-v3-performance/04-control-dark.png,build/qa-v3-performance/06-zoom-200.png -Destination $output
    foreach ($channel in @('chromium','msedge')) {
        Copy-Item "build/qa-native-$channel/native-popup.json" -Destination (Join-Path $output "native-popup-$channel.json")
        Copy-Item "build/qa-native-$channel/native-popup.png" -Destination (Join-Path $output "native-popup-$channel.png")
    }
    foreach ($channel in @('chromium','msedge')) { Copy-Item "build/qa-popup-performance-$channel/native-timing.json" -Destination (Join-Path $output "popup-timing-$channel.json") }
    Copy-Item $gateReceipt -Destination (Join-Path $output 'performance-gate.json')
    Copy-Item build/sm-ad-filter/SM-FILES.json -Destination (Join-Path $output 'SM-FILES.json')
    $hashes = @($extensionZip,$sourceZip) | Get-FileHash -Algorithm SHA256 | Select-Object Hash,Path
    @{productVersion=$version.productVersion;extensionVersion=$version.extensionVersion;commit=$commit;engine=$version.engineVersion;upstreamCommit=$version.upstreamCommit;target='Chrome / Edge local unpacked extension';previousVersion=$PreviousVersion;hashes=$hashes;performanceGate=$performanceGate;toolchain=(Get-Content build/sm-ad-filter/SM-BUILD.json -Raw | ConvertFrom-Json).toolchain;storePublished=$false} | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $output 'RELEASE-RECEIPT.json') -Encoding utf8
    Get-ChildItem -LiteralPath $output | Select-Object Name,Length
} finally { Pop-Location }
