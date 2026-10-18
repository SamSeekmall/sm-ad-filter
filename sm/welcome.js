// SM modifications, GPL-3.0. Filtering remains handled by the upstream engine.
const status = document.querySelector('#status');
const enable = document.querySelector('#enable');
const refresh = document.querySelector('#refresh');
const modes = ['不过滤', '基础过滤', '优化过滤', '完整过滤'];
const message = request => chrome.runtime.sendMessage(request);

async function readStatus() {
    const data = await message({ what: 'getOptionsPageData' });
    if (!Array.isArray(data?.enabledRulesets)) throw new Error('过滤引擎尚未就绪，请稍后刷新状态。');
    const chinese = data.enabledRulesets.includes('chn-0');
    status.textContent = `默认模式：${modes[data.defaultFilteringMode] ?? '未知'} · 已启用 ${data.enabledRulesets.length} 组规则 · 中文规则${chinese ? '已开启' : '未开启'}。单个网站可能使用独立设置。`;
    enable.disabled = chinese;
    enable.textContent = chinese ? '中文规则已启用' : '启用中文广告规则';
    return data;
}

async function run(action) {
    enable.disabled = true;
    refresh.disabled = true;
    try { await action(); }
    catch (error) {
        status.textContent = `未完成：${error.message || String(error)}`;
        enable.disabled = false;
    } finally { refresh.disabled = false; }
}

enable.addEventListener('click', () => run(async () => {
    const data = await message({ what: 'getOptionsPageData' });
    if (!Array.isArray(data?.enabledRulesets)) throw new Error('过滤引擎尚未就绪。');
    await message({ what: 'applyRulesets', enabledRulesets: [...new Set([...data.enabledRulesets, 'chn-0'])] });
    const after = await readStatus();
    if (!after.enabledRulesets.includes('chn-0')) throw new Error('中文规则未启用，请在完整设置中检查规则限制。');
}));
refresh.addEventListener('click', () => run(readStatus));
run(readStatus);
