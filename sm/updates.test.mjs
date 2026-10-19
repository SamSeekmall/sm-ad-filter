import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stageLists} from './updates.mjs';
test('staging resolves includes once and keeps per-file failure for old-cache fallback',async()=>{
    const original=globalThis.fetch,seen=[];
    globalThis.fetch=async url=>{seen.push(url);return new Response(url.endsWith('root')?'!#include child\n!#include child\n!#include https://other.test/file':'unavailable',{status:url.endsWith('child')?503:200});};
    try {
        const result=await stageLists([{id:'https://fixture.test/root',enabled:true},{id:'https://fixture.test/off',enabled:false}],new AbortController().signal,()=>{});
        assert.equal(seen.length,2);assert.match(result['https://fixture.test/child'].error,/503/);
        assert.ok(result['https://fixture.test/root'].content);
    }finally{globalThis.fetch=original;}
});
test('cancelled download does not produce a stage to commit',async()=>{
    const original=globalThis.fetch,controller=new AbortController();
    globalThis.fetch=async(url,{signal})=>{controller.abort();signal.throwIfAborted();};
    try{await assert.rejects(()=>stageLists([{id:'https://fixture.test/list',enabled:true}],controller.signal,()=>{}));}
    finally{globalThis.fetch=original;}
});
