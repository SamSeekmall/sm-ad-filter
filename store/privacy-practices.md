# Privacy practices and permission justifications

Answers for the Chrome Web Store "Privacy practices" tab (Edge Partner Center asks for a subset). Each justification is under the 1,000-character limit.

## Single purpose

Block ads and trackers on web pages, with per-site controls to pause or adjust that filtering.

## Permission justifications

**activeTab**
Reads the address of the current tab when the user opens the toolbar popup, so the popup can show and change the filtering state of that site.

**alarms**
Ends a temporary per-site pause at the time the user chose (10 minutes or 1 hour), and schedules periodic checks of filter lists the user imported.

**declarativeNetRequest**
The core of the extension: the browser blocks ad, tracker and malware requests using the bundled filter rules. Per-site filtering modes and pauses are also applied as declarative rules.

**offscreen**
Compiles filter lists that the user chose to import into declarative rules in an offscreen document, outside the service worker's time limits.

**scripting**
Injects the bundled cosmetic-filtering scripts that hide ad slots on pages, and runs the element picker when the user asks to hide an element.

**storage**
Keeps the user's settings on the device: enabled rule groups, per-site modes, hidden elements, temporary pauses and the local undo history.

**unlimitedStorage**
Compiled filter lists and up to 10 undo snapshots can exceed the default local storage quota.

**userScripts**
Runs the scriptlets that some filter rules need (for example to neutralise an anti-adblock script) in the page's main world. All scriptlet code is bundled in the package; filter lists only choose which bundled scriptlet runs and with which arguments.

**Host permission: <all_urls>**
An ad blocker has to act on every site the user visits: hide ad slots, run filtering scriptlets and apply per-site settings. Page content is not read out, stored or sent anywhere.

**Optional: declarativeNetRequestFeedback**
Requested only when the user clicks "Show recent rule hits" in the popup, to list the rules that matched on the current page.

## Remote code

No. All JavaScript is in the package. Filter lists, including ones the user imports, are data that the bundled engine compiles into declarative rules; they cannot add new code.

## Data usage

The extension does not collect any of the listed data types (personally identifiable information, health, financial, authentication, personal communications, location, web history, user activity, website content).

Certify all three:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Notes for reviewers, if asked:
- Optional browser sync writes the user's own settings to their browser account (chrome.storage.sync) only after they turn it on and click Upload; SeekMall never receives it.
- A feedback report is shown to the user and only leaves the device if the user copies it or confirms opening a GitHub form.

## Privacy policy URL

{{PRIVACY_URL}} (the content is `PRIVACY-SM.md` in this repository)
