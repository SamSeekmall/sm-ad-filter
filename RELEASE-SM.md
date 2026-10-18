# SM 净览发布与回退

0.2.0 的浏览器升级版本使用 2026.1019.2，高于首版 2026.1012.1545。产品显示版本与上游引擎迁移版本分离；仅 SM 修订不触发不适用的上游迁移。后续每次发布都必须增加 extensionVersion，升级上游时单独审查 engineVersion 和上游补丁锚点。

本地构建：Node.js 24，node sm/build.mjs。构建会验证上游版本和补丁锚点。测试：node --test sm/welcome.test.mjs sm/worker.test.mjs；node sm/verify.mjs。

浏览器测试：npm install --prefix build/qa --no-audit --no-fund playwright@1.64.1；设置 PLAYWRIGHT_BROWSERS_PATH 到仓库 build/qa/browsers，安装 Chromium，运行 node sm/browser-test.mjs。测试使用隔离配置与本地 HTTP 服务器。GitHub CI 仅验证并保留产物，不发布商店。

打包：提交源码和验收记录后，运行 sm/package.ps1 -OutputDirectory 一个不存在的新目录；产生安装包、对应源码、SHA-256 及固定提交回执。检查包根目录 manifest.json；不要将 build/qa 的浏览器配置或任何凭据放入包。

GitHub owner/repo 尚待 sunny 确认；当前 origin 是只读来源上游，不得向上游直接推送 SM 代码。当前没有 SM 商店条目、签名密钥或发布授权凭据，因此商店上架与自动升级验收未完成。

升级：先导出配置。保持本地已加载扩展目录不变，将备份到另一目录的旧文件保留后，用新包替换扩展目录内容，并在扩展管理页重新加载。切换目录可能导致扩展 ID 改变；Chrome 与 Edge 之间使用配置文件迁移。初次从 0.1.0 升级可保留原目录和原扩展存储；旧版完整设置的备份仍可在新版完整设置中恢复。控制中心使用单独校验的 v2 格式。

回退：保留 0.1.0 安装包和对应 SHA-256。先导出当前配置，再停用新版并恢复旧目录文件后重新加载。旧版本不认识 v2 控制中心备份，回退前同时从完整设置导出上游格式备份。没有数据库或服务器变更。不宣称浏览器商店支持自动降级。

商店准备材料：README-SM.md、PRIVACY-SM.md、LICENSE.txt、对应源码、产品截图、权限用途说明、版本变更说明。上架前需实际 Chrome/Edge 稳定版验收与维护方联系方式；商店审核、接受条款及任何付款由授权流程处理。
