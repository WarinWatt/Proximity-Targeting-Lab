export const segments = {adult:'อายุ 20–59',senior:'อายุ 60–99',male:'Male (กำหนดไว้)',female:'Female (กำหนดไว้)',alone:'มาคนเดียว',long:'เสื้อแขนยาว',trousers:'กางเกงขายาว',shirt:'เสื้อยืด',dress:'เดรส',jacket:'แจ็กเก็ต',top:'เสื้อท่อนบน',skirt:'กระโปรง'};
export const personas = [
 {id:'P1',name:'เอ',age:26,legacy:'25–32',tags:['adult','male','alone','long','trousers']},
 {id:'P2',name:'บี',age:30,legacy:'25–32',tags:['adult','female','alone','shirt','trousers']},
 {id:'P3',name:'ซี',age:40,legacy:'38–43',tags:['adult','female','alone','dress']},
 {id:'P4',name:'ดี',age:65,legacy:'60–100',tags:['senior','male','alone','jacket','trousers']},
 {id:'P5',name:'อี',age:22,legacy:'ไม่อยู่ในช่วง label ที่ระบุไว้',tags:['adult','female','alone','top','skirt']},
 {id:'P6',name:'เอฟ',age:26,legacy:'25–32',tags:['adult','female','alone','long','trousers']},
 {id:'P7',name:'จี',age:26,legacy:'25–32',tags:['adult','male','alone','shirt','trousers']},
 {id:'P8',name:'เอช',age:65,legacy:'60–100',tags:['senior','male','alone','long','trousers']},
 {id:'P9',name:'ไอ',age:30,legacy:'25–32',tags:['adult','male','alone','shirt','trousers']},
 {id:'P10',name:'เจ',age:30,legacy:'25–32',tags:['adult','female','alone','long','trousers']}
];
export const screens = [
 {id:'S1',camera:'CAM1',name:'ประตูทางเข้า',zone:'entrance',floor:1200},
 {id:'S2',camera:'CAM2',name:'โถงยอดนิยม',zone:'popular',floor:1900},
 {id:'S3',camera:'CAM3',name:'หน้าร้านค้า',zone:'shops',floor:800},
 {id:'S4',camera:'CAM4',name:'ทางเดิน',zone:'walkway',floor:600},
 {id:'S5',camera:'CAM5',name:'ทางออก',zone:'exit',floor:400}
];
export const campaigns = [
 {id:'C1',owner:'ร้าน A',title:'Everyday Set',art:0,target:['trousers'],rule:'ANY',exclude:[],zones:screens.map(s=>s.zone),bid:1600,budget:20000,cache:['S1','S2','S3','S4','S5']},
 {id:'C2',owner:'ร้าน B',title:'Modern Collection',art:1,target:['adult'],rule:'ANY',exclude:[],zones:screens.map(s=>s.zone),bid:2000,budget:4500,cache:['S1','S2','S3']},
 {id:'C3',owner:'ร้าน C',title:'Dress Collection',art:2,target:['dress','skirt'],rule:'ANY',exclude:[],zones:screens.map(s=>s.zone),bid:2100,budget:20000,cache:['S1','S2','S3','S4','S5']},
 {id:'C4',owner:'ร้าน A',title:'Layer Collection',art:3,target:['jacket','long'],rule:'ANY',exclude:[],zones:screens.map(s=>s.zone),bid:1800,budget:20000,cache:['S1','S2','S4','S5']},
 {id:'C5',owner:'ร้าน B',title:'Mix & Match',art:4,target:['adult','top'],rule:'ALL',exclude:[],zones:screens.map(s=>s.zone),bid:2200,budget:20000,cache:['S1','S3','S4','S5']},
 {id:'C6',owner:'ร้าน D',title:'Exact Everyday',art:0,target:['adult','long','trousers'],rule:'ALL',exclude:[],zones:screens.map(s=>s.zone),bid:2100,budget:20000,cache:['S1','S2','S4','S5']},
 {id:'C7',owner:'ร้าน E',title:'High Bid Casual',art:1,target:['adult','shirt','trousers'],rule:'ALL',exclude:[],zones:screens.map(s=>s.zone),bid:2800,budget:20000,cache:['S1','S2','S3','S4','S5']},
 {id:'C8',owner:'ร้าน F',title:'Senior Layers',art:3,target:['senior','jacket','trousers'],rule:'ALL',exclude:[],zones:screens.map(s=>s.zone),bid:3300,budget:20000,cache:['S1','S2','S3','S4','S5']}
];
export function initial(personaId='P1',auction={ranking:'price',matching:'full'}){return {personaId,auction:{...auction},visitors:[],observations:[],step:0,spent:{},current:{},plans:{},decisions:{},round:0,log:[]};}
export function held(state,id){return [...Object.values(state.plans),...Object.values(state.current)].filter(x=>x?.campaign===id).reduce((n,x)=>n+x.price,0);}
export function available(state,c){return c.budget-(state.spent[c.id]||0)-held(state,c.id);}
export const campaignGenders={C1:'all',C2:'male',C3:'female',C4:'all',C5:'female',C6:'male',C7:'all',C8:'all'};
for(const c of campaigns)c.gender=campaignGenders[c.id];
export function matched(c,visitor){return (!c.gender||c.gender==='all'||visitor.tags.includes(c.gender))&&!c.exclude.some(t=>visitor.tags.includes(t))&&(c.rule==='ALL'?c.target.every(t=>visitor.tags.includes(t)):c.target.some(t=>visitor.tags.includes(t)));}
export function matchDetails(c,visitor){
 const targets=[...new Set(c.target)],hits=targets.filter(t=>visitor.tags.includes(t)),missing=targets.filter(t=>!visitor.tags.includes(t));
 const genderOK=!c.gender||c.gender==='all'||visitor.tags.includes(c.gender),excluded=c.exclude.some(t=>visitor.tags.includes(t));
 // ANY is one alternative group; matching one alternative satisfies the whole group.
 const numerator=c.rule==='ANY'?Number(hits.length>0):hits.length,denominator=c.rule==='ANY'?1:targets.length;
 const ratio=denominator?numerator/denominator:1;
 return {hits,missing,genderOK,excluded,numerator,denominator,ratio,kind:ratio===1?'Full':ratio>0?'Partial':'No match'};
}
export function rankingScore(bidMinor,ratio,ranking){return bidMinor/100*(ranking==='match_price'?ratio:1);}
export function compareCandidates(a,b){
 const weighted=a.auction.ranking==='match_price';
 const an=weighted?a.match.numerator:1,ad=weighted?a.match.denominator||1:1;
 const bn=weighted?b.match.numerator:1,bd=weighted?b.match.denominator||1:1;
 // Compare rational scores before display rounding; all fixture money is integer minor units.
 const scoreOrder=b.bid*bn*ad-a.bid*an*bd;
 const matchOrder=b.match.numerator*(a.match.denominator||1)-a.match.numerator*(b.match.denominator||1);
 return scoreOrder||matchOrder||b.bid-a.bid||a.campaign.localeCompare(b.campaign);
}
export function decide(state,mode='independent',screenIds=screens.map(s=>s.id)){
 state.round++;for(const id of screenIds)delete state.plans[id];const used=new Set(Object.values(state.plans).map(p=>p.campaign).filter(Boolean));
 for(const screen of screens.filter(s=>screenIds.includes(s.id))){
  const audience=state.visitors.filter(v=>v.zone==='all'||v.zone===screen.zone);
  const rows=campaigns.map(c=>{
   const threshold=state.auction.matching==='partial'?0.5:1;
   const details=audience.map(v=>({id:v.id,...matchDetails(c,v)}));
   const admitted=details.filter(d=>d.genderOK&&!d.excluded&&d.ratio>=threshold);
   const people=[...new Set(admitted.map(d=>d.id))];
   const match=[...admitted,...details].sort((a,b)=>Number(b.genderOK&&!b.excluded)-Number(a.genderOK&&!a.excluded)||b.ratio-a.ratio)[0]||{hits:[],missing:c.target,genderOK:false,excluded:false,numerator:0,denominator:c.rule==='ANY'?1:c.target.length,ratio:0,kind:'No match'};
   const budget=available(state,c);const ready=c.cache.includes(screen.id);const reasons=[];
   if(!c.zones.includes(screen.zone))reasons.push('ไม่เลือก location นี้');
   if(!people.length)reasons.push(!audience.length?'ยังไม่มีผู้ชม':!match.genderOK?'เพศไม่ตรงกลุ่มเป้าหมาย':match.excluded?'ตรงเงื่อนไขยกเว้น':state.auction.matching==='full'?'ต้อง match ครบทุกเงื่อนไข':'match ต่ำกว่า 50%');
   if(c.bid<screen.floor)reasons.push('bid ต่ำกว่าราคาขั้นต่ำ');
   if(!ready)reasons.push('cache ไม่พร้อม');
   if(budget<c.bid)reasons.push('งบคงเหลือไม่พอ');
   if(mode==='unique'&&used.has(c.id))reasons.push('ถูกเลือกที่จออื่นแล้ว');
   return {campaign:c.id,people,budget,ready,reasons,bid:c.bid,match,score:rankingScore(c.bid,match.ratio,state.auction.ranking),auction:{...state.auction}};
  });
  const eligible=rows.filter(r=>!r.reasons.length).sort(compareCandidates);const winner=eligible[0];
  for(const [i,r] of eligible.entries()){r.rank=i+1;r.result=r===winner?'ชนะ · กันงบแล้ว':'ผ่านเกณฑ์ · แพ้คะแนน / ลำดับตัดสิน';}
  if(winner){state.plans[screen.id]={campaign:winner.campaign,price:winner.bid,round:state.round,score:winner.score,matchRatio:winner.match.ratio,matchKind:winner.match.kind};used.add(winner.campaign);}
  else state.plans[screen.id]={campaign:null,price:0,round:state.round};
  state.decisions[screen.id]=rows;
 }
 state.log.unshift(`รอบ ${state.round}: ประเมิน ${screenIds.join(', ')} · คืนงบคิวเดิมเฉพาะจอที่ประเมิน แล้วกันงบคิวใหม่`);
 return state;
}
export function walk(state,mode='independent'){
 if(state.step>=screens.length)return state;
 const screen=screens[state.step],p=personas.find(p=>p.id===state.personaId);
 state.visitors=[{id:p.id,zone:screen.zone,tags:p.tags}];
 state.observations.push({id:'E'+(state.step+1),personId:p.id,camera:screen.camera,screen:screen.id,second:state.step*10});state.step++;
 return decide(state,mode,[screen.id]);
}
export function advance(state){
 for(const s of screens){const old=state.current[s.id];if(old?.campaign){state.spent[old.campaign]=(state.spent[old.campaign]||0)+old.price;state.log.unshift(`${s.id}: ยืนยันเล่นจบ ${old.campaign} · บันทึกค่าใช้จ่ายจำลอง ${(old.price/100).toFixed(2)} บาท`);}state.current[s.id]=state.plans[s.id]||{campaign:null,price:0};}
 state.plans={};state.log.unshift('ถึงขอบคลิป 15 วินาที: เปลี่ยนทุกจอไปคิวถัดไป ไม่มีการตัดกลางคลิป');return state;
}
