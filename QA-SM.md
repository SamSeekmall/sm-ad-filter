# SM 净览 0.1.0 验证记录

日期：2026-10-19，Asia/Shanghai。

## 已通过

- Node.js v24.19.0 下 3 项自动测试：保留已有订阅并加入中文规则、规则未生效时显示失败、引擎异常后允许重试。
- 安装包检查：105 个 manifest 引用资源存在；272 个 JSON 可解析；56 个规则集包含 70,331 条规则，同组 ID 唯一。此数字是随包总规则数，并非默认启用数。
- 独立 Chrome for Testing / Chromium 156.0.8078.4：扩展实际加载、中文引导页渲染、中文规则写入及读回、保留已有列表、面板指南入口。
- 本地 HTTP 夹具：请求 doubleclick.net 经测试浏览器映射到本地服务器。过滤开启时请求由扩展替换为空资源且未抵达服务器；将 localhost 设为不过滤后服务器收到请求；恢复优化过滤后再次未抵达服务器。测试未访问真实广告服务。
- 新页面无 JavaScript pageerror；引导页截图已目视检查。

## 未验证

- 用户日常 Chrome / Edge 配置中的安装和使用。
- 真实新闻、视频、电商等网站的过滤效果、兼容性与反拦截行为。
- 扩展商店审核、自动程序升级、长期订阅更新、全量上游功能回归。
- 当前只有本地 Git 提交，未推送自有 GitHub 仓库，未商店发布。

## 重跑

运行 README-SM.md 的构建、逻辑测试及静态检查命令。
浏览器测试另需：`npm install --prefix build/qa --no-audit --no-fund playwright`；将 PLAYWRIGHT_BROWSERS_PATH 环境变量设置为仓库绝对路径下的 build/qa/browsers，运行 `node build/qa/node_modules/playwright/cli.js install chromium`，然后 `node sm/browser-test.mjs`。
浏览器测试只使用 build/qa 下新建的独立配置；需要允许浏览器访问本地 HTTP 服务器。

## 回退

本次为新扩展的首个本地试用版本，无上一线上版本。可在扩展管理页面停用或移除 SM 净览；未修改系统代理、DNS 或用户现有浏览器配置。日后更新前应导出扩展设置，并保留旧包与 SHA-256。
