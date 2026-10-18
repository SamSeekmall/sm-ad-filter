// SM 净览 modifications. GPL-3.0-or-later.
export const modeNames = ['不过滤', '基础过滤', '优化过滤', '完整过滤'];
export const modeKeys = ['none', 'basic', 'optimal', 'complete'];
export function hostname(value) {
    if (typeof value !== 'string' || value.length > 253) throw new Error('网站地址无效');
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname || ['all-urls','*'].includes(url.hostname)) throw new Error('仅支持 HTTP / HTTPS 网站');
    return url.hostname.toLowerCase();
}
export function related(a, b) { return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`); }
export function subtree(modes, host) {
    return Object.fromEntries(modeKeys.map(key => [key, modes[key].filter(h => h === host || h.endsWith(`.${host}`)).sort()]));
}
export function mergeSubtree(current, previous, host) {
    return Object.fromEntries(modeKeys.map(key => [key, [...current[key].filter(h => h !== host && !h.endsWith(`.${host}`)), ...previous[key]].sort()]));
}
export function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
    return JSON.stringify(value);
}
function strings(value, max = 10000) { return Array.isArray(value) && value.length <= max && value.every(s => typeof s === 'string' && s.length < 20000); }
export function validateBackup(input, knownRulesets) {
    if (JSON.stringify(input).length > 500000) throw new Error('配置超过 500 KB，请拆分自定义规则后重试');
    if (input?.schema !== 2 || input.product !== 'sm-ad-filter') throw new Error('请选择 SM 净览 v2 格式备份');
    const s = input.settings;
    if (!s || !strings(s.enabledRulesets, 100)) throw new Error('规则列表格式错误');
    if (!strings(s.importedLists,100)) throw new Error('导入订阅列表格式错误');
    for (const id of [...s.enabledRulesets,...s.importedLists]) {
        if (knownRulesets.includes(id) && !s.importedLists.includes(id)) continue;
        let url;
        try { url = new URL(id); } catch { throw new Error(`未知规则集：${id}`); }
        if (!['https:','http:'].includes(url.protocol) || url.username || url.password) throw new Error('导入订阅必须是无凭据的 HTTP / HTTPS 地址');
    }
    if (new Set(s.enabledRulesets).size !== s.enabledRulesets.length || new Set(s.importedLists).size !== s.importedLists.length) throw new Error('规则列表存在重复项');
    if (!s.filteringModes || !modeKeys.every(k => strings(s.filteringModes[k], 2000))) throw new Error('站点例外格式错误');
    const assigned = new Set();
    for (const key of modeKeys) for (const h of s.filteringModes[key]) {
        if (h !== 'all-urls' && hostname(h) !== h) throw new Error('站点例外包含无效域名');
        if (assigned.has(h)) throw new Error('同一站点有冲突的过滤模式');
        assigned.add(h);
    }
    if (!assigned.has('all-urls')) throw new Error('备份缺少默认过滤模式');
    if (!Array.isArray(s.customFilters) || s.customFilters.length > 2000 || !s.customFilters.every(row => Array.isArray(row) && row.length === 2 && typeof row[0] === 'string' && strings(row[1]))) throw new Error('自定义规则格式错误');
    for (const [h] of s.customFilters) if (hostname(h) !== h) throw new Error('自定义规则域名错误');
    if (new Set(s.customFilters.map(row=>row[0])).size !== s.customFilters.length) throw new Error('自定义规则域名重复');
    if (typeof s.sandboxFilters !== 'string' || typeof s.dnrRules !== 'string') throw new Error('高级规则格式错误');
    for (const id of s.enabledRulesets.filter(x=>/^https?:/.test(x))) if (!s.importedLists.includes(id)) throw new Error('启用的订阅未列入导入列表');
    for (const k of ['autoReload', 'showBlockedCount', 'strictBlockMode', 'popupBlockMode', 'cookieReject','developerMode']) if (typeof s[k] !== 'boolean') throw new Error(`设置 ${k} 无效`);
    const allowed = ['enabledRulesets','importedLists','filteringModes','customFilters','sandboxFilters','dnrRules','autoReload','showBlockedCount','strictBlockMode','popupBlockMode','cookieReject','developerMode'];
    if (Object.keys(s).some(k => !allowed.includes(k))) throw new Error('备份包含不支持的设置');
    return structuredClone(input);
}
export function backupSummary(backup) {
    const s = backup.settings;
    return { lists: s.enabledRulesets.length, sites: modeKeys.reduce((n,k) => n + s.filteringModes[k].filter(h => h !== 'all-urls').length, 0), custom: s.customFilters.reduce((n,row) => n + row[1].length, 0), advanced: Boolean(s.sandboxFilters || s.dnrRules), subscriptions: s.importedLists.length };
}
export function validateRepository(value) {
    if (value === '') return '';
    if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(value)) throw new Error('请输入 GitHub 仓库主页地址');
    return value.replace(/\/$/, '');
}
export function reportText({ site, version, engine, mode, rulesets, permissions, kind, description }) {
    return [`SM 净览问题反馈`, `版本：${version} / 引擎 ${engine}`, `类型：${kind}`, `站点：${site ? hostname(site) : '未提供'}`, `过滤模式：${modeNames[mode] ?? '未知'}`, `启用规则组：${rulesets}`, `网站权限：${permissions ? '可用' : '不足或未知'}`, '', '现象（请手动删除账号、令牌和个人信息）：', description.slice(0, 4000)].join('\n');
}
