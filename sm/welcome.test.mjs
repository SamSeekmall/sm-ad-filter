import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('./welcome.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
async function mount(sendMessage) {
    const nodes = Object.fromEntries(['#status', '#enable', '#refresh'].map(id => [id, { disabled: false, textContent: '', addEventListener(event, fn) { this[event] = fn; } }]));
    vm.runInNewContext(source, { document: { querySelector: id => nodes[id] }, chrome: { runtime: { sendMessage } } });
    await settle();
    return nodes;
}
test('enabling Chinese rules preserves existing subscriptions and verifies read-back', async () => {
    let enabledRulesets = ['easylist', 'https://example.org/custom.txt'];
    let reads = 0;
    const nodes = await mount(async request => {
        if (request.what === 'applyRulesets') { enabledRulesets = Array.from(request.enabledRulesets); return; }
        reads++;
        return { enabledRulesets, defaultFilteringMode: 2 };
    });
    nodes['#enable'].click();
    await settle();
    assert.deepEqual(enabledRulesets, ['easylist', 'https://example.org/custom.txt', 'chn-0']);
    assert.equal(reads, 3);
    assert.equal(nodes['#enable'].disabled, true);
    assert.match(nodes['#status'].textContent, /中文规则已开启/);
});
test('rejected or silently unsuccessful rule application is not reported as success', async () => {
    const nodes = await mount(async () => ({ enabledRulesets: ['easylist'], defaultFilteringMode: 1 }));
    nodes['#enable'].click();
    await settle();
    assert.match(nodes['#status'].textContent, /未完成/);
    assert.equal(nodes['#enable'].disabled, false);
});
test('worker failure leaves a retry available', async () => {
    const nodes = await mount(async () => { throw new Error('worker unavailable'); });
    assert.match(nodes['#status'].textContent, /worker unavailable/);
    assert.equal(nodes['#refresh'].disabled, false);
});
