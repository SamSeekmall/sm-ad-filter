# 0.4.2 代码审查与性能优化

范围：弹窗到后台的请求链路、后台模块加载、超时与重试，以及原生弹窗计时测试。不是完整上游安全审计。

## 审查发现与修复

- P1：popup.js 在有界消息请求前先等待无超时的 tabs.query，worker 又做 tabs.get。改为立即发送有超时的单个请求，由后台只查询一次活动标签页。保护状态仍等待真实引擎结果，不用缓存伪装已保护。
- P2：后台启动加载 25 个模块。构建时用固定 esbuild 0.25.12 合为一个本地 ESM 文件（约 157 KB），保留许可证和原文件供源码核查。未改变权限或过滤规则。
- P2：弹窗图标仍单独读文件；改为构建时嵌入 data URI，减少首屏资源请求。
- P2：重试成功后旧错误提示仍残留；成功读取后清除。
- P1（验证）：旧基准在关闭弹窗前移除了 CDP 接收器，导致等待超时；使用 worker 调用打开也混入 worker 启动延迟。现由扩展页发起原生打开、逐次保存结果，并增加明确停止 worker 后的唤醒样本。

## 验证

16 项逻辑测试通过，包括仅一次活动标签页查询和受保护页面处理。最终浏览器、回归、唤醒和连续打开数据以交付目录 JSON 为准。三次样本的中位数不是 p95，也不能代表所有电脑；首次安装、预热和 worker 唤醒分开记录。

## 构建

先运行 npm ci --prefix sm/build-tools，再运行 node sm/build.mjs。包内 sm/BUNDLE.json 记录模块数量与构建产物。所有运行代码均在本地包内。

参考：[Chrome 扩展后台模块约束](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics)、[esbuild 构建 API](https://esbuild.github.io/api/#bundle)、[CDP ServiceWorker](https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker/)。
