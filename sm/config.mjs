// Configuration snapshot / apply / history-recording mutation. Everything here assumes the caller already
// holds the controller's serial queue; none of it queues itself (the engine's own callbacks must not wait on it).
import { canonical, validateBackup } from './core.mjs';

const switches = [['autoReload', 'setAutoReload'], ['showBlockedCount', 'setShowBlockedCount'], ['strictBlockMode', 'setStrictBlockMode'], ['popupBlockMode', 'setPopupBlockMode'], ['developerMode', 'setDeveloperMode']];

export function createConfig({ api, engine, read, write, parseDnr, history, now = () => Date.now() }) {
    async function snapshot() {
        const [config, modes, custom, sandbox, dnrRules, cookieReject, imported] = await Promise.all([
            engine({ what: 'getCurrentConfig' }), engine({ what: 'getFilteringModeDetails' }), engine({ what: 'getAllCustomFilters' }), engine({ what: 'getSandboxFilters' }), read('userDnrRules', ''), read('sm.cookieReject', false), engine({ what: 'getImportedLists' }),
        ]);
        const settings = { enabledRulesets: [...config.enabledRulesets].sort(), importedLists: imported.map(x => x.id).sort(), filteringModes: modes, customFilters: custom.sort((a, b) => a[0].localeCompare(b[0])), sandboxFilters: sandbox ?? '', dnrRules, cookieReject };
        for (const [key] of switches) settings[key] = config[key];
        for (const key of Object.keys(modes)) modes[key].sort();
        return { schema: 2, product: 'sm-ad-filter', createdAt: new Date(now()).toISOString(), settings };
    }
    async function digest(settings) {
        const bytes = new TextEncoder().encode(canonical(settings));
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    const fingerprint = async () => digest((await snapshot()).settings);
    async function validate(data) {
        if (data?.settings?.dnrRules) {
            if (!parseDnr || parseDnr(data.settings.dnrRules).bad.length) throw new Error('高级网络规则语法无效');
        }
        return validateBackup(data, api.runtime.getManifest().declarative_net_request.rule_resources.map(x => x.id));
    }
    async function apply(data) {
        const s = data.settings;
        const currentImports = await engine({ what: 'getImportedLists' });
        for (const url of s.importedLists) {
            if (!currentImports.some(x => x.id === url)) await engine({ what: 'importFilterList', url });
        }
        await engine({ what: 'applyRulesets', enabledRulesets: s.enabledRulesets, toRemove: currentImports.filter(x => !s.importedLists.includes(x.id)).map(x => x.id) });
        await engine({ what: 'setFilteringModeDetails', modes: s.filteringModes });
        for (const [key, what] of switches) await engine({ what, state: s[key] });
        await engine({ what: 'removeAllCustomFilters', hostname: '*' });
        if (s.customFilters.length) await engine({ what: 'addManyCustomFilters', entries: s.customFilters });
        await engine({ what: 'setSandboxFilters', text: s.sandboxFilters });
        await write('userDnrRules', s.dnrRules);
        const appliedRules = await engine({ what: 'updateUserDnrRules' });
        if (appliedRules?.errors?.length) throw new Error('浏览器拒绝了部分高级规则');
        await write('sm.cookieReject', s.cookieReject);
        const after = await snapshot();
        if (canonical(after.settings) !== canonical(s)) throw new Error('设置读回不一致（可能受浏览器权限或策略限制）');
    }
    // Run one change with a recovery snapshot and a history entry (marked incomplete if it throws).
    async function mutate(label, fn) {
        const before = await snapshot();
        await write('sm.recovery', before);
        let result;
        try { result = await fn(); }
        catch (error) { await history.remember(`${label}（未完成）`, before, await snapshot()); throw error; }
        await history.remember(label, before, await snapshot());
        return result;
    }
    return { snapshot, fingerprint, digest, validate, apply, mutate };
}
