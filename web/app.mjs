import {segments,personas,screens,campaigns,initial,held,available,matched,walk,advance} from './engine.mjs?v=4';

import {mountComparison} from './comparison.mjs?v=4';
import {mountScenarios} from './scenarios.mjs';
mountScenarios();
const genderText=c=>c.gender==='all'?'ทุกเพศ':segments[c.gender];
const $=id=>document.getElementById(id),money=n=>'฿'+(n/100).toFixed(2),campaign=id=>campaigns.find(c=>c.id===id),tags=list=>list.map(t=>'<span class="tag">'+segments[t]+'</span>').join('');
const art=(i,type='person')=>'<span class="atlas '+type+(type==='person'&&i>=5?' overlap':'')+'" style="--panel:'+(i%5)+'" role="img" aria-label="ภาพ'+(type==='person'?'ตัวละคร':'โฆษณา')+'จำลอง '+(i+1)+'"></span>';
$('matching').value='partial';$('ranking').value='match_price';
const auctionOptions=()=>({matching:$('matching').value,ranking:$('ranking').value});
let state=initial('P1',auctionOptions());
$('inspect').innerHTML=screens.map(s=>'<option value="'+s.id+'">'+s.id+' · '+s.name+'</option>').join('');
function render(){
 const p=personas.find(x=>x.id===state.personaId),index=personas.indexOf(p);
 $('personas').innerHTML=personas.map((x,i)=>'<button class="persona" data-person="'+x.id+'" aria-pressed="'+(p.id===x.id)+'">'+art(i)+'<b>'+x.id+' · '+x.name+' · '+x.age+' ปี · '+(x.tags.includes('male')?'ชาย':'หญิง')+'</b><span>'+x.tags.filter(t=>!['adult','senior','alone','male','female'].includes(t)).map(t=>segments[t]).join(' + ')+'</span></button>').join('');
 $('selected').innerHTML='<b>เลือก '+p.id+' · '+p.name+'</b> '+tags(p.tags)+'<br><small>ช่วงอายุในรายงานเดิม: '+p.legacy+' · Overlap คือคนเดียวตรงได้หลายเงื่อนไข ไม่ใช่หลายคน</small>';
 $('route').innerHTML=screens.map((s,i)=>'<div class="stop '+(i<state.step?'visited':'')+'"><strong>'+s.camera+'</strong><span>'+s.name+'</span>'+(i===state.step-1?art(index):'<span class="route-status">'+(i<state.step?'✓ ผ่านแล้ว':'รอเดินผ่าน')+'</span>')+'<small>'+(i<state.step?p.id+' · t='+i*10+'s':'→ '+s.id)+'</small></div>').join('');
 $('count').textContent='คนไม่ซ้ำ '+new Set(state.observations.map(e=>e.personId)).size+' คน / เหตุการณ์ตรวจพบ '+state.observations.length+' ครั้ง / กล้องที่ผ่าน '+state.step+' จาก 5';
 $('walk').disabled=state.step===5;$('all').disabled=state.step===5;$('walk').textContent=state.step===5?'เดินครบแล้ว':'เดินไปกล้อง '+(state.step+1)+' →';
 $('screens').innerHTML=screens.map(s=>{const now=campaign(state.current[s.id]?.campaign),next=state.plans[s.id],c=campaign(next?.campaign);return '<article class="screen"><div class="screen-head"><b>'+s.id+' · '+s.name+'</b></div><div class="display">'+(now?art(now.art,'ad'):'')+'<small>กำลังแสดง</small><b>'+(now?.title||'ยินดีต้อนรับ')+'</b></div><div class="next">'+(c?art(c.art,'ad'):'')+'<span>คิวถัดไป</span><b>'+(next?c?.title||'ข้อความต้อนรับฟรี':'รอกล้องตรวจพบ')+'</b><small>'+(c?c.owner+' · '+money(next.price):'ไม่คิดค่าใช้จ่าย')+'</small>'+(c?'<p>'+next.matchKind+' '+(next.matchRatio*100).toFixed(1)+'% · คะแนน '+next.score.toFixed(2)+'</p>':'')+'<p>ขั้นต่ำพื้นที่ '+money(s.floor)+'</p><button data-inspect="'+s.id+'">ดูเหตุผล</button></div></article>';}).join('');
 $('budgets').innerHTML=campaigns.map(c=>'<tr><td>'+c.id+' · '+c.owner+'</td><td>'+money(c.budget)+'</td><td>'+money(held(state,c.id))+'</td><td>'+money(state.spent[c.id]||0)+'</td><td>'+money(available(state,c))+'</td></tr>').join('');
 $('content-library').innerHTML=campaigns.map(c=>'<article class="content-card">'+art(c.art,'ad')+'<b>'+c.id+' · '+c.title+'</b><p>'+c.owner+' · '+money(c.bid)+'/15 วินาที</p><p>'+(c.rule==='ALL'?'ต้องตรงทุกข้อ':'ตรงข้อใดข้อหนึ่ง')+': '+tags(c.target)+'</p><p>เพศ: '+genderText(c)+'</p><small>พร้อม: '+c.cache.join(', ')+'</small></article>').join('');
 $('events').innerHTML=state.observations.map(e=>'<tr><td>'+e.id+'</td><td>'+e.second+' วินาที</td><td>'+e.personId+'</td><td>'+e.camera+' → '+e.screen+'</td></tr>').join('')||'<tr><td colspan="4">ยังไม่มีเหตุการณ์</td></tr>';
 $('log').innerHTML=state.log.slice(0,60).map(l=>'<li>'+l+'</li>').join('');renderCandidates();
}
function renderCandidates(){
 const s=screens.find(s=>s.id===$('inspect').value),rows=state.decisions[s.id]||[],p=personas.find(x=>x.id===state.personaId),winner=rows.find(r=>r.rank===1),policy=rows[0]?.auction||state.auction;
 const admitted=rows.filter(r=>r.people.length);
 $('explanation').textContent=!rows.length?'ยังไม่ผ่านกล้องนี้ — กดเดินผ่านกล้องก่อน':p.id+' คนเดียวผ่านเกณฑ์ match '+admitted.length+' แคมเปญ → '+(winner?campaign(winner.campaign).title+' ชนะด้วยคะแนน '+winner.score.toFixed(2):'ไม่มีผู้ผ่านทุกเงื่อนไข ใช้ข้อความต้อนรับฟรี')+' · ผล ณ ตอน '+s.camera+' พบคน';
 $('candidates').innerHTML=[...rows].sort((a,b)=>(a.rank||999)-(b.rank||999)).map(r=>{
 const c=campaign(r.campaign),m=r.match,checks=c.target.map(t=>'<span class="tag">'+(m.hits.includes(t)?'✓ ':'✕ ')+segments[t]+'</span>').join('');
 return '<tr class="'+(r.rank===1?'win':'')+'"><td>'+c.id+' · '+c.title+'<small>'+c.owner+'</small></td><td>เพศ: '+genderText(c)+'<br>'+c.rule+' '+checks+'</td><td><b>'+m.kind+' '+(m.ratio*100).toFixed(1)+'%</b><small>'+m.numerator+'/'+m.denominator+(m.genderOK?' · เพศผ่าน':' · เพศไม่ผ่าน')+'</small></td><td>'+money(r.bid)+'</td><td>'+(r.reasons.length?'—<small>ไม่เข้าจัดอันดับ</small>':'<b>'+r.score.toFixed(2)+'</b><small>อันดับ '+r.rank+'</small>')+'</td><td>'+money(s.floor)+'</td><td>'+money(r.budget)+'</td><td>'+(r.ready?'พร้อม':'ยังไม่พร้อม')+'</td><td>'+(r.reasons.join(' · ')||r.result)+'</td></tr>';
 }).join('')||'<tr><td colspan="9">รอเหตุการณ์จากกล้อง</td></tr>';
 $('formula-policy').textContent='เกณฑ์รอบนี้: '+(policy.matching==='partial'?'รับ Full และ Partial ที่ M ≥ 50%':'รับ Full เท่านั้น M = 100%')+' | '+(policy.ranking==='match_price'?'Score = Bid (บาท) × M':'Score = Bid (บาท); ใช้ M คัดผู้เข้าแข่ง แต่ไม่คูณคะแนน');
 $('formula-example').textContent=winner?'แทนค่าผู้ชนะ '+winner.campaign+': '+money(winner.bid)+(policy.ranking==='match_price'?' × '+winner.match.numerator+'/'+winner.match.denominator:'')+' = '+winner.score.toFixed(2)+' คะแนน · กันเงิน '+money(winner.bid)+' (คิดตามราคาเสนอ ไม่ลดตาม % match)':'ลอง P1: C6 ตรง 3/3 เสนอ ฿21 → 21 คะแนน; C7 ตรง 2/3 เสนอ ฿28 → 18.67 คะแนน ในโหมด Match × ราคา · สลับเป็นราคาอย่างเดียวเพื่อดู C7 ชนะที่ CAM1 เมื่อเปิด Partial';
}
function reset(id=state.personaId){state=initial(id,auctionOptions());render();}
function step(){walk(state,$('mode').value);$('inspect').value=screens[state.step-1]?.id||'S1';render();}
$('personas').onclick=e=>{const b=e.target.closest('[data-person]');if(b){reset(b.dataset.person);$('personas').querySelector('[data-person="'+b.dataset.person+'"]').focus();}};
$('walk').onclick=step;$('all').onclick=()=>{while(state.step<5)walk(state,$('mode').value);$('inspect').value='S5';render();};
$('matching').onchange=()=>reset();$('ranking').onchange=()=>reset();$('reset').onclick=()=>reset();$('mode').onchange=()=>reset();$('advance').onclick=()=>{advance(state);render();};$('inspect').onchange=renderCandidates;
$('screens').onclick=e=>{const b=e.target.closest('[data-inspect]');if(b){$('inspect').value=b.dataset.inspect;renderCandidates();$('inspect').scrollIntoView({block:'center'});}};
mountComparison($,art,reset);render();
