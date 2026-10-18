import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hostname,subtree,mergeSubtree,validateBackup,reportText,validateRepository,canonical} from './core.mjs';
const backup=()=>({schema:2,product:'sm-ad-filter',createdAt:'2026-10-19',settings:{enabledRulesets:['easylist'],importedLists:[],filteringModes:{none:[],basic:[],optimal:['all-urls'],complete:[]},customFilters:[],sandboxFilters:'',dnrRules:'',autoReload:true,showBlockedCount:true,strictBlockMode:true,popupBlockMode:true,cookieReject:false,developerMode:false}});
test('reject malformed backup before applying any data',()=>{
    for(const value of [null,{}, {schema:1}, {...backup(),settings:{...backup().settings,enabledRulesets:['javascript:alert(1)']}}])assert.throws(()=>validateBackup(value,['easylist']));
    const b=backup();b.settings.filteringModes.none=['all-urls'];assert.throws(()=>validateBackup(b,['easylist']),/冲突/);
    const invalidImport=backup();invalidImport.settings.importedLists=['easylist'];assert.throws(()=>validateBackup(invalidImport,['easylist']));
    const duplicate=backup();duplicate.settings.enabledRulesets.push('easylist');assert.throws(()=>validateBackup(duplicate,['easylist']),/重复/);
});
test('migration preserves non-default settings and custom rules',()=>{
    const b=backup();b.settings.customFilters=[['example.com',['.advert']]];b.settings.filteringModes.none=['store.example.com'];b.settings.enabledRulesets.push('https://example.com/list.txt');
    b.settings.importedLists=['https://example.com/list.txt'];
    assert.deepEqual(validateBackup(b,['easylist']),b);
});
test('restore subtree preserves changes elsewhere and ancestor policy',()=>{
    const before={none:[],basic:['example.com'],optimal:['all-urls'],complete:['child.shop.example.com']};
    const patch=subtree(before,'shop.example.com');
    const during={none:['shop.example.com'],basic:['example.com','other.com'],optimal:['all-urls'],complete:[]};
    const restored=mergeSubtree(during,patch,'shop.example.com');
    assert.deepEqual(restored.basic,['example.com','other.com']);assert.deepEqual(restored.complete,['child.shop.example.com']);assert.deepEqual(restored.none,[]);
});
test('report strips path, query, fragment, and disallows credentials',()=>{
    const report=reportText({site:'https://example.com/private?token=secret#fragment',description:'cannot play',rulesets:7,mode:2});
    assert.match(report,/example.com/);assert.doesNotMatch(report,/secret|private|fragment/);
    assert.throws(()=>hostname('https://name:password@example.com'));assert.throws(()=>validateRepository('https://github.com.evil.test/a/b'));
});
test('canonical state comparison ignores object key order, retains rule order',()=>{
    assert.equal(canonical({b:2,a:1}),canonical({a:1,b:2}));assert.notEqual(canonical(['a','b']),canonical(['b','a']));
});
