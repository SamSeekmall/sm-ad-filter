# SM 净览 手机端计划（草案，2026-10-20）

## 结论：先做 Android Firefox 扩展

- Chrome / Edge 的 Android 版不支持扩展，所以手机端不能沿用现有 Chromium 包。
- Firefox for Android 支持 WebExtension 和 MV3 的 declarativeNetRequest，可复用上游引擎和 SM 的大部分界面逻辑。
- iOS Safari 需要 Mac、Xcode 和 Apple 开发者账号，且只能用内容拦截器规则，列为第二阶段。
- 系统级 VPN/DNS 过滤要做原生 App，范围太大，暂不做。

## 已确认的事实

- 仓库 `firefox/` 目录是旧上游构建（2024.9.22），而 `chromium/` 是 2026.1012.1545，两者差约两年；`firefox/manifest.json` 已声明 `gecko_android`，最低 Firefox 114。
- 上游子模块 `uBlock`、`publish-extension` 目前未初始化，需要先拉取才能重新生成 Firefox 规则。
- Firefox 版没有 `offscreen` 和 `userScripts` 权限，后台是 `background.scripts`（事件页）而不是 service worker。SM 现有的后台补丁（`build.mjs` 对 `js/background.js` 的补丁）按 Chromium 写，需要逐条核对在 Firefox 上能否匹配。
- Firefox 不能像 Chrome 那样“加载已解压的扩展”常驻使用，试用需要 `web-ext` 在手机上临时加载，或使用自行签名的 xpi（需要 AMO 账号）。

## 阶段 1 已确认的做法（2026-10-20 更新）

上文“`firefox/` 是旧构建”只说对了一半：仓库里的 `firefox/` 确实是 2024 年旧版，但上游在固定提交 610c2431d 已经有现行的 Firefox 平台文件（最低 Firefox 128，声明了 Android 支持）。因此不重新生成规则，而是在固定的 `chromium/` 文件上叠加三项上游官方差异，见 `sm/firefox/overlay.mjs`：事件页清单、用 iframe 模拟的离屏文档、删除 Firefox 不支持的规则（共 34 条，来自 `topDomains`、`responseHeaders`、`requestHeaders` 条件）。

- 构建：`node sm/build.mjs --firefox`，输出 `build/sm-ad-filter-firefox`；不带参数的 Chromium 构建输出与改动前逐文件一致。
- 扩展 ID 使用 `sm-ad-filter@seekmall.ph`，不沿用上游的 ID。
- 该目录需在 LF 换行的检出中构建（见 README-SM.md 的构建说明与本机 `core.autocrlf` 问题）。

## iOS Safari（2026-10-20 更新）

`node sm/build.mjs --safari` 生成 `build/sm-ad-filter-safari`（Safari 最低 18.6），做法同 Firefox：固定的 `chromium/` 规则 + 上游 610c2431d 的 Safari 官方差异，见 `sm/safari/overlay.mjs`。包括 Safari 清单、`ext-compat.js` 等四个平台文件、排除 5 个 Safari 不提供的规则集（pgl、ublock-badware、urlhaus-full、adguard-spyware-url、pol-3）、上游规则补丁（并重新编号规则，已核对无重复）、上商店合规脚本。Chromium 输出与改动前逐文件一致。

**规则数量会明显增加**：Safari 补丁把 `requestDomains` 拆成逐域名规则。默认启用的三组（ublock-filters、easylist、easyprivacy）合计从约 18,500 条变为约 116,000 条；再加中文推荐规则 chn-0 约 12,700 条，约 128,800 条。需要在真机上确认没有超出 Safari 的规则上限，再决定是否限制手机端可同时启用的规则集。

**这台 Windows 机器做不到、也没有验证的部分**

- 没有在任何 Safari 里加载过，也没有跑过 SM 自己的弹窗和后台逻辑；SM 用到的部分接口（如 `permissions`、`alarms`、`storage.session`、`action.openPopup`）在 iOS Safari 上是否可用未知。
- 打包成 App 需要 Mac、Xcode 和 Apple 开发者账号。`dist/safari/xcode` 仍是上游作者的工程：Team ID 和 Bundle ID（`net.raymondhill.uBlock-Origin-Lite`）必须换成自己的，且工程里按文件名逐个引用 `uBOLite.safari` 里的文件，不包含 SM 新增的 `sm/`、`welcome.html` 等，需要在 Xcode 里改为引用整个 `sm-ad-filter-safari` 目录。我没有改动这个工程，因为无法在这里验证它能编译。
- 上架 App Store 需要隐私说明、截图和审核，试用可走 TestFlight。

## 阶段划分

1. **构建**：同步到与 Chromium 相同的上游提交，生成 Firefox 规则，新增 `sm/build-firefox.mjs`，并让补丁清单对 Firefox 单独校验。
2. **界面**：弹窗和控制中心改为触屏尺寸（点击区域不小于 44px，窄屏单列），按 Android Firefox 的弹窗大小测试。
3. **功能**：中文推荐规则、按站点开关和暂停（用 `alarms`，核对 Firefox 事件页被回收后的恢复）、订阅更新。元素选取、备份恢复、Cookie 拒绝放第二批。
4. **验证**：桌面 Firefox 自动化测试 + Android 模拟器 + 一台真机；不声明性能达标，除非在真机测过。

## 待用户决定

- 是否有 Android 真机可用于试装？
- 是否需要通过 AMO 发布（需要账号和审核），还是仅自用 xpi？
- iOS 是否要排期，以及是否已有 Apple 开发者账号和 Mac？
