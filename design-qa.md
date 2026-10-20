# Popup design QA

final result: passed

Target: selected first Product Design mock exec-c5dcb618-b582-4710-906e-e2882b78dbba.png. Implementation: real chrome.action.openPopup() on example.com, light theme, 380 CSS px.

Iteration 1 comparison: build/qa-native-chromium/comparison.png (source left, render right, source scaled to 380 px). P2 oversized labels and excessive vertical spacing were corrected with 17 px rows, 19 px title and reduced gaps. Filter icon now official Tabler filter-2, pointer official Tabler pointer. No fabricated statistics.

Typography: system fonts, no network fonts. Color: off-white, dark ink and emerald primary. Layout: fixed native width, long host wraps, advanced controls disclosed. Assets: generated brand and MIT Tabler 3.35.0 icons, license bundled. Copy: target labels preserved; functional loading/error/pause states added.

Remaining P3: generated logo silhouette and OS font rasterization differ slightly; pointer has no marquee. Post-fix recapture: build/qa-native-chromium/comparison.png, real 380 x 486 popup versus normalized 380 x 480 reference. No remaining P0/P1/P2 visual differences. Native mode/pause/resume passed in Chromium; cross-browser release gates remain in package.ps1.

## 2026-10-20 desktop popup redesign

Popup is now 320 px wide (was 380 px) and about 360 px tall (was about 486 px). Protection status with a shield icon comes first; the filter mode is a four-way segmented control that applies on one tap (replaces details + select + "apply"); element tools sit side by side; recent rule hits and the permission note are small text. Mode, pause and resume pass the native popup test in Chromium; light, dark, paused, no-permission and internal-page states were checked with stubbed status. Not a re-run of the original mock comparison: the earlier 380 px mock no longer applies.

## 2026-10-20 control center redesign

"当前网站" now opens with a protection status card; the site box has quick-pick chips (paused sites, sites with hidden elements); the selected site shows a four-way segmented mode control (one tap applies it) and pause buttons; the troubleshooting wizard is folded. "规则" uses switches for Chinese-site rules, reduce-annoyances and Cookie auto-reject; the first two can now be turned off (the worker removes only those rulesets, never the base lists). The full real-browser test passes (14 scenarios, including a new one for the switches and one-tap mode); light, dark, 1180 px and 390 px renders were checked, and no touch target is under 44 px with the touch rules forced on. Not checked on a real phone.

## 2026-10-20 English interface

The popup, control center, element-tools page and the extension name/description now follow the browser language (Chinese browser: Chinese, anything else: English), with a manual choice (中文 / English / Auto) under the control center navigation. `sm/i18n.js` translates what the pages show, so the Chinese source strings are unchanged. In English the product is named "SM Clean View". `sm/i18n-test.mjs` opens every page and popup state under an English browser and fails on any remaining Chinese text; a Chinese browser still runs the full browser test unchanged (`--lang=zh-CN`). Not translated: the upstream full-settings page (it already has its own locales), README and release notes, and the Chinese-only filter names such as the Chinese-site list.
