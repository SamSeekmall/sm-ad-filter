# SM 净览 隐私政策 / SM Clean View Privacy Policy

生效日期 / Effective: 2026-10-23 · 适用版本 / Applies to: 0.4.8 及以后 / and later

[中文](#中文) · [English](#english)

---

## 中文

SM 净览（下称"本扩展"）是基于 uBlock Origin Lite 的广告与跟踪过滤扩展，由 SeekMall 维护。本扩展在你的浏览器内部完成过滤。

### 我们不收集的信息

- 本扩展**不收集、不上传、不出售**任何个人信息、浏览历史、网址或网页内容。
- 本扩展**没有**分析统计、遥测、广告或自建服务器。SeekMall 无法看到你访问了哪些网站，也无法看到你的设置。

### 只保存在你电脑上的信息

以下内容保存在浏览器为本扩展提供的本机存储中，不会离开你的设备（除非你自己导出、或开启了下文的可选同步）：

- 过滤设置：启用的规则组、各网站的过滤模式、你保存的"以后都隐藏"规则、你导入的订阅地址、高级规则。这些设置可能包含网站域名。
- 临时暂停记录：哪个网站暂停到什么时候。
- 撤销历史：最近 10 次设置修改的前后快照（合计不超过约 2 MB）和一份恢复快照。
- 操作日志：最近 30 次修改操作的类型和结果，用于在浏览器中断后核对结果。
- Cookie 自动拒绝记录：开启该功能后，最多 100 个网站上点击"拒绝"按钮的结果。
- 弹窗速度记录：最近 30 次打开弹窗的各阶段耗时，只有毫秒数，不含网址。
- 界面语言选择。

你可以在"控制中心 → 备份与撤销"清除操作记录，卸载扩展会删除以上全部本机数据。

### 只在你操作时发生的网络请求

- **订阅更新**：内置规则随扩展本身更新。如果你自己导入了订阅，本扩展会向该订阅的提供方下载规则文件；提供方能看到你的 IP 地址，这与访问任何网站相同。
- **可选的浏览器同步**（默认关闭）：只有你开启并点击"上传"时，设置才会写入你的浏览器账号（Google 或 Microsoft）的同步存储，受该浏览器提供方隐私政策约束。同步内容不含操作历史、Cookie 记录或浏览历史，但设置本身可能包含域名。
- **反馈**：生成的反馈报告只包含你填写的网站域名、扩展版本和保护状态，不含网址路径、账号或浏览记录。报告由你复制发送，或由你确认后打开 GitHub 提交页面；我们不会自动发送。

### 权限用途

- **读取和更改所有网站上的数据**（`<all_urls>`）、`scripting`、`userScripts`：在网页上隐藏广告位、运行过滤规则需要的页面脚本。过滤在本机完成，不读取或上传网页内容。
- `declarativeNetRequest`：让浏览器按规则拦截广告和跟踪请求。
- `declarativeNetRequestFeedback`（可选，用到时才申请）：在弹窗中显示本页最近触发的规则。
- `storage`、`unlimitedStorage`：在本机保存上述设置和规则。
- `alarms`：临时暂停到时自动恢复、定期检查订阅。
- `offscreen`：在后台编译你导入的订阅规则。
- `activeTab`：读取当前标签页的网址以显示本站状态。

### 儿童

本扩展不面向儿童收集任何信息。

### 变更

本政策变更时会更新上方的生效日期，并在更新说明中注明。

### 联系

问题或请求请联系：**{{SUPPORT_CONTACT}}**。

本扩展是 uBlock Origin Lite 的独立修改版，不是 uBlock Origin 官方产品。原作者 Raymond Hill 及贡献者的版权与 GPL-3.0 许可保留不变；源代码：{{SOURCE_URL}}。

---

## English

SM Clean View ("the extension") is an ad and tracker filtering extension based on uBlock Origin Lite, maintained by SeekMall. All filtering happens inside your browser.

### What we do not collect

- The extension **does not collect, upload or sell** any personal information, browsing history, URLs or page content.
- There are **no** analytics, telemetry, ads or SeekMall servers. SeekMall cannot see which sites you visit or what your settings are.

### What stays on your computer

The following is kept in the local storage the browser gives the extension, and never leaves your device unless you export it yourself or turn on the optional sync below:

- Filtering settings: enabled rule groups, the filtering mode of each site, elements you chose to "Always hide", subscription addresses you imported, advanced rules. These may contain domain names.
- Temporary pauses: which site is paused and until when.
- Undo history: before/after snapshots of the last 10 setting changes (about 2 MB at most) and one recovery snapshot.
- Operation log: type and result of the last 30 changes, used to check the outcome after the browser interrupts the extension.
- Cookie auto-reject records: when that feature is on, the result of clicking "Reject" on up to 100 sites.
- Popup speed records: stage timings of the last 30 popup opens, in milliseconds only, with no URLs.
- Your interface language choice.

You can clear the operation records under Control center → Backup and undo. Uninstalling the extension deletes all of the above.

### Network requests that happen only because you asked

- **Subscription updates**: built-in rules update with the extension itself. If you imported a subscription, the extension downloads its rule files from that provider, who can see your IP address as with any website.
- **Optional browser sync** (off by default): only when you turn it on and click "Upload" are settings written to your browser account's sync storage (Google or Microsoft), under that provider's privacy policy. Sync never includes the change history, cookie records or browsing history, but settings may contain domain names.
- **Feedback**: a report only contains the site domain you entered, the extension version and the protection state, never URL paths, accounts or browsing history. You copy and send it yourself, or confirm opening the GitHub form; nothing is sent automatically.

### Why each permission is needed

- **Read and change data on all sites** (`<all_urls>`), `scripting`, `userScripts`: hide ad slots and run the page scripts that filter rules need. Filtering is local; page content is not read out or uploaded.
- `declarativeNetRequest`: lets the browser block ad and tracking requests by rule.
- `declarativeNetRequestFeedback` (optional, requested only when used): shows the rules recently triggered on the current page in the popup.
- `storage`, `unlimitedStorage`: keep the settings and rules above on your computer.
- `alarms`: end temporary pauses on time and check subscriptions periodically.
- `offscreen`: compile imported subscriptions in the background.
- `activeTab`: read the current tab's address to show that site's status.

### Children

The extension does not collect information from anyone, including children.

### Changes

When this policy changes, the effective date above is updated and the change is noted in the release notes.

### Contact

Questions or requests: **{{SUPPORT_CONTACT}}**.

The extension is an independent modified version of uBlock Origin Lite and is not an official uBlock Origin product. The copyright of the original author Raymond Hill and contributors and the GPL-3.0 license are retained; source code: {{SOURCE_URL}}.
