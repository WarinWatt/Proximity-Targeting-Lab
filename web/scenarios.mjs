import {campaigns,personas,screens,initial,decide} from './engine.mjs';

export const scenarios = [
 ['overlap','หลายคน / หลายคุณลักษณะซ้อนกัน','ผู้ชมต่างเพศและเสื้อผ้าแข่งขันพร้อมกันทั้ง 5 จอ'],
 ['budget','งบร่วมใกล้หมด','campaign ที่ bid สูงมีงบพอเพียงหนึ่งจอ จอถัดไปต้องเลือกผู้เสนอรายอื่น'],
 ['cache','ไฟล์พร้อมต่างกัน','campaign ราคาแพง cache พร้อมเฉพาะสองจอ'],
 ['partial','Partial match แข่งกับราคา','เปรียบเทียบความตรง 2/3 กับ full match และ bid ที่ต่างกัน'],
 ['floor','Popular zone ราคาขั้นต่ำสูง','จอยอดนิยมมีราคาขั้นต่ำสูงกว่าบาง campaign'],
 ['empty','ไม่พบผู้ชม','ไม่มีผู้ชมทุกจอ ต้องแสดง content สำรองโดยไม่คิดเงิน'],
 ['excluded','ข้อยกเว้นบังคับ','campaign ราคาสูงยกเว้นเสื้อแขนยาว ราคาไม่สามารถข้ามเงื่อนไขได้'],
 ['engagement','ขอบเขต engagement','ทดสอบมอง 0, 7.5, 7.6, 12 และ 15 วินาที จากคลิป 15 วินาที'],
 ['failed','เล่นไม่สำเร็จ / หลักฐานไม่พอ','จำลอง playback ล้มเหลวและความมั่นใจการมองต่ำ'],
 ['stress','ฝูงชน 50 คน / 16 campaign','หลายเป้าหมาย งบจำกัด cache ต่างกัน และ content A/B']
].map(([id,title,description])=>({id,title,description}));

export function runScenario(id){
 if(!scenarios.some(s=>s.id===id))throw new Error('Unknown scenario');
 const saved=structuredClone(campaigns),floors=screens.map(s=>s.floor);
 try{
  if(id==='budget')campaigns.forEach(c=>{c.budget=c.bid+Math.round(c.bid*0.25);});
  if(id==='cache')campaigns.forEach((c,i)=>{c.cache=i%2?['S1','S3']:['S2','S4','S5'];});
  if(id==='floor')screens[1].floor=3000;
  if(id==='excluded')campaigns.forEach(c=>{c.bid+=4000;c.exclude=['long'];});
  if(id==='stress')campaigns.push(...saved.map((c,i)=>({...structuredClone(c),id:'X'+i,title:c.title+' B',bid:c.bid+300,budget:5000,cache:i%2?['S1','S3','S5']:['S2','S4']})));
  const state=initial('P1',{matching:'partial',ranking:'match_price'});
  state.visitors=id==='empty'?[]:Array.from({length:id==='stress'?50:id==='partial'?1:10},(_,i)=>({id:'V'+i,zone:'all',tags:personas[i%personas.length].tags}));
  const budgets=Object.fromEntries(campaigns.map(c=>[c.id,c.budget]));
  const spent={},reserved={};
  const snapshot=()=>Object.fromEntries(campaigns.map(c=>[c.id,{
   budget:budgets[c.id],spent:spent[c.id]||0,reserved:reserved[c.id]||0,
   available:budgets[c.id]-(spent[c.id]||0)-(reserved[c.id]||0)
  }]));
  const rows=screens.map((screen,i)=>{
   const before=snapshot();
   // The engine holds base bids; account for both earlier and prospective
   // premiums without changing its ranking or matching rules.
   campaigns.forEach(c=>{c.budget=budgets[c.id]-Math.round(c.bid*0.25);});
   try{decide(state,'independent',[screen.id]);}
   finally{campaigns.forEach(c=>{c.budget=budgets[c.id];});}
   const plan=state.plans[screen.id],c=campaigns.find(c=>c.id===plan.campaign);
   const seconds=[0,7.5,7.6,12,15][i],confirmed=!(id==='failed'&&i===0),confidence=id==='failed'&&i===1?0.4:0.95;
   const stopped=!(id==='failed'&&i===2),gaze=seconds>0,threshold=7.5;
   const reservation=c?plan.price+Math.round(plan.price*0.25):0;
   if(c){reserved[c.id]=(reserved[c.id]||0)+reservation;state.spent[c.id]=(state.spent[c.id]||0)+Math.round(plan.price*0.25);}
   const base=c&&confirmed?plan.price:0,premium=c&&confirmed&&stopped&&gaze&&seconds>threshold&&confidence>=0.8?Math.round(plan.price*0.25):0;
   return {screen:screen.id,winner:c?.id||'สำรอง',variant:i%2?'B':'A',match:plan.matchRatio||0,seconds,confidence,confirmed,stopped,gaze,threshold,reservation,before,after:snapshot(),base,premium,total:base+premium,reasons:state.decisions[screen.id].map(r=>({campaign:r.campaign,score:r.score,reasons:r.reasons,result:r.result}))};
  });
  for(const row of rows){
   row.beforeSettlement=snapshot();
   if(row.reservation){reserved[row.winner]-=row.reservation;spent[row.winner]=(spent[row.winner]||0)+row.total;}
   row.afterSettlement=snapshot();
  }
  return {id,visitors:state.visitors.length,campaignCount:campaigns.length,rows,budgets:snapshot(),total:rows.reduce((n,r)=>n+r.total,0)};
 }finally{campaigns.splice(0,campaigns.length,...saved);screens.forEach((s,i)=>{s.floor=floors[i];});}
}

export function mountScenarios(){
 if(typeof document.createElement!=='function')return;
 const section=document.createElement('section');
 section.innerHTML='<h2>สถานการณ์จำลองขั้นสูง</h2><p>ข้อมูลจำลองเท่านั้น · 5 จอใช้งบร่วม · first-price × match · ค่า engagement เพิ่ม 25% เมื่อมองเกิน 7.5 วินาทีและความมั่นใจ ≥ 80% · A/B กำหนดเพื่อทดสอบ ไม่มีการเรียกเก็บเงินจริง</p><label>เลือกกรณี <select id="scenario-select"></select></label> <button id="scenario-run">รันสถานการณ์ใหม่</button><p id="scenario-description"></p><div id="scenario-results" aria-live="polite"></div>';
 document.querySelector('main').prepend(section);
 const select=section.querySelector('select');select.replaceChildren(...scenarios.map(s=>new Option(s.title,s.id)));
 const render=()=>{
  const s=scenarios.find(s=>s.id===select.value),result=runScenario(s.id),money=n=>'฿'+(n/100).toFixed(2);
  section.querySelector('#scenario-description').textContent=s.description+' · ผู้ชม '+result.visitors+' คน · '+result.campaignCount+' campaign';
  section.querySelector('#scenario-results').innerHTML='<div class="scroll"><table><thead><tr><th>จอ</th><th>ผู้ชนะ / A-B</th><th>Match</th><th>มอง / 15s</th><th>เล่นยืนยัน</th><th>ค่าเล่น</th><th>Engagement</th><th>รวม</th></tr></thead><tbody>'+result.rows.map(r=>`<tr><td>${r.screen}</td><td>${r.winner} / ${r.variant}</td><td>${(r.match*100).toFixed(1)}%</td><td>${r.seconds}s · ${(r.confidence*100).toFixed(0)}%</td><td>${r.confirmed?'สำเร็จ':'ล้มเหลว'}</td><td>${money(r.base)}</td><td>${money(r.premium)}</td><td>${money(r.total)}</td></tr>`).join('')+'</tbody></table></div><p>ยอดรวมจำลอง '+money(result.total)+'</p><details><summary>เหตุผลราย campaign ของทุกจอ</summary><pre></pre></details>';
  section.querySelector('pre').textContent=JSON.stringify(result.rows.map(r=>({screen:r.screen,stopped:r.stopped,gaze:r.gaze,threshold:r.threshold,reservation:r.reservation,before:r.before,after:r.after,beforeSettlement:r.beforeSettlement,afterSettlement:r.afterSettlement,candidates:r.reasons})),null,2);
 };select.onchange=render;section.querySelector('button').onclick=render;render();
}
