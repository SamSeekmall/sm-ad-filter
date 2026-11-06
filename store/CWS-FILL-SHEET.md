# Chrome 应用商店填写表(SM 净览 0.4.9)

按开发者后台左侧栏目顺序填写。名称和简短说明来自扩展包本身(manifest),后台里不能改:
英文 "SM Clean View",中文 "SM 净览"。

素材目录:`C:\Users\Sam\OneDrive\Desktop\Local Workspace\work\sm-ad-filter\store\assets\`

---

## 1. 商品详情(Store listing)

### 默认语言:English

**说明(Description)**:复制 `listing-en.md` 中 "## Detailed description" 下面的全部正文
(从 "SM Clean View blocks ads and trackers…" 到 "Source code: https://github.com/SamSeekmall/sm-ad-filter")。

**类别(Category)**:Privacy & Security / 隐私和安全(没有就选 Tools / 工具)

**语言(Language)**:English

**图片**
| 栏位 | 文件 |
| --- | --- |
| 商店图标 128×128 | `icon-128.png` |
| 截图 1280×800(依次上传 5 张) | `screenshot-1-en.png` … `screenshot-5-en.png` |
| 小宣传图块 440×280 | `promo-small-440x280-en.png` |
| 顶部宣传图块 1400×560(可选) | `promo-marquee-1400x560-en.png` |
| 宣传视频 | 留空 |

**其他字段**
| 栏位 | 填写 |
| --- | --- |
| 官方网址(Official URL) | 无(选 None) |
| 首页网址(Homepage URL) | https://samseekmall.github.io/sm-ad-filter/ |
| 支持网址(Support URL) | https://github.com/SamSeekmall/sm-ad-filter/issues |
| 成熟内容(Mature content) | 否 |

### 添加语言:中文(中国)/ Chinese (China)

**说明**:复制 `listing-zh_CN.md` 中 "## 详细说明" 下面的全部正文。
**截图**:`screenshot-1-zh.png` … `screenshot-5-zh.png`
**小宣传图块**:`promo-small-440x280-zh.png`;**顶部宣传图块**:`promo-marquee-1400x560-zh.png`

---

## 2. 隐私权规范(Privacy practices)

**单一用途说明(Single purpose)**
```
Block ads and trackers on web pages, with per-site controls to pause or adjust that filtering.
```

**权限理由(Permission justification)**:每个权限一个输入框,逐个复制:

activeTab
```
Reads the address of the current tab when the user opens the toolbar popup, so the popup can show and change the filtering state of that site.
```
alarms
```
Ends a temporary per-site pause at the time the user chose (10 minutes or 1 hour), and schedules periodic checks of filter lists the user imported.
```
declarativeNetRequest
```
The core of the extension: the browser blocks ad, tracker and malware requests using the bundled filter rules. Per-site filtering modes and pauses are also applied as declarative rules.
```
offscreen
```
Compiles filter lists that the user chose to import into declarative rules in an offscreen document, outside the service worker's time limits.
```
scripting
```
Injects the bundled cosmetic-filtering scripts that hide ad slots on pages, and runs the element picker when the user asks to hide an element.
```
storage
```
Keeps the user's settings on the device: enabled rule groups, per-site modes, hidden elements, temporary pauses and the local undo history.
```
unlimitedStorage
```
Compiled filter lists and up to 10 undo snapshots can exceed the default local storage quota.
```
userScripts
```
Runs the scriptlets that some filter rules need (for example to neutralise an anti-adblock script) in the page's main world. All scriptlet code is bundled in the package; filter lists only choose which bundled scriptlet runs and with which arguments.
```
主机权限(Host permission)
```
An ad blocker has to act on every site the user visits: hide ad slots, run filtering scriptlets and apply per-site settings. Page content is not read out, stored or sent anywhere.
```
declarativeNetRequestFeedback(如果后台也要求填可选权限)
```
Requested only when the user clicks "Show recent rule hits" in the popup, to list the rules that matched on the current page.
```

**是否使用远程代码(Remote code)**:选 **否,我没有使用远程代码**
(如果要求说明:)
```
All JavaScript is in the package. Filter lists, including ones the user imports, are data that the bundled engine compiles into declarative rules; they cannot add new code.
```

**数据使用(Data usage)**:所有数据类型**一个都不勾**。
下面三项声明**全部勾选**:
- 不出售或转让用户数据给第三方
- 不将用户数据用于与单一用途无关的目的
- 不将用户数据用于信用评估或贷款

**隐私权政策网址**
```
https://samseekmall.github.io/sm-ad-filter/privacy.html
```

---

## 3. 分发(Distribution)

| 栏位 | 填写 |
| --- | --- |
| 付款 | 免费 |
| 公开范围 | 公开(Public) |
| 地区 | 所有地区 |

---

## 4. 提交审核

右上角 **"提交以供审核"**。弹窗里可以勾选"审核通过后自动发布"。
因为申请了 `<all_urls>` 和 `userScripts`,通常要人工审核,可能几天到几周。
