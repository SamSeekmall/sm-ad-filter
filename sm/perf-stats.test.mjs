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
    // Calibrated gates also look at in-popup time, so a clean sample carries the popup's own timing.
    const clean=n=>summarize(Array.from({length:n},()=>sample(400,{timing:{stateVisibleMs:150}})));
    assert.equal(evaluate({warm:clean(100),wake:clean(100),restart:clean(10)},gates).overall,'MET');
    const broken=summarize([...Array.from({length:99},()=>sample(400)),{ok:false,timedOut:true}]);
    assert.equal(evaluate({warm:broken,wake:clean(100),restart:clean(10)},gates).groups.warm.verdict,'NOT_MET');
});
test('in-popup time is gated separately from the browser-side window creation',()=>{
    const withTiming=(total,visible)=>sample(total,{timing:{stateVisibleMs:visible}});
    const clean=n=>summarize(Array.from({length:n},()=>withTiming(400,120)));
    const s=summarize([...Array.from({length:99},()=>withTiming(400,120)),withTiming(900,2500)]);
    assert.equal(s.inPopupN,100);assert.equal(s.inPopupMax,2500);
    const limits={...gates,limits:{...gates.limits,warm:{...gates.limits.warm,inPopupP95Ms:1000}}};
    assert.equal(evaluate({warm:clean(100),wake:clean(100),restart:clean(10)},limits).overall,'MET');
    const slowInside=summarize(Array.from({length:100},(_,i)=>withTiming(600,i<90?200:1800)));
    const verdict=evaluate({warm:slowInside,wake:clean(100),restart:clean(10)},limits);
    assert.equal(verdict.groups.warm.verdict,'NOT_MET');assert.match(verdict.groups.warm.reasons[0],/in-popup p95/);
    const noTiming=summarize(Array.from({length:100},()=>sample(400)));
    assert.equal(evaluate({warm:noTiming,wake:clean(100),restart:clean(10)},limits).groups.warm.verdict,'INSUFFICIENT_SAMPLES');
});
