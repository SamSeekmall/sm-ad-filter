// Opt-in, narrowly matched CMP reject buttons. GPL-3.0-or-later.
(() => {
    if (window !== window.top) return;
    const adapters = [
        {provider:'OneTrust',container:'#onetrust-banner-sdk',button:'#onetrust-reject-all-handler'},
        {provider:'Cookiebot',container:'#CybotCookiebotDialog',button:'#CybotCookiebotDialogBodyButtonDecline'},
    ];
    const attempted = new Set();
    let busy = false;
    const visible = el => el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
    async function check() {
        if (busy) return;
        busy = true;
        try {
            const permission = await chrome.runtime.sendMessage({what:'sm:cookieAllowed'});
            if (!permission?.ok || permission.data !== true) return;
            for (const a of adapters) {
                if (attempted.has(a.provider)) continue;
                const box = document.querySelector(a.container);
                const button = box?.querySelector(a.button);
                if (!visible(box) || !visible(button) || button.disabled || button.tagName !== 'BUTTON') continue;
                const text = (button.textContent || button.getAttribute('aria-label') || '').trim();
                if (!/reject|decline|deny|拒绝|全部拒絕|拒絕全部/i.test(text) || /accept|allow all|接受|同意全部/i.test(text)) continue;
                attempted.add(a.provider); button.click();
                setTimeout(() => chrome.runtime.sendMessage({what:'sm:cookieResult',provider:a.provider,closed:!visible(box)}).catch(() => {}),800);
            }
        } catch { } finally { busy = false; }
    }
    let timer;
    const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(check,350); });
    chrome.runtime.sendMessage({what:'sm:cookieAllowed'}).then(answer => {
        if (answer?.data !== true) return;
        check(); observer.observe(document.documentElement,{childList:true,subtree:true});
        setTimeout(() => observer.disconnect(),30000);
    }).catch(() => {});
})();
