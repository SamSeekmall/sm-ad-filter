# Popup design QA

final result: passed

Target: selected first Product Design mock exec-c5dcb618-b582-4710-906e-e2882b78dbba.png. Implementation: real chrome.action.openPopup() on example.com, light theme, 380 CSS px.

Iteration 1 comparison: build/qa-native-chromium/comparison.png (source left, render right, source scaled to 380 px). P2 oversized labels and excessive vertical spacing were corrected with 17 px rows, 19 px title and reduced gaps. Filter icon now official Tabler filter-2, pointer official Tabler pointer. No fabricated statistics.

Typography: system fonts, no network fonts. Color: off-white, dark ink and emerald primary. Layout: fixed native width, long host wraps, advanced controls disclosed. Assets: generated brand and MIT Tabler 3.35.0 icons, license bundled. Copy: target labels preserved; functional loading/error/pause states added.

Remaining P3: generated logo silhouette and OS font rasterization differ slightly; pointer has no marquee. Post-fix recapture: build/qa-native-chromium/comparison.png, real 380 x 486 popup versus normalized 380 x 480 reference. No remaining P0/P1/P2 visual differences. Native mode/pause/resume passed in Chromium; cross-browser release gates remain in package.ps1.
