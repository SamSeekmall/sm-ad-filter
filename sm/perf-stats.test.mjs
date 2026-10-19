import {test} from 'node:test';
import assert from 'node:assert/strict';
import {percentile,summarize,evaluate} from './perf-stats.mjs';
import {readFileSync} from 'node:fs';
const gates=JSON.parse(readFileSync(new URL('./perf-gates.json',import.meta.url),'utf8'));
const sample=(ms,extra={})=>({ok:true,stateObservedMs:ms,...extra});
test('nearest-rank percentiles',()=>{
    const hundred=Array.from({length:100},(_,i)=>i+1);
    assert.equal(percentile(hundred,0.5),50);assert.equal(percentile(hundred,0.95),95);assert.equal(percentile([5],0.95),5);assert.equal(percentile([],0.5),null);
    assert.equal(percentile([1,2,3],0.95),3,'with 3 samples p95 is just the maximum: it says nothing about the tail');
});
test('failures and timeouts are counted, not dropped',()=>{
    const s=summarize([sample(300),sample(400),{ok:false,timedOut:true,error:'no state'},{ok:false,error:'cdp'}]);
    assert.deepEqual({n:s.n,failures:s.failures,timeouts:s.timeouts,max:s.max},{n:4,failures:2,timeouts:1,max:400});
});
test('gate refuses to pass on too few samples even when they are fast',()=>{
    const groups={warm:summarize(Array.from({length:30},()=>sample(300))),wake:summarize(Array.from({length:100},()=>sample(500))),restart:summarize(Array.from({length:10},()=>sample(900)))};
    const verdict=evaluate(groups,gates);
    assert.equal(verdict.groups.warm.verdict,'INSUFFICIENT_SAMPLES');assert.equal(verdict.overall,'INSUFFICIENT_SAMPLES');
});
test('a single multi-second outlier fails the gate through the max limit even if p95 looks fine',()=>{
    const fast=Array.from({length:99},()=>sample(300));
    const groups={warm:summarize([...fast,sample(6994)]),wake:summarize(Array.from({length:100},()=>sample(500))),restart:summarize(Array.from({length:10},()=>sample(900)))};
    assert.equal(groups.warm.p95,300);
    const verdict=evaluate(groups,gates);assert.equal(verdict.groups.warm.verdict,'NOT_MET');assert.match(verdict.groups.warm.reasons[0],/max 6994/);assert.equal(verdict.overall,'NOT_MET');
});
test('any failed sample fails the gate; clean complete data is MET',()=>{
    const clean=n=>summarize(Array.from({length:n},()=>sample(400)));
    assert.equal(evaluate({warm:clean(100),wake:clean(100),restart:clean(10)},gates).overall,'MET');
    const broken=summarize([...Array.from({length:99},()=>sample(400)),{ok:false,timedOut:true}]);
    assert.equal(evaluate({warm:broken,wake:clean(100),restart:clean(10)},gates).groups.warm.verdict,'NOT_MET');
});
