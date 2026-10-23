// SM Clean View interface language. GPL-3.0-or-later.
// The interface is written in Chinese. Under an English interface this file translates what the pages show: the
// static markup once, then every later change to the page (MutationObserver runs before the next paint).
// Language: manual choice (localStorage 'sm.lang': zh | en) first, otherwise the browser's UI language
// (Chinese -> Chinese, anything else -> English). A Chinese interface exits at the top of this file.
(function () {
    'use strict';
    var KEY = 'sm.lang';
    var CJK = /[　-〿一-鿿＀-￯]/;
    var override = null;
    try { override = localStorage.getItem(KEY); } catch (e) { /* Storage blocked: follow the browser. */ }
    var ui = 'en';
    try { ui = chrome.i18n.getUILanguage() || ui; } catch (e) { ui = navigator.language || ui; }
    var lang = override === 'zh' || override === 'en' ? override : (/^zh/i.test(ui) ? 'zh' : 'en');
    var api = {
        lang: lang,
        choice: override === 'zh' || override === 'en' ? override : 'auto',
        setChoice: function (value) { try { if (value === 'zh' || value === 'en') localStorage.setItem(KEY, value); else localStorage.removeItem(KEY); } catch (e) { /* ignore */ } },
        tr: function (text) { return text; },
    };
    window.smI18n = api;
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    if (lang === 'zh') return;

    // ---- exact phrases -------------------------------------------------------------------------------------------
    var EN = {
        // brand, navigation, modes
        'SM 净览': 'SM Clean View', '当前网站': 'Current site', '规则': 'Rules', '备份与撤销': 'Backup and undo', '反馈': 'Feedback', '诊断与关于': 'Diagnostics and about',
        '完整设置 ↗': 'Full settings ↗', '控制中心': 'Control center', '控制中心导航': 'Control center navigation', '反馈问题': 'Send feedback',
        '不过滤': 'Off', '轻度': 'Light', '标准': 'Standard', '强力': 'Strong', '轻度过滤': 'Light filtering', '标准过滤': 'Standard filtering', '强力过滤': 'Strong filtering',
        '10 分钟': '10 minutes', '1 小时': '1 hour', '到关闭浏览器': 'Until the browser closes', '暂停时长': 'Pause duration',
        // popup
        '正在读取保护状态…': 'Reading protection status…', '正在读取…': 'Reading…', '暂停此站点': 'Pause this site', '开启此站点': 'Turn on for this site', '恢复保护': 'Resume protection', '此页面不可用': 'Not available on this page',
        '这次先隐藏': 'Hide once', '刷新后恢复': 'Back after refresh', '以后都隐藏': 'Always hide', '可撤销': 'Can be undone', '管理本站已隐藏的元素': 'Manage hidden elements on this site', '查看或删除已保存的规则': 'View or delete saved rules',
        '查看近期规则命中': 'Show recent rule hits', '此站点过滤模式': 'Filtering mode for this site',
        '本站不过滤。': 'Filtering is off for this site.', '轻度只拦截网络请求。': 'Light only blocks network requests.', '标准同时隐藏广告位（推荐）。': 'Standard also hides ad slots (recommended).', '强力隐藏范围更广，偶尔影响网页。': 'Strong hides more and may occasionally affect a page.',
        '关闭浏览器后自动恢复': 'Resumes when the browser closes', '关闭浏览器后恢复': 'Resumes when the browser closes',
        '此页面无法过滤': 'This page can’t be filtered', '已暂停过滤': 'Filtering paused', '已开启保护': 'Protection is on', '此站点未过滤': 'This site isn’t filtered', '请在普通网站打开': 'Open it on a regular website', '浏览器内部页面和扩展商店无法过滤': 'Browser pages and extension stores can’t be filtered.',
        '暂停中，恢复后回到原模式。': 'Paused. Returns to its original mode when resumed.', '网站访问权限不足，请到扩展详情中调整。': 'Site access is not enough. Adjust it in the extension details.',
        '正在唤醒过滤引擎…': 'Waking the filter engine…', '保护状态暂未确认': 'Protection status not confirmed yet', '重新读取': 'Read again', '过滤引擎正在启动…': 'The filter engine is starting…',
        '已完成，网站已刷新。': 'Done. The site was refreshed.', '正在应用，请稍候…': 'Applying, one moment…', '响应较慢，正在核对结果…': 'Slow response, checking the result…',
        '过滤已暂停，网页已刷新。去网页上看一眼（弹窗会关闭，看完再点 SM 图标回来）：现在正常了吗？': 'Filtering is paused and the page was refreshed. Take a look at the page (this popup will close; click the SM icon to come back). Does it work now?',
        '正常了': 'It works', '还是不正常': 'Still broken', '问题与过滤有关，本站已经是最低一档。请告诉我们是哪个网站，我们来修规则。': 'The problem is related to filtering and this site is already at the lowest level. Tell us which site it is so we can fix the rules.',
        '反馈这个网站': 'Report this site', '结束': 'Done', '暂停后仍不正常，多半与过滤无关（网站本身、网络或其他扩展）。建议恢复保护。': 'It is still broken while paused, so it is probably not caused by filtering (the site itself, the network or another extension). Resuming protection is recommended.',
        '已恢复保护，网站已刷新。': 'Protection resumed and the site was refreshed.', '仍要反馈': 'Report anyway', '正常，完成': 'It works, done', '排查完成。': 'Troubleshooting finished.', '仍异常：暂停并反馈': 'Still broken: pause and report',
        '已暂停 10 分钟。': 'Paused for 10 minutes.', '已暂停，网站已刷新。': 'Paused and the site was refreshed.', '未授予诊断权限': 'Diagnostics permission was not granted',
        '阻止': 'Block', '替换': 'Replace', '放行': 'Allow', '站点放行': 'Site allow', '请求头调整': 'Header change', 'HTTPS 升级': 'HTTPS upgrade', '未知': 'Unknown',
        // errors from the popup and worker
        '引擎响应较慢，请稍后重试': 'The engine is slow to respond. Try again in a moment.', '操作未完成': 'The operation was not completed', '操作结果未知：后台可能仍在处理。请重新读取确认，勿重复点击。': 'Result unknown: the background may still be working. Read again to confirm and don’t click twice.',
        '过滤引擎尚未就绪': 'The filter engine isn’t ready yet', '过滤引擎未就绪，请稍后重试': 'The filter engine isn’t ready. Try again shortly.', '操作响应超时': 'The operation timed out',
        '操作结果未知：后台可能仍在处理。请先点击“刷新状态”确认，勿重复提交': 'Result unknown: the background may still be working. Click “Refresh status” to confirm and don’t submit twice.',
        // control center: current site and rules
        '开始使用': 'Get started', '打开扩展详情页': 'Open extension details', '完成设置': 'Finish setup', '开启中文网站规则': 'Turn on Chinese-site rules', '开启推荐规则': 'Turn on recommended rules',
        '查看或调整某个网站': 'View or adjust a site', '网站': 'Site', '查看': 'View', '输入网站，例如 example.com': 'Enter a site, for example example.com', '过滤模式（点一下即生效，并刷新该网站）': 'Filtering mode (one tap applies it and refreshes the site)',
        '临时暂停': 'Temporary pause', '暂停 10 分钟': 'Pause 10 minutes', '暂停 1 小时': 'Pause 1 hour', '暂停到关闭浏览器': 'Pause until the browser closes', '输入网站后，可调整过滤或临时暂停。': 'Enter a site to adjust filtering or pause it for a while.',
        '三种模式有什么区别？': 'What’s the difference between the modes?',
        '轻度：只拦截广告和跟踪的网络请求。标准（推荐）：同时隐藏网页上的广告位。强力：隐藏范围更广，偶尔会影响网页功能。暂停到时会自动恢复；“到关闭浏览器”在下次启动时恢复。': 'Light: only blocks ad and tracking network requests. Standard (recommended): also hides ad slots on the page. Strong: hides more and may occasionally affect page features. A pause ends automatically; “Until the browser closes” ends at the next start.',
        '刷新状态': 'Refresh status', '网页显示异常？分步排查': 'Page looks wrong? Step-by-step troubleshooting', '更快的方法：在出问题的网页上点工具栏的 SM 图标，暂停后弹窗会直接带你排查。': 'A faster way: on the page with the problem, click the SM icon in the toolbar. After pausing, the popup walks you through it.',
        '常用规则': 'Common rules', '中文网站规则': 'Chinese-site rules', '覆盖国内常见广告': 'Covers common ads on mainland-China sites', '减少骚扰': 'Reduce annoyances', '额外过滤浮层、通知请求和社交挂件': 'Also filters overlays, notification prompts and social widgets',
        '自动拒绝 Cookie 提示': 'Auto-reject cookie prompts', '支持 OneTrust、Cookiebot 标准提示，只点“拒绝全部”，不会点同意。开启后刷新网页。': 'Works with the standard OneTrust and Cookiebot prompts. It only clicks “Reject all”, never accept. Refresh the page after turning it on.',
        '订阅与更新': 'Subscriptions and updates', '内置规则随安装包更新；你自己导入的订阅会按到期时间检查。': 'Built-in rules update with the extension; subscriptions you imported are checked when they expire.', '立即更新导入的订阅': 'Update imported subscriptions now', '取消下载': 'Cancel download', '检查程序更新': 'Check for extension updates', '查看发布与回退包 ↗': 'View releases and rollback packages ↗',
        '已隐藏的元素': 'Hidden elements', '用工具栏弹窗里的“以后都隐藏”添加。删除后刷新网页即可看到；误删可在“备份与撤销”里撤销。': 'Add them with “Always hide” in the toolbar popup. After deleting, refresh the page to see it; a mistaken delete can be undone under “Backup and undo”.',
        '刷新列表': 'Refresh list', '上一页': 'Previous', '下一页': 'Next', '按网站筛选，例如 example.com': 'Filter by site, for example example.com', '按网站筛选': 'Filter by site',
        '知道了': 'Got it', '支持与合作': 'Support and partnership', 'SM 净览免费且不收集任何信息。企业和机构可以通过 Chrome、Edge 的企业策略统一部署；需要部署协助、定制规则或优先支持，请联系我们。': 'SM Clean View is free and collects nothing. Organisations can deploy it centrally through Chrome and Edge enterprise policy; contact us for rollout help, custom rules or priority support.', '联系企业服务': 'Contact us about organisations', '赞助这个项目': 'Sponsor this project', '源码': 'Source', '备份与恢复': 'Backup and restore', 'SM 控制中心 → 备份与撤销': 'SM control center → Backup and undo', '：导入前可预览，失败会自动回退。': ': imports can be previewed first, and a failed import rolls back automatically.', '备份、导入、撤销和同步统一在': 'Backup, import, undo and sync all live in', '操作完成。': 'Done.', '正在处理…': 'Working…', '删除': 'Delete', '没有已隐藏的元素。': 'No hidden elements.', '还没有导入的订阅。需要时可在“完整设置 → 过滤规则列表”里添加。': 'No imported subscriptions yet. Add one under “Full settings → Filter lists” when you need it.', '尚无成功记录': 'No successful update yet',
        // backup and undo
        '最近修改': 'Recent changes', '撤销最近一次修改': 'Undo the last change', '清除本机操作记录': 'Clear this device’s change history', '保留最近 10 次设置修改，只保存在本机。临时暂停请在“当前网站”里恢复。': 'Keeps the last 10 setting changes, stored only on this device. Resume a temporary pause under “Current site”.',
        '导出与导入': 'Export and import', '配置包含站点设置、订阅地址和已隐藏的元素。Chrome 与 Edge 之间请用文件迁移。': 'A backup contains site settings, subscription addresses and hidden elements. Move settings between Chrome and Edge with a file.',
        '导出配置文件': 'Export settings file', '选择要导入的文件…': 'Choose a file to import…', '下载最近恢复快照': 'Download the latest recovery snapshot', '我已核对预览，替换当前配置': 'I checked the preview; replace the current settings', '应用已预览的配置': 'Apply the previewed settings',
        '导入前会保留恢复快照，失败自动回退。': 'A recovery snapshot is kept before importing; a failed import rolls back automatically.', '浏览器同步（可选）': 'Browser sync (optional)', '把配置保存到当前浏览器账号': 'Save settings to the current browser account', '只同步配置，不自动覆盖；Chrome 与 Edge 不互通。': 'Syncs settings only and never overwrites automatically. Chrome and Edge don’t share it.',
        '了解更多': 'Learn more', '不同步操作历史、Cookie 记录或浏览历史，但配置本身可能包含域名。需要同一浏览器账号和扩展 ID，并开启浏览器同步。单份配置上限 7 KB，超出请用文件迁移。写入成功不代表另一台设备已收到。': 'Change history, cookie records and browsing history aren’t synced, but the settings themselves may contain domain names. It needs the same browser account and extension ID with browser sync turned on. One configuration is limited to 7 KB; use a file beyond that. A successful write doesn’t mean another device received it.',
        '读取云端并预览': 'Read the cloud copy and preview', '上传当前配置': 'Upload current settings', '删除云端配置': 'Delete the cloud copy', '先读取云端，再决定是否上传。': 'Read the cloud copy first, then decide whether to upload.',
        // feedback
        '反馈漏拦或网页异常': 'Report a missed ad or a broken page', '报告只包含域名、版本和保护状态，不含网址路径、账号或浏览记录。请检查你填写的描述。': 'The report only contains the domain, version and protection state, not URL paths, accounts or browsing history. Please check the description you write.',
        '问题类型': 'Issue type', '广告漏拦': 'Ad not blocked', '网页功能异常': 'Page feature broken', '设置或更新问题': 'Settings or update problem', '其他建议': 'Other suggestion', '发生了什么': 'What happened',
        '例如：打开页面后无法播放；暂停此站点过滤后恢复正常': 'For example: the video won’t play; it works again after pausing this site', '生成报告预览': 'Preview report', '复制报告': 'Copy report', '下载报告': 'Download report', '在 GitHub 提交': 'File on GitHub', '反馈报告预览': 'Feedback report preview',
        // diagnostics and about
        '权限与诊断': 'Permissions and diagnostics', '复制诊断信息': 'Copy diagnostics', '诊断信息只含版本、权限与状态，不含网址、规则内容或浏览记录；反馈时可以附上。': 'Diagnostics only contain versions, permissions and state, not URLs, rule contents or browsing history. You can attach them to feedback.',
        '弹窗速度（本机）': 'Popup speed (this device)', '每次打开工具栏弹窗都会在本机记录各阶段耗时（只有数字，不含网址），最多 30 次。“从点击到可见”之外，浏览器创建弹窗窗口前的等待无法从扩展内部测到。': 'Every time the toolbar popup opens, the time of each stage is recorded on this device (numbers only, no URLs), up to 30 times. The wait before the browser creates the popup window can’t be measured from inside the extension.',
        '测量扩展文件读取速度': 'Measure extension file read speed', '清除速度记录': 'Clear speed records', '版本与规则容量': 'Version and rule capacity', '安装与支持范围': 'Installation and supported scope',
        '本地安装：解压安装包，在 chrome://extensions 或 edge://extensions 打开开发者模式并加载目录。正式商店渠道尚未上线。扩展商店和浏览器内部页面无法过滤；视频广告与反拦截效果要按网站验证。不要同时运行多个广告过滤扩展。': 'Local install: unzip the package, turn on developer mode at chrome://extensions or edge://extensions and load the folder. There is no store listing yet. Extension stores and browser pages can’t be filtered; video ads and anti-adblock behavior must be checked per site. Don’t run several ad-filtering extensions at once.',
        '独立修改版，非 uBlock Origin 官方产品。原作者 Raymond Hill 及贡献者。': 'An independent modified version, not an official uBlock Origin product. Original author Raymond Hill and contributors.', '隐私说明': 'Privacy notes', '上游源码': 'Upstream source',
        '规则引擎：已返回配置。此状态不等于所有广告都能过滤。': 'Rule engine: returned its settings. This does not mean every ad is filtered.',
        '网站访问权限：可用': 'Site access: available', '网站访问权限：不足，请在扩展详情中检查网站访问权限': 'Site access: not enough. Check site access in the extension details.',
        '用户脚本权限：可用': 'User scripts permission: available', '用户脚本权限：未开放，导入订阅中的部分元素／脚本规则可能不生效；在扩展详情中开启“允许用户脚本”': 'User scripts permission: not enabled. Some element/script rules in imported subscriptions may not work. Turn on “Allow user scripts” in the extension details.',
        '此站点暂无自动拒绝记录；隐藏弹窗不代表已拒绝同意。': 'No auto-reject record for this site yet. A hidden prompt doesn’t mean consent was refused.',
        '拒绝按钮已点击，提示已消失；未验证服务端同意记录': 'Reject button clicked and the prompt went away; the server-side consent record wasn’t verified', '已点击拒绝按钮，提示仍存在': 'Reject button clicked, but the prompt is still there',
        '还没有可撤销的修改。': 'No changes to undo yet.', '过滤引擎启动中': 'Filter engine starting', '引擎就绪后自动显示网站设置。': 'Site settings appear automatically once the engine is ready.', '保护已开启': 'Protection is on', '保护未完整开启': 'Protection is not fully on',
        // first-use checklist and troubleshooting wizard
        '过滤规则：广告、跟踪和中文网站规则都已开启。': 'Filter rules: ad, tracking and Chinese-site rules are all on.', '过滤规则：广告与跟踪规则未完整开启，点上方“开启推荐规则”。': 'Filter rules: ad and tracking rules aren’t fully on. Click “Turn on recommended rules” above.',
        '过滤规则：广告与跟踪规则已在保护你；中文网站规则未开启，点上方“开启中文网站规则”。': 'Filter rules: ad and tracking rules are protecting you; Chinese-site rules are off. Click “Turn on Chinese-site rules” above.', '网站访问权限：可用。': 'Site access: available.',
        '网站访问权限：不足。在扩展详情页把“网站访问权限”设为“在所有网站上”，否则其他网站不会被过滤。': 'Site access: not enough. On the extension details page set “Site access” to “On all sites”, otherwise other sites won’t be filtered.',
        '固定到工具栏：点浏览器工具栏的拼图图标，再点 SM 净览（绿色 S 图标）旁的图钉。之后在任何网站点它就能一键暂停。': 'Pin to the toolbar: click the puzzle icon in the browser toolbar, then the pin next to SM Clean View (the green S icon). After that you can pause any site with one click.',
        '请先在上方输入出现异常的网站并点击“查看”。': 'First enter the problem site above and click “View”.', '第 1 步：暂停此站点 10 分钟': 'Step 1: pause this site for 10 minutes', '仍然异常': 'Still broken',
        '暂停后仍然异常，多半与过滤无关（网站本身、网络或其他扩展）。建议恢复保护。': 'It is still broken while paused, so it is probably not caused by filtering (the site itself, the network or another extension). Resuming protection is recommended.',
        '排查结束。可随时再次开始。': 'Troubleshooting finished. You can start again at any time.', '重新开始': 'Start again', '诊断信息已复制。': 'Diagnostics copied.',
        '还没有记录。点几次工具栏的 SM 图标后再刷新本页。': 'No records yet. Click the SM icon in the toolbar a few times, then refresh this page.', '从开始加载到显示保护状态': 'From load to the protection state showing', '读取弹窗文件': 'Reading popup files', '等待后台引擎就绪': 'Waiting for the background engine', '与后台往返': 'Round trip to the background',
        '读取明显偏慢：扩展文件夹很可能放在 OneDrive 等同步目录，或文件只保存在云端。建议在资源管理器里对该文件夹选“始终保留在此设备上”，或移到不同步的本地文件夹后重新加载。': 'Reading is clearly slow: the extension folder is probably in a synced folder such as OneDrive, or its files are cloud-only. In File Explorer choose “Always keep on this device” for the folder, or move it to a local folder that isn’t synced and reload.',
        '文件读取正常，慢不在磁盘这一段。': 'File reading is normal, so the slowness is not in the disk.', '正在编译并提交规则…': 'Compiling and committing rules…', '订阅更新尝试结束；请查看每项订阅的成功时间和错误记录。失败时保留上次可用规则。': 'The subscription update attempt is over. Check each subscription’s success time and errors. If it failed, the last working rules are kept.',
        '下载已取消，当前规则保留。': 'Download cancelled; the current rules are kept.', '浏览器限制了本次检查，请稍后再试。': 'The browser limited this check. Try again later.', '浏览器未报告可用更新。本地加载版请前往发布页下载；这不证明发布页没有新版本。': 'The browser reported no update. For a locally loaded copy, download from the releases page; this doesn’t prove there is no newer version there.',
        '再点一次确认清除（设置保留）': 'Click again to confirm clearing (settings are kept)', '请先恢复临时暂停的网站，再导出持久配置': 'Resume temporarily paused sites first, then export the persistent settings', '尚无恢复快照': 'No recovery snapshot yet', '文件超过 500 KB': 'The file is larger than 500 KB',
        '请先预览并确认': 'Preview and confirm first', '导入完成，并已读回验证。': 'Import finished and verified by reading it back.', '同步存储当前没有配置。': 'Sync storage has no settings right now.', '请先读取云端，避免覆盖未知配置': 'Read the cloud copy first so unknown settings aren’t overwritten',
        '再点一次：替换云端配置': 'Click again: replace the cloud copy', '再点一次确认删除（本机保留）': 'Click again to confirm deleting (this device keeps its copy)', '已删除同步存储中的配置。': 'Deleted the settings from sync storage.', '请先生成报告': 'Generate the report first', '尚未配置提交渠道，请复制报告': 'No submission channel is set up. Copy the report instead.', '请先生成并检查报告': 'Generate and check the report first',
        // history labels, notices and worker errors
        '修改自动刷新': 'Changed auto-refresh', '修改拦截计数': 'Changed blocked count', '修改严格拦截': 'Changed strict blocking', '修改弹窗拦截': 'Changed popup blocking', '修改开发者模式': 'Changed developer mode', '添加订阅': 'Added a subscription', '更新高级网络规则': 'Updated advanced network rules',
        '上次操作在确认前被浏览器中断，已核对：新配置已完整生效（本次未记入撤销历史）。': 'The last operation was interrupted by the browser before it was confirmed. Checked: the new settings took full effect (not added to the undo history).', '上次导入／撤销被浏览器中断，已自动恢复到操作前的配置。': 'The last import/undo was interrupted by the browser and the settings were restored automatically to how they were before.',
        '上次导入／撤销被中断，自动恢复未完成。请下载恢复快照检查配置；下次启动会再次尝试。': 'The last import/undo was interrupted and the automatic restore didn’t finish. Download the recovery snapshot and check the settings; it will be tried again at the next start.', '上一项操作被浏览器中断。已核对暂停状态；请确认结果后再决定是否重试，勿重复提交。': 'The previous operation was interrupted by the browser. Pause state was checked; confirm the result before deciding to retry, and don’t submit twice.',
        '订阅更新正在进行': 'A subscription update is in progress', '缺少恢复快照': 'The recovery snapshot is missing', '预览后本机配置已变化，请重新预览': 'The settings on this device changed after the preview. Preview again.', '导入配置': 'Imported settings', '没有可撤销的修改': 'No change to undo', '请先恢复临时暂停的网站': 'Resume temporarily paused sites first',
        '配置已发生其他变化，请导出备份后使用恢复快照': 'The settings changed in another way. Export a backup, then use the recovery snapshot.', '站点或过滤模式无效': 'Invalid site or filtering mode', '调整站点过滤': 'Changed a site’s filtering', '过滤模式未生效，请检查网站权限': 'The filtering mode didn’t take effect. Check site access.', '暂停参数无效': 'Invalid pause parameters',
        '启用推荐规则': 'Turned on recommended rules', '启用中文网站规则': 'Turned on Chinese-site rules', '关闭中文网站规则': 'Turned off Chinese-site rules', '启用减少骚扰': 'Turned on reduce annoyances', '关闭减少骚扰': 'Turned off reduce annoyances', '未知配置': 'Unknown preset', '这组规则不能在这里关闭': 'This rule group can’t be turned off here',
        '部分规则未启用，请检查规则限额': 'Some rules weren’t turned on. Check the rule limit.', '部分规则未能关闭，请刷新后重试': 'Some rules couldn’t be turned off. Refresh and try again.', '规则无效': 'Invalid rule', '删除自定义规则': 'Deleted a custom rule', '高级网络规则无效或过长': 'The advanced network rules are invalid or too long', '编辑高级网络规则': 'Edited advanced network rules', '切换 Cookie 自动拒绝': 'Toggled cookie auto-reject',
        '已进入规则提交阶段，无法取消': 'Already committing rules; it can’t be cancelled', '操作编号无效': 'Invalid operation id', '请先开启可选同步': 'Turn on optional sync first', '请先恢复临时暂停，避免同步临时例外': 'Resume temporary pauses first so temporary exceptions aren’t synced', '云端版本已变化，请重新读取和预览后再上传': 'The cloud copy changed. Read and preview it again before uploading.',
        '配置超过同步空间，请使用文件导出／导入': 'The settings are larger than the sync space. Use file export/import.', '同步读回冲突，请重新读取': 'Sync read-back conflict. Read again.', '请从网站工具栏打开面板查看统计': 'Open the panel from the site’s toolbar button to see the statistics', '未知操作': 'Unknown operation', '操作失败': 'Operation failed', '无权执行此操作': 'Not allowed to do this',
        '完整设置修改': 'Changed full settings', '此站点已处于不过滤模式，无需临时暂停': 'This site is already unfiltered; no need to pause', '高级网络规则语法无效': 'Invalid advanced network rule syntax', '浏览器拒绝了部分高级规则': 'The browser rejected some advanced rules', '设置读回不一致（可能受浏览器权限或策略限制）': 'Settings read back differently (possibly limited by browser permissions or policy)',
        '订阅包含过多文件': 'The subscription has too many files', '下载未完成': 'Download not completed', '订阅下载超过 4 MB': 'The subscription download is over 4 MB',
        '网站地址无效': 'Invalid site address', '仅支持 HTTP / HTTPS 网站': 'Only HTTP / HTTPS sites are supported', '配置超过 500 KB，请拆分自定义规则后重试': 'The settings are over 500 KB. Split the custom rules and try again.', '请选择 SM 净览 v2 格式备份': 'Choose an SM Clean View v2 backup', '规则列表格式错误': 'Wrong rule list format', '导入订阅列表格式错误': 'Wrong imported subscription list format',
        '导入订阅必须是无凭据的 HTTP / HTTPS 地址': 'Imported subscriptions must be HTTP / HTTPS addresses without credentials', '规则列表存在重复项': 'The rule list has duplicates', '站点例外格式错误': 'Wrong site exceptions format', '站点例外包含无效域名': 'Site exceptions contain an invalid domain', '同一站点有冲突的过滤模式': 'The same site has conflicting filtering modes', '备份缺少默认过滤模式': 'The backup has no default filtering mode',
        '自定义规则格式错误': 'Wrong custom rules format', '自定义规则域名错误': 'A custom rule has a wrong domain', '自定义规则域名重复': 'Custom rules repeat a domain', '高级规则格式错误': 'Wrong advanced rules format', '启用的订阅未列入导入列表': 'An enabled subscription isn’t in the imported list', '备份包含不支持的设置': 'The backup contains unsupported settings', '请输入 GitHub 仓库主页地址': 'Enter the GitHub repository home address',
        // report text
        'SM 净览问题反馈': 'SM Clean View issue report', '未提供': 'not provided', '现象（请手动删除账号、令牌和个人信息）：': 'What happened (remove accounts, tokens and personal information yourself):',
        // engine start-up steps
        '读取规则配置': 'Reading rule settings', '启动过滤会话': 'Starting the filter session', '读取管理策略': 'Reading admin policy', '启用过滤规则（首次需编译，可能较慢）': 'Enabling filter rules (first run compiles them, can be slow)', '核对网站权限': 'Checking site access', '注册网页脚本': 'Registering page scripts', '检查网页脚本': 'Checking page scripts',
        '启动失败': 'Start failed', '已就绪': 'Ready', '加载后台脚本': 'Loading the background script',
        // element tools page (injected by the build)
        '← 返回': '← Back', '元素工具': 'Element tools', '元素工具导航': 'Element tools navigation', '打开 SM 净览反馈中心': 'Open the SM Clean View feedback center', 'SM 净览反馈': 'SM Clean View feedback',
    };

    // ---- phrases with variables ------------------------------------------------------------------------------------------
    var PATTERNS = [
        [/^SM 净览 · (.+)$/, function (m) { return 'SM Clean View · ' + tr(m[1]); }],
        [/^约 (\d+) 小时后自动恢复$/, function (m) { return 'Resumes automatically in about ' + m[1] + (m[1] === '1' ? ' hour' : ' hours'); }],
        [/^还剩 (\d+) 分钟，到时自动恢复$/, function (m) { return m[1] + ' min left, then it resumes automatically'; }],
        [/^暂停中，恢复后回到“(.+)”。$/, function (m) { return 'Paused. Returns to “' + (m[1] === '原模式' ? 'its original mode' : tr(m[1])) + '” when resumed.'; }],
        [/^本页已触发过滤规则 (\d+) 次$/, function (m) { return 'Filter rules triggered on this page: ' + m[1]; }],
        [/^启动出错：(.+)。请在扩展管理页对 SM 净览点“重新加载”。$/, function (m) { return 'Start-up error: ' + tr(m[1]) + '. On the extensions page, click “Reload” for SM Clean View.'; }],
        [/^已等待 (\d+) 秒，仍在“(.+)”。请在扩展管理页对 SM 净览点“重新加载”；仍不行请到控制中心“诊断与关于”复制诊断信息发给我们。$/, function (m) { return 'Waited ' + m[1] + ' s, still at “' + tr(m[2]) + '”. On the extensions page, click “Reload” for SM Clean View. If that doesn’t help, copy the diagnostics from Control center → Diagnostics and about and send them to us.'; }],
        [/^第 (\d+) 步：(.+)，已等待 (\d+) 秒$/, function (m) { return 'Step ' + m[1] + ': ' + tr(m[2]) + ', waited ' + m[3] + ' s'; }],
        [/^问题与过滤有关。可以只对本站改用“(.+)”并恢复保护，其他网站不受影响。$/, function (m) { return 'The problem is related to filtering. You can switch only this site to “' + tr(m[1]) + '” and resume protection; other sites aren’t affected.'; }],
        [/^改用“(.+)”并恢复保护$/, function (m) { return 'Switch to “' + tr(m[1]) + '” and resume protection'; }],
        [/^已改为“(.+)”，网站已刷新。$/, function (m) { return 'Changed to “' + tr(m[1]) + '” and refreshed the site.'; }],
        [/^已改为“(.+)”。网页现在正常吗？$/, function (m) { return 'Changed to “' + tr(m[1]) + '”. Does the page work now?'; }],
        [/^无法在此页面使用：(.+)$/, function (m) { return 'Can’t be used on this page: ' + m[1]; }],
        [/^最近 (\d+) 条规则命中（最多 50 条，并非广告数量）：(.*)。$/, function (m) { return 'Last ' + m[1] + ' rule hits (up to 50; not the number of ads): ' + (m[2] === '暂无记录' ? 'none yet' : m[2].split('；').map(tr).join('; ')) + '.'; }],
        [/^(阻止|替换|放行|站点放行|请求头调整|HTTPS 升级|未知) · (.+)$/, function (m) { return tr(m[1]) + ' · ' + m[2]; }],
        [/^未完成：(.+)$/, function (m) { return 'Not completed: ' + tr(m[1]); }],
        [/^默认：(.+?) · (广告与跟踪规则已开启|广告与跟踪规则未完整开启) · 中文网站规则(已开启|未开启)$/, function (m) { return 'Default: ' + tr(m[1]) + ' · ' + (m[2] === '广告与跟踪规则已开启' ? 'ad and tracker rules on' : 'ad and tracker rules not fully on') + ' · Chinese-site rules ' + (m[3] === '已开启' ? 'on' : 'off'); }],
        [/^后台恢复提示：(.+)$/, function (m) { return 'Background recovery note: ' + tr(m[1]); }],
        [/^SM (\S+) · 扩展升级版本 (\S+) · 内置规则\/引擎 (\S+)$/, function (m) { return 'SM ' + m[1] + ' · extension upgrade version ' + m[2] + ' · built-in rules/engine ' + m[3]; }],
        [/^复制报告后发给(.+?)。(有 GitHub 账号也可以直接在 GitHub 提交。)?$/, function (m) { return 'Copy the report and send it to ' + (m[1] === '向你提供本扩展的人' ? 'whoever gave you this extension' : m[1]) + '.' + (m[2] ? ' With a GitHub account you can also file it directly on GitHub.' : ''); }],
        [/^过滤引擎启动出错：(.+)$/, function (m) { return 'The filter engine failed to start: ' + tr(m[1]); }],
        [/^过滤引擎正在启动：第 (\d+) 步“(.+)”，已等待 (\d+) 秒(。时间过长：请在扩展管理页对 SM 净览点“重新加载”，仍不行请在“诊断与关于”复制诊断信息发给我们)?$/, function (m) { return 'The filter engine is starting: step ' + m[1] + ' “' + tr(m[2]) + '”, waited ' + m[3] + ' s' + (m[4] ? '. This is taking too long: on the extensions page click “Reload” for SM Clean View; if that doesn’t help, copy the diagnostics from “Diagnostics and about” and send them to us' : ''); }],
        [/^已暂停 · (.+) · (.+)$/, function (m) { return 'Paused · ' + m[1] + ' · ' + tr(m[2]); }],
        [/^(.+) · 已暂停（(.+)）$/, function (m) { return m[1] + ' · Paused (' + tr(m[2]).replace(/^Resumes/, 'resumes') + ')'; }],
        [/^(.+) 自动恢复$/, function (m) { return 'Resumes at ' + m[1]; }],
        [/^已隐藏元素 · (.+) · (\d+) 条$/, function (m) { return 'Hidden elements · ' + m[1] + ' · ' + m[2]; }],
        [/^(.+) · (启用|停用) · 最近成功：(.+) · 最近尝试：(.+?)( · .+)?$/, function (m) { return m[1] + ' · ' + (m[2] === '启用' ? 'on' : 'off') + ' · Last success: ' + tr(m[3]) + ' · Last attempt: ' + tr(m[4]) + (m[5] ? ' · ' + tr(m[5].slice(3)) : ''); }],
        [/^删除 (.+) 的规则 (.+)$/, function (m) { return 'Delete rule ' + m[2] + ' for ' + m[1]; }],
        [/^共 (\d+) 条，第 (\d+) 页，每页 100 条。$/, function (m) { return m[1] + ' in total, page ' + m[2] + ', 100 per page.'; }],
        [/^备份时间：(.*)$/, function (m) { return 'Backup time: ' + m[1]; }],
        [/^规则组 (\d+) · 站点设置 (\d+) · 已隐藏的元素 (\d+)$/, function (m) { return 'Rule groups ' + m[1] + ' · Site settings ' + m[2] + ' · Hidden elements ' + m[3]; }],
        [/^外部订阅 (\d+) · 高级规则 (有（请确认来源）|无)$/, function (m) { return 'External subscriptions ' + m[1] + ' · Advanced rules: ' + (m[2] === '无' ? 'none' : 'yes (check the source)'); }],
        [/^将替换当前配置并结束所有临时暂停；操作前保留本地恢复快照，失败会自动回退。$/, function () { return 'This replaces the current settings and ends all temporary pauses. A local recovery snapshot is kept first; a failure rolls back automatically.'; }],
        [/^站点例外：(.*)$/, function (m) { return 'Site exceptions: ' + m[1]; }],
        [/^规则列表：(.*)$/, function (m) { return 'Rule list: ' + m[1]; }],
        [/^已启用 (\d+) 组规则（浏览器上限 (\d+) 组）(?:；浏览器还可启用约 (\d+) 条静态规则)?。接近上限时新增规则组可能失败，系统会提示。$/, function (m) { return m[1] + ' rule groups enabled (browser limit ' + m[2] + ')' + (m[3] ? '; the browser can enable about ' + m[3] + ' more static rules' : '') + '. Adding a group near the limit may fail, and you will be told.'; }],
        [/^当前网站：(.+)。按“暂停 → 降低一档 → 反馈”的顺序排查，每一步都可恢复。$/, function (m) { return 'Current site: ' + m[1] + '. Work through “pause → lower one level → report”; every step can be undone.'; }],
        [/^已暂停 (.+) 10 分钟并刷新网页。请切换到那个网页看一下：现在正常了吗？$/, function (m) { return 'Paused ' + m[1] + ' for 10 minutes and refreshed the page. Switch to that page and take a look: does it work now?'; }],
        [/^问题与过滤有关。可以只对 (.+) 从“(.+)”降低一档并恢复保护，其他网站不受影响。$/, function (m) { return 'The problem is related to filtering. You can lower only ' + m[1] + ' one level from “' + tr(m[2]) + '” and resume protection; other sites aren’t affected.'; }],
        [/^问题与过滤有关。此站点已经是“(.+)”，建议提交反馈。$/, function (m) { return 'The problem is related to filtering. This site is already at “' + tr(m[1]) + '”, so reporting it is recommended.'; }],
        [/^降低到“(.+)”并恢复保护$/, function (m) { return 'Lower to “' + tr(m[1]) + '” and resume protection'; }],
        [/^已把 (.+) 调整为“(.+)”。网页现在正常吗？$/, function (m) { return 'Set ' + m[1] + ' to “' + tr(m[2]) + '”. Does the page work now?'; }],
        [/^最近一次较慢的引擎启动（(.+?)）：(.*?)(?:；错误：(.+))?$/, function (m) { return 'Last slow engine start (' + m[1] + '): ' + m[2].split(' → ').map(tr).join(' → ') + (m[3] ? '; error: ' + tr(m[3]) : ''); }],
        [/^(.+)：中位 (\S+) ms，最慢 (\S+) ms$/, function (m) { return tr(m[1]) + ': median ' + m[2] + ' ms, slowest ' + m[3] + ' ms'; }],
        [/^最近 (\d+) 次打开，其中 (\d+) 次需要唤醒后台$/, function (m) { return 'Last ' + m[1] + ' opens, ' + m[2] + ' of which had to wake the background'; }],
        [/^第一次读取：(.*)。三轮最慢 (\d+) ms。(.*)$/, function (m) { return 'First read: ' + m[1].split('，').join(', ') + '. Slowest of three rounds: ' + m[2] + ' ms. ' + tr(m[3]); }],
        [/^正在下载：(\d+) 个文件，(\d+) KB$/, function (m) { return 'Downloading: ' + m[1] + ' files, ' + m[2] + ' KB'; }],
        [/^浏览器检测到新版本 (.+)，等待浏览器更新。$/, function (m) { return 'The browser found version ' + m[1] + ' and is waiting to update.'; }],
        [/^已读取版本 (.+)；未应用。请检查下方备份预览并确认。$/, function (m) { return 'Read version ' + m[1] + '; not applied. Check the backup preview below and confirm.'; }],
        [/^同步存储已写入并读回：(.+)。其他设备接收情况未验证。$/, function (m) { return 'Sync storage was written and read back: ' + m[1] + '. Whether other devices received it wasn’t verified.'; }],
        [/^未知规则集：(.+)$/, function (m) { return 'Unknown rule set: ' + m[1]; }],
        [/^设置 (.+) 无效$/, function (m) { return 'Invalid setting ' + m[1]; }],
        [/^版本：(.+) \/ 引擎 (.+)$/, function (m) { return 'Version: ' + m[1] + ' / engine ' + m[2]; }],
        [/^类型：(.+)$/, function (m) { return 'Type: ' + tr(m[1]); }],
        [/^站点：(.+)$/, function (m) { return 'Site: ' + tr(m[1]); }],
        [/^过滤模式：(.+)$/, function (m) { return 'Filtering mode: ' + (m[1] === '未知' ? 'unknown' : tr(m[1])); }],
        [/^启用规则组：(.+)$/, function (m) { return 'Enabled rule groups: ' + m[1]; }],
        [/^网站权限：(可用|不足或未知)$/, function (m) { return 'Site access: ' + (m[1] === '可用' ? 'available' : 'not enough or unknown'); }],
        [/^中断恢复未完成：(.+)$/, function (m) { return 'Interrupted-operation recovery did not finish: ' + tr(m[1]); }],
        [/^导入失败且自动回退未完成；恢复快照已保存，下次启动会再次尝试恢复。(.*)$/, function (m) { return 'The import failed and the automatic rollback did not finish. The recovery snapshot is saved and will be tried again at the next start. ' + tr(m[1]); }],
        [/^导入失败，已恢复原配置(和仍在有效期内的临时暂停)?。(.*)$/, function (m) { return 'The import failed; the original settings' + (m[1] ? ' and still-valid temporary pauses' : '') + ' were restored. ' + tr(m[2]); }],
        [/^撤销失败且自动回退未完成；恢复快照已保存，下次启动会再次尝试恢复。(.*)$/, function (m) { return 'The undo failed and the automatic rollback did not finish. The recovery snapshot is saved and will be tried again at the next start. ' + tr(m[1]); }],
        [/^撤销失败，已恢复撤销前的配置。(.*)$/, function (m) { return 'The undo failed; the settings from before the undo were restored. ' + tr(m[1]); }],
        [/^(.+)（未完成）$/, function (m) { return tr(m[1]) + ' (not finished)'; }],
    ];

    // ---- engine ------------------------------------------------------------------------------------------------------------
    var KEYS = Object.keys(EN).filter(function (k) { return k.length >= 3; }).sort(function (a, b) { return b.length - a.length; });
    var PUNCT = [['：', ': '], ['（', ' ('], ['）', ')'], ['，', ', '], ['。', '. '], ['；', '; '], ['、', ', '], ['“', '“'], ['”', '”']];
    function tr(text) {
        if (typeof text !== 'string' || !CJK.test(text)) return text;
        var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
        return m[1] + core(m[2]) + m[3];
    }
    function core(c) {
        if (!c) return c;
        if (Object.prototype.hasOwnProperty.call(EN, c)) return EN[c];
        for (var i = 0; i < PATTERNS.length; i++) { var x = PATTERNS[i][0].exec(c); if (x) return PATTERNS[i][1](x); }
        if (c.indexOf('\n') !== -1) return c.split('\n').map(tr).join('\n');
        // Whatever is left: translate the known phrases inside it, then tidy the full-width punctuation.
        var out = c;
        for (var k = 0; k < KEYS.length; k++) if (out.indexOf(KEYS[k]) !== -1) out = out.split(KEYS[k]).join(EN[KEYS[k]]);
        if (!CJK.test(out)) return out;
        for (var p = 0; p < PUNCT.length; p++) out = out.split(PUNCT[p][0]).join(PUNCT[p][1]);
        return out.replace(/ +$/, '');
    }
    api.tr = tr;

    // ---- keep the page translated -------------------------------------------------------------------------------------------------
    var ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
    function fixText(node) {
        var p = node.parentNode && node.parentNode.nodeName;
        if (p === 'SCRIPT' || p === 'STYLE') return;
        var v = node.data;
        if (CJK.test(v)) { var t = tr(v); if (t !== v) node.data = t; }
    }
    function fixAttrs(el) {
        for (var i = 0; i < ATTRS.length; i++) {
            var v = el.getAttribute && el.getAttribute(ATTRS[i]);
            if (v && CJK.test(v)) { var t = tr(v); if (t !== v) el.setAttribute(ATTRS[i], t); }
        }
    }
    function walk(root) {
        if (root.nodeType === 3) { fixText(root); return; }
        if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
        if (root.nodeType === 1) fixAttrs(root);
        var walker = document.createTreeWalker(root, 1 | 4);
        var node;
        while ((node = walker.nextNode())) { if (node.nodeType === 3) fixText(node); else fixAttrs(node); }
    }
    walk(document.documentElement);
    new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            if (r.type === 'childList') { for (var j = 0; j < r.addedNodes.length; j++) walk(r.addedNodes[j]); }
            else if (r.type === 'characterData') fixText(r.target);
            else fixAttrs(r.target);
        }
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
})();
