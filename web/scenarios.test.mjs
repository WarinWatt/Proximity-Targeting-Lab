import test from 'node:test';
import assert from 'node:assert/strict';
import {scenarios,runScenario} from './scenarios.mjs';
import {campaigns,screens} from './engine.mjs';
test('all scenarios return five decisions and restore shared fixtures',()=>{
 assert.equal(scenarios.length,10);assert.equal(new Set(scenarios.map(s=>s.id)).size,10);
 const before=JSON.stringify({campaigns,screens});
 for(const s of scenarios){const r=runScenario(s.id);assert.equal(r.rows.length,5);assert.ok(Number.isFinite(r.total));assert.equal(JSON.stringify({campaigns,screens}),before);}
});
test('engagement strict threshold and failed playback do not charge',()=>{
 const r=runScenario('engagement');assert.equal(r.rows[1].premium,0);assert.ok(r.rows[2].premium>0);
 const failed=runScenario('failed');assert.equal(failed.rows[0].total,0);assert.equal(failed.rows[1].premium,0);
 assert.equal(runScenario('empty').total,0);
 assert.equal(failed.rows[2].stopped,false);assert.equal(failed.rows[2].premium,0);
});

test('every scenario conserves shared money during reservation and settlement',()=>{
 for(const scenario of scenarios){
  const result=runScenario(scenario.id);
  for(const [i,row] of result.rows.entries()){
   if(i)assert.deepEqual(row.before,result.rows[i-1].after);
   for(const snapshot of [row.before,row.after,row.beforeSettlement,row.afterSettlement]){
    for(const account of Object.values(snapshot)){
     assert.equal(account.available+account.spent+account.reserved,account.budget);
     assert.ok(account.available>=0);assert.ok(account.reserved>=0);assert.ok(account.spent>=0);
    }
   }
   assert.equal(row.total,row.base+row.premium);
   assert.equal(row.threshold,7.5);assert.equal(row.gaze,row.seconds>0);
   assert.equal(row.premium,row.base&&row.confirmed&&row.stopped&&row.gaze&&row.seconds>row.threshold&&row.confidence>=0.8?Math.round(row.base*0.25):0);
   if(row.reservation){
    assert.equal(row.reservation,row.after[row.winner].reserved-row.before[row.winner].reserved);
    assert.ok(row.before[row.winner].available>=row.reservation);
    assert.equal(row.reservation,row.beforeSettlement[row.winner].reserved-row.afterSettlement[row.winner].reserved);
    assert.equal(row.total,row.afterSettlement[row.winner].spent-row.beforeSettlement[row.winner].spent);
   }else{assert.equal(row.total,0);assert.deepEqual(row.before,row.after);}
  }
  for(const [id,account] of Object.entries(result.budgets)){
   assert.equal(account.reserved,0);
   assert.equal(account.spent,result.rows.filter(r=>r.winner===id).reduce((sum,r)=>sum+r.total,0));
  }
  assert.equal(result.total,Object.values(result.budgets).reduce((sum,a)=>sum+a.spent,0));
 }
});

test('premium determines affordability and reservations across screens at exact boundaries',()=>{
 const saved=structuredClone(campaigns);
 try{
  campaigns.forEach(c=>{c.budget=0;});
  const candidate=campaigns.find(c=>c.id==='C8');
  const cost=candidate.bid+Math.round(candidate.bid*0.25);
  for(const [budget,count] of [[cost-1,0],[cost,1],[cost*2-1,1],[cost*2,2]]){
   campaigns.find(c=>c.id===candidate.id).budget=budget;
   const result=runScenario('overlap');
   assert.equal(result.rows.filter(r=>r.winner===candidate.id).length,count);
   assert.ok(result.budgets[candidate.id].spent<=budget);
  }
 }finally{campaigns.splice(0,campaigns.length,...saved);}
});

test('scenario replay is deterministic and unknown scenarios leave fixtures intact',()=>{
 for(const scenario of scenarios)assert.deepEqual(runScenario(scenario.id),runScenario(scenario.id));
 const before=structuredClone({campaigns,screens});
 assert.throws(()=>runScenario('unknown'),/Unknown scenario/);
 assert.deepEqual({campaigns,screens},before);
});
