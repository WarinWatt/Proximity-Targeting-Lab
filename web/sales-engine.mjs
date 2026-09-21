import {campaigns,screens,matchDetails,personas} from './engine.mjs';
export function validate(c){
 if(!c.name.trim()||!c.owner.trim())throw Error('กรอกชื่อ campaign และเจ้าของ');
 if(!Number.isSafeInteger(c.budget)||c.budget<=0)throw Error('งบต้องมากกว่า 0');
 if(c.artA===c.artB||![c.artA,c.artB].every(x=>Number.isInteger(x)&&x>=0&&x<5))throw Error('เลือก content A และ B คนละชิ้น');
 if(!c.target.length)throw Error('เลือก target อย่างน้อยหนึ่งข้อ');
 if(!screens.some(s=>c.bids[s.id]>0))throw Error('เลือกจออย่างน้อยหนึ่งจอ');
 for(const s of screens)if(!Number.isSafeInteger(c.bids[s.id])||c.bids[s.id]<0)throw Error('ราคาไม่ถูกต้อง');
 for(const s of screens)if(!Number.isSafeInteger(c.premiums?.[s.id]??0)||(c.premiums?.[s.id]??0)<0)throw Error('ค่ามองเพิ่มไม่ถูกต้อง');
 return c;
}
export function refunded(events){return events.reduce((n,e)=>n+(e.refund||0),0);}
export function charged(events){return events.filter(e=>e.status==='completed').reduce((n,e)=>n+e.price,0);}
export function spent(events){return charged(events)-refunded(events);}
export function held(events){return events.filter(e=>e.status==='reserved').reduce((n,e)=>n+e.maxCharge,0);}
export function auction(c,events,screenId,personId,random){
 validate(c);const screen=screens.find(s=>s.id===screenId),person=personas.find(p=>p.id===personId);if(!screen||!person)throw Error('ไม่พบจอหรือคนจำลอง');
 const candidate={...c,id:'YOUR',title:c.name,bid:c.bids[screenId],rule:'ALL',exclude:[]};
 const rows=[candidate,...campaigns].map(x=>{
  const m=matchDetails(x,person),bid=x.bid;const reasons=[];
  if(!m.genderOK||m.ratio<.5)reasons.push('target ไม่ผ่าน');
  if(x.id==='YOUR'&&!bid)reasons.push('ไม่ได้เลือกจอ');
  if(bid<screen.floor)reasons.push('ต่ำกว่า floor');
  if(x.id==='YOUR'&&c.budget-spent(events)-held(events)<bid+(c.premiums?.[screenId]??0))reasons.push('งบไม่พอสำหรับยอดสูงสุดสองชั้น');
  return {id:x.id,title:x.title,bid,match:m.ratio,score:bid*m.ratio,reasons};
 }).sort((a,b)=>b.score-a.score||b.match-a.match||b.bid-a.bid||a.id.localeCompare(b.id));
 const winner=rows.find(r=>!r.reasons.length);
 if(winner?.id!=='YOUR')return {rows,winner,event:null};
 const r=random();if(!Number.isFinite(r)||r<0||r>=1)throw Error('invalid random value');
 const variant=r<.5?'A':'B';const event={id:events.length+1,screen:screenId,person:personId,variant,art:variant==='A'?c.artA:c.artB,price:winner.bid,status:'reserved',viewed:false};
 event.basePrice=winner.bid;event.premium=c.premiums?.[screenId]??0;event.maxCharge=event.basePrice+event.premium;event.clipLength=15;event.watchSeconds=0;event.stopped=false;event.attentionCharge=0;
 const match=matchDetails(candidate,person);
 event.evidence=Object.freeze({source:'simulated-persona',capturedAt:new Date().toISOString(),person:person.id,name:person.name,age:person.age,tags:Object.freeze([...person.tags]),panel:personas.indexOf(person),screen:screen.name,campaign:c.name,owner:c.owner,target:Object.freeze([...c.target]),gender:c.gender,match:match.ratio,hits:Object.freeze([...match.hits]),missing:Object.freeze([...match.missing]),floor:screen.floor});
 event.customer=c.customer?Object.freeze({...c.customer}):null;
 event.review='pending';event.refund=0;event.audit=[{at:event.evidence.capturedAt,action:'reserve',amount:event.maxCharge}];
 events.push(event);return {rows,winner,event};
}
export function settle(event,status){if(!event||event.status!=='reserved'||!['completed','cancelled'].includes(status))return false;event.status=status;
 if(status==='completed'){event.attentionCharge=event.viewed?event.premium:0;event.price=event.basePrice+event.attentionCharge;event.audit.push({at:new Date().toISOString(),action:'charge',amount:event.price,base:event.basePrice,attention:event.attentionCharge});if(event.maxCharge>event.price)event.audit.push({at:new Date().toISOString(),action:'release-unused-attention',amount:event.maxCharge-event.price});}
 else event.audit.push({at:new Date().toISOString(),action:'release',amount:event.maxCharge});return true;}
export function recordView(event,seconds=0,stopped=false){if(!event||event.status!=='reserved')return false;if(!Number.isFinite(seconds)||seconds<0||seconds>event.clipLength)throw Error('เวลามองต้องอยู่ระหว่าง 0 ถึงความยาวคลิป');event.watchSeconds=seconds;event.stopped=stopped===true;event.viewed=event.stopped&&seconds>event.clipLength/2;event.audit.push({at:new Date().toISOString(),action:'simulated-attention',amount:0,seconds,stopped:event.stopped});return event.viewed;}
export function review(event,decision,reason=''){
 if(!event||event.status!=='completed'||event.review==='rejected'||!['approve','reject'].includes(decision))return false;
 if(decision==='approve'){if(event.status!=='completed'||event.review==='approved')return false;event.review='approved';}
 else{if(!reason.trim())throw Error('ระบุเหตุผลที่ reject ก่อน');
  event.refund=event.price;
  event.review='rejected';event.reason=reason.trim();
 }
 event.audit.push({at:new Date().toISOString(),action:decision==='approve'?'approve':'reject-refund',amount:decision==='reject'?event.refund:0,reason:reason.trim(),actor:'ผู้ตรวจจำลอง'});return true;
}
export function metrics(events,variant,screen){const list=events.filter(e=>e.variant===variant&&(!screen||e.screen===screen));const complete=list.filter(e=>e.status==='completed'&&e.review!=='rejected');return {assigned:list.length,completed:complete.length,views:complete.filter(e=>e.viewed).length,cost:spent(list),cancelled:list.filter(e=>e.status==='cancelled').length};}
