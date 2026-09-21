import {personas,campaigns,segments,matched} from './engine.mjs?v=4';
export const pairs=[
 ['P1','P6','26 ปี / เสื้อผ้าแบบเดียวกัน / ต่างเพศ'],
 ['P1','P7','26 ปี / ชายเหมือนกัน / ต่างเสื้อผ้า'],
 ['P1','P8','ชาย / เสื้อผ้าแบบเดียวกัน / ต่างช่วงอายุ'],
 ['P2','P9','30 ปี / เสื้อผ้าแบบเดียวกัน / ต่างเพศ'],
 ['P2','P10','30 ปี / หญิงเหมือนกัน / ต่างเสื้อผ้า'],
 ['P7','P9','26 กับ 30 ปี / ชาย / อายุอยู่ช่วงเดียวกัน']
];
export function mountComparison($,art,onSelect){
 $('pair').innerHTML=pairs.map((p,i)=>'<option value="'+i+'">'+p[2]+'</option>').join('');$('pair').value='0';
 function render(){
  const pair=pairs[Number($('pair').value)],people=pair.slice(0,2).map(id=>personas.find(p=>p.id===id));
  $('pair-people').innerHTML=people.map(p=>'<button class="persona" data-person="'+p.id+'">'+art(personas.indexOf(p))+'<b>'+p.id+' · '+p.name+' · '+p.age+' ปี · '+(p.tags.includes('male')?'ชาย':'หญิง')+'</b><span>'+p.tags.filter(t=>!['male','female','alone'].includes(t)).map(t=>segments[t]).join(' / ')+'</span></button>').join('');
  const common=people[0].tags.filter(t=>people[1].tags.includes(t)),a=people[0].tags.filter(t=>!common.includes(t)),b=people[1].tags.filter(t=>!common.includes(t));
  $('pair-summary').textContent='เหมือนกัน: '+common.map(t=>segments[t]).join(', ')+' | ต่างกัน: '+(a.length||b.length?people[0].id+' '+a.map(t=>segments[t]).join(', ')+' ↔ '+people[1].id+' '+b.map(t=>segments[t]).join(', '):'อายุจริง '+people[0].age+' กับ '+people[1].age+' ปี แต่ label ช่วงอายุเหมือนกัน จึงตรง target เหมือนกัน');
  $('pair-left').textContent=people[0].id;$('pair-right').textContent=people[1].id;
  $('pair-matches').innerHTML=campaigns.map(c=>'<tr><td>'+c.id+' · '+c.title+'</td><td>'+(c.gender==='all'?'ทุกเพศ':segments[c.gender])+'</td><td>'+c.rule+' '+c.target.map(t=>segments[t]).join(' / ')+'</td>'+people.map(p=>'<td>'+ (matched(c,p)?'✓ ตรง target':c.gender!=='all'&&!p.tags.includes(c.gender)?'ไม่ตรงเพศเป้าหมาย':'ไม่ตรงอายุ/เสื้อผ้า')+'</td>').join('')+'</tr>').join('');
 }
 $('pair').onchange=render;$('pair-people').onclick=e=>{const button=e.target.closest('[data-person]');if(button)onSelect(button.dataset.person);};render();
}
