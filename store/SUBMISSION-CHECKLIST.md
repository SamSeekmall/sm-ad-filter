# SM 净览 上架清单

素材和文案都在本目录：`assets/`（图标、宣传图、截图）、`listing-en.md`、`listing-zh_CN.md`、`privacy-practices.md`。

## 一、上架前必须由你决定或完成

| 事项 | 说明 | 状态 |
| --- | --- | --- |
| 源代码公开方式 | 仓库 `SamSeekmall/sm-ad-filter` 已公开（2026-10-23）。 | 完成 |
| 隐私政策网址 | https://samseekmall.github.io/sm-ad-filter/privacy.html （GitHub Pages，`gh-pages` 分支，由 `store/site/build-site.mjs` 生成）。 | 完成 |
| 支持联系方式 | 暂用 GitHub Issues：https://github.com/SamSeekmall/sm-ad-filter/issues 。若改用邮箱，改 `sm/release.json` 的 `supportContact` 后重建站点和商店包。另外两家商店的开发者账号本身也需要一个联系邮箱。 | 暂定 |
| 主页网址 | https://samseekmall.github.io/sm-ad-filter/ | 完成 |
| Chrome 开发者账号 | 用你的 Google 账号在 Chrome Web Store 开发者控制台注册，一次性 5 美元，需要你本人付款和验证。 | 待办 |
| Edge 合作伙伴中心账号 | 在 Microsoft Partner Center 注册 Edge 扩展开发者，免费，需要你本人完成。 | 待办 |

以上链接已填入 `sm/release.json`，文案里的占位符已替换。

## 二、生成上传包（我来做）

1. （已完成）`sm/release.json` 已填好。注意：商店包与 0.4.8 安装包不同（作者、链接、内部文档），提交商店前要把它当作新版本（0.4.9）走一遍完整门禁。
2. 干净 LF 克隆中运行 `node sm/build.mjs --store`，生成 `build/sm-ad-filter-store`（不含内部测试与发布笔记，只带隐私政策）。
3. 对商店包跑同样的门禁：浏览器测试（Chromium、Edge）、原生弹窗、英文界面检查、`verify`。
4. 把 `build/sm-ad-filter-store` 的内容打成 zip（`manifest.json` 在 zip 根目录）。
5. 用 `node sm/store-assets.mjs` 按最终版本重新生成截图。

## 三、Chrome Web Store 提交

1. 开发者控制台 → 新增项目 → 上传 zip。
2. **商品详情**：名称、简短说明、详细说明用 `listing-en.md`；再添加"中文（中国）"语言，填 `listing-zh_CN.md`。
3. **图片**：
   - 商店图标：`assets/icon-128.png`
   - 截图（1280×800，最多 5 张）：英文用 `screenshot-1-en.png` … `screenshot-5-en.png`；中文语言下用 `-zh` 版本
   - 小宣传图（440×280）：`promo-small-440x280-en.png` / `-zh.png`
   - 横幅宣传图（1400×560，可选）：`promo-marquee-1400x560-en.png` / `-zh.png`
4. **类别**：隐私和安全（没有就选"工具"）；语言：英语，另加中文。
5. **隐私权规范**：逐项照抄 `privacy-practices.md`（单一用途、每个权限的理由、远程代码选"否"、数据使用全部不勾、三项声明全部勾选、隐私政策网址）。
6. **分发**：公开；地区按需要。提交审核。

说明：申请了 `<all_urls>`、`userScripts` 这类广泛权限的扩展通常要人工审核，时间可能从几天到几周。

## 四、Microsoft Edge 加载项提交

1. Partner Center → Edge → 新建扩展 → 上传同一个 zip。
2. **属性**：类别"效率"；隐私政策网址；网站；支持联系方式。
3. **商店列表**：英语和中文（简体）各一份；徽标用 `assets/logo-300.png`；截图同上（1280×800）；小宣传图 440×280、大宣传图 1400×560 可选。
4. **提交说明（给审核员）**：可写"Based on uBlock Origin Lite (GPL-3.0); no remote code; permissions as described in the listing; source: https://github.com/SamSeekmall/sm-ad-filter"。

## 五、Firefox 附加组件（以后再做）

Firefox 构建（`--firefox`）还没有在任何 Firefox 里加载过。AMO 要求对打包过的代码提交源码和构建说明（我们的后台脚本经 esbuild 打包）。等真机验证后再准备。

## 六、上架后

- 商店版的扩展 ID 会和你现在本地加载的不同；设置可以在控制中心导出、再在商店版导入。
- 以后每次发布：升版本号 → `package.ps1` 门禁 → `--store` 构建 → 上传新 zip。商店会自动更新已安装的用户。
