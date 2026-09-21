import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initial,decide,advance,matched,matchDetails,rankingScore,compareCandidates,walk,personas,campaigns,screens,available,held} from './engine.mjs';
const complete=(id='P1',mode='independent')=>{const s=initial(id);for(let i=0;i<5;i++)walk(s,mode);return s;};
test('one person passing five cameras is one unique person and five events',()=>{
 const s=complete();assert.equal(new Set(s.observations.map(e=>e.personId)).size,1);assert.equal(s.observations.length,5);walk(s);assert.equal(s.observations.length,5);
 assert.deepEqual(s.observations.map(e=>e.camera),['CAM1','CAM2','CAM3','CAM4','CAM5']);
});
test('overlap qualifies once and ALL must match the same person',()=>{
 const s=walk(initial());assert.deepEqual(s.decisions.S1.filter(r=>r.people.length).map(r=>r.campaign),['C1','C2','C4','C6']);
 assert.ok(s.decisions.S1.every(r=>r.people.length<=1));assert.equal(matched(campaigns[4],{tags:['adult']}),false);
 assert.equal(matched(campaigns[4],personas[4]),true);
});
test('same person receives different content due to cache and shared budget',()=>{
 const s=complete();assert.deepEqual(screens.map(x=>s.plans[x.id].campaign),['C6','C6','C2','C6','C6']);
 const constrained=initial();constrained.spent.C6=20000;constrained.spent.C2=4500;walk(constrained);
 assert.ok(constrained.decisions.S1.find(r=>r.campaign==='C2').reasons.includes('งบคงเหลือไม่พอ'));
 assert.ok(s.decisions.S3.find(r=>r.campaign==='C4').reasons.includes('cache ไม่พร้อม'));
 assert.ok(s.decisions.S2.find(r=>r.campaign==='C4').reasons.includes('bid ต่ำกว่าราคาขั้นต่ำ'));
});
test('walking changes only that camera screen; never interrupts playback',()=>{
 const s=walk(initial());advance(s);const current=structuredClone(s.current);walk(s);assert.deepEqual(s.current,current);assert.deepEqual(s.spent,{});
 assert.deepEqual(Object.keys(s.plans),['S2']);
});
test('redecision releases only its own pending hold',()=>{
 const s=complete();const other=structuredClone(s.plans.S1);decide(s,'independent',['S5']);assert.deepEqual(s.plans.S1,other);assert.ok(campaigns.every(c=>available(s,c)>=0));
});
test('all profiles and both modes honor budget, cache, floor and matching',()=>{
 for(const p of personas)for(const mode of ['independent','unique']){
  const s=complete(p.id,mode);const winners=Object.values(s.plans).filter(p=>p.campaign);
  if(mode==='unique')assert.equal(new Set(winners.map(p=>p.campaign)).size,winners.length);
  for(const screen of screens){const plan=s.plans[screen.id];if(!plan.campaign)continue;const c=campaigns.find(c=>c.id===plan.campaign);assert.ok(c.cache.includes(screen.id));assert.ok(c.bid>=screen.floor);assert.ok(matched(c,p));}
  assert.ok(campaigns.every(c=>available(s,c)>=0));
 }
});
test('empty scene falls back to free content',()=>{const s=decide(initial());assert.ok(Object.values(s.plans).every(p=>p.campaign===null&&p.price===0));});
test('completion settles once and never overspends',()=>{
 const s=complete();advance(s);assert.deepEqual(s.spent,{});advance(s);const spent=structuredClone(s.spent);advance(s);assert.deepEqual(s.spent,spent);
 for(let i=0;i<20;i++){decide(s);advance(s);for(const c of campaigns)assert.ok((s.spent[c.id]||0)+held(s,c.id)<=c.budget);}
});
test('choosing another persona resets route, budget and observations',()=>{const s=initial('P5');assert.equal(s.personaId,'P5');assert.equal(s.step,0);assert.deepEqual(s.spent,{});assert.deepEqual(s.observations,[]);});
test('gender is mandatory even when age or clothing match',()=>{
 const get=id=>personas.find(p=>p.id===id),c=campaigns.find(c=>c.id==='C2');
 assert.equal(matched(c,get('P1')),true);assert.equal(matched(c,get('P6')),false);
 assert.deepEqual(get('P1').tags.filter(t=>t!=='male'),get('P6').tags.filter(t=>t!=='female'));
 assert.equal(get('P1').age,get('P6').age);
 assert.equal(matched(campaigns[0],get('P1')),true);assert.equal(matched(campaigns[0],get('P6')),true);
 assert.equal(complete('P1').plans.S1.campaign,'C6');assert.equal(complete('P6').plans.S1.campaign,'C4');
});
test('match-price favors full while price-only permits a higher partial bid to win',()=>{
 const quality=walk(initial('P1',{ranking:'match_price',matching:'partial'}));
 const price=walk(initial('P1',{ranking:'price',matching:'partial'}));
 assert.equal(quality.plans.S1.campaign,'C6');assert.equal(price.plans.S1.campaign,'C7');
 const partial=quality.decisions.S1.find(r=>r.campaign==='C7');
 assert.equal(partial.match.kind,'Partial');assert.equal(partial.match.ratio,2/3);assert.ok(Math.abs(partial.score-28*2/3)<1e-12);
 assert.equal(partial.rank,3);assert.equal(partial.people.length,1);
 const fullOnly=walk(initial('P1',{ranking:'price',matching:'full'}));assert.equal(fullOnly.plans.S1.campaign,'C6');assert.ok(fullOnly.decisions.S1.find(r=>r.campaign==='C7').reasons.length);
});
test('partial score does not discount the first-price payment',()=>{
 const s=walk(initial('P1',{ranking:'price',matching:'partial'}));assert.equal(s.plans.S1.price,2800);
 advance(s);assert.equal(held(s,'C7'),2800);assert.equal(s.spent.C7,undefined);advance(s);assert.equal(s.spent.C7,2800);advance(s);assert.equal(s.spent.C7,2800);
});
test('ANY alternative group is complete with one alternative; duplicate ALL tokens do not boost weight',()=>{
 assert.equal(matchDetails(campaigns[2],personas[2]).ratio,1);
 const c={target:['adult','adult','top'],rule:'ALL',gender:'all',exclude:[]};assert.equal(matchDetails(c,personas[0]).ratio,0.5);
 assert.ok(Math.abs(rankingScore(2800,2/3,'match_price')-28*2/3)<1e-12);
});
test('exact-score ties prefer full match then bid then stable campaign ID',()=>{
 const row=(campaign,bid,numerator,denominator)=>({campaign,bid,match:{numerator,denominator},auction:{ranking:'match_price'}});
 const full=row('Z',2000,1,1),partial=row('A',3000,2,3);
 assert.ok(compareCandidates(full,partial)<0);
 assert.ok(compareCandidates(row('A',2000,1,1),row('B',2000,1,1))<0);
 assert.ok(compareCandidates(row('Z',2001,1,1),row('A',2000,1,1))<0);
});
test('all people, policies and allocation modes retain gates and budget invariants',()=>{
 for(const p of personas)for(const ranking of ['price','match_price'])for(const matching of ['full','partial'])for(const mode of ['independent','unique']){
  const s=initial(p.id,{ranking,matching});for(let i=0;i<5;i++)walk(s,mode);
  for(const screen of screens){const plan=s.plans[screen.id];if(!plan.campaign)continue;const c=campaigns.find(c=>c.id===plan.campaign),m=matchDetails(c,p);
   assert.ok(m.genderOK&&!m.excluded);assert.ok(m.ratio>=(matching==='full'?1:0.5));assert.ok(c.cache.includes(screen.id));assert.ok(plan.price>=screen.floor);
  }
  assert.ok(campaigns.every(c=>available(s,c)>=0));
 }
 const s=walk(initial('P1',{ranking:'price',matching:'partial'}));assert.ok(s.decisions.S1.find(r=>r.campaign==='C8').reasons.includes('match ต่ำกว่า 50%'));
});
test('controlled age and clothing pairs change only the intended target dimension',()=>{
 const get=id=>personas.find(p=>p.id===id);
 assert.equal(get('P1').age,get('P7').age);assert.equal(matched(campaigns[3],get('P1')),true);assert.equal(matched(campaigns[3],get('P7')),false);
 assert.equal(matched(campaigns[1],get('P8')),false);
 assert.deepEqual(campaigns.map(c=>matched(c,get('P7'))),campaigns.map(c=>matched(c,get('P9'))));
 assert.equal(personas.length,10);assert.equal(new Set(personas.map(p=>p.id)).size,10);
});
