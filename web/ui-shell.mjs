import './page-report.mjs';
import {getSession} from './session-client.mjs';

const page=location.pathname.split('/').pop()||'index.html';
const modes={
 'advertiser.html':['pilot','แคมเปญของฉัน · นำร่อง'],
 'index.html':['simulated','ข้อมูลจำลอง'],
 'audience-dashboard.html':['simulated','ข้อมูลจำลอง'],
 'campaigns.html':['simulated','ข้อมูลจำลอง'],
 'operator.html':['simulated','ข้อมูลจำลอง'],
 'single-screen.html':['pilot','นำร่อง · บันทึกจริง'],
 'backend-console.html':['pilot','ข้อมูลจริง · MariaDB'],
 'login.html':['pilot','ระบบบัญชีนำร่อง'],
 'owner.html':['pilot','ภาพรวมระบบนำร่อง'],
 'openpar.html':['research','ห้องวิจัยในเครื่อง'],
 'references.html':['research','เอกสารงานวิจัย'],
 'architecture.html':['research','สถาปัตยกรรมงานวิจัย']
};
const [mode,modeLabel]=modes[page]||['research','งานวิจัย'];document.body.dataset.dataMode=mode;
const publicResearch=[['index.html','จำลองการตัดสินใจ'],['audience-dashboard.html','ผู้ชมจำลอง'],['openpar.html','ห้องทดลองโมเดล'],['references.html','งานวิจัยอ้างอิง'],['architecture.html','สถาปัตยกรรม']];
const roleLinks={
 customer:[['advertiser.html','แคมเปญของฉัน'],['single-screen.html#purchase','สร้างแคมเปญ'],['advertiser.html','ผลการเล่นและบิล'],['campaigns.html','ทดลองราคา / A/B']],
 operator:[['operator.html','สถานีและอุปกรณ์'],['operator.html#incidents','เหตุขัดข้อง'],['single-screen.html','นำร่องจอเดียว'],['openpar.html','ตรวจโมเดลกล้อง']],
 reviewer:[['campaigns.html?view=review','คิวตรวจบิลและคืนเงิน'],['single-screen.html#evidence','หลักฐานการเล่น']],
 owner:[['owner.html','ภาพรวมระบบ'],['operator.html','สถานีและอุปกรณ์'],['campaigns.html?view=review','การเงินและข้อพิพาท'],['backend-console.html','ฐานข้อมูลขั้นสูง']]
};
function links(title,items){const block=document.createElement('div');const heading=document.createElement('p');heading.className='workspace-label';heading.textContent=title;const nav=document.createElement('nav');nav.className='app-nav';nav.setAttribute('aria-label',title);block.append(heading,nav);const current=page+location.search+location.hash;const exact=items.some(([href])=>href===current);let marked=false;for(const [href,label] of items){const a=document.createElement('a');a.href=href;a.textContent=label;if(!marked&&(exact?href===current:href===page)){a.setAttribute('aria-current','page');marked=true;}nav.append(a);}return block;}
function build(){
 const main=document.querySelector('main');
 if(!main||document.querySelector('.app-shell'))return;
 main.id=main.id||'main-content';main.tabIndex=-1;
 const shell=document.createElement('div');shell.className='app-shell';
 const top=document.createElement('header');top.className='app-topbar';
 top.innerHTML=`<button class="menu-toggle" type="button" aria-label="เปิดเมนู" aria-expanded="false" aria-controls="app-sidebar">☰</button><a class="app-brand" href="index.html"><span class="app-brand-mark">PTL</span><span>Proximity Targeting Lab</span></a><span class="data-mode ${mode}">${modeLabel}</span><span class="app-topbar-spacer"></span><span class="app-user">ผู้เยี่ยมชม</span><a href="login.html">เข้าสู่ระบบ</a>`;
 const side=document.createElement('aside');side.className='app-sidebar';side.id='app-sidebar';
 let workspace=links('พื้นที่ทำงาน',roleLinks.customer);side.append(workspace);
 side.append(links('ระบบและการดำเนินงาน',[['owner.html','ภาพรวมเจ้าของระบบ'],['operator.html','สถานีและอุปกรณ์'],['backend-console.html','ข้อมูลกลาง MariaDB']]));
 side.append(links('ห้องวิจัย',publicResearch));
 const content=document.createElement('div');content.className='app-content';
 main.parentNode.insertBefore(shell,main);shell.append(top,side,content);content.append(main);
 const skip=document.createElement('a');skip.className='skip-link';skip.href='#'+main.id;skip.textContent='ข้ามไปเนื้อหาหลัก';document.body.prepend(skip);
 const band=document.createElement('div');band.className=`trust-band ${mode==='pilot'?'pilot':''}`;
 band.textContent=mode==='simulated'?'ข้อมูลจำลองเพื่อการวิจัย — ไม่ใช่ข้อมูลผู้ชม การเล่น หรือยอดเรียกเก็บจริง':mode==='pilot'?'ระบบนำร่องที่บันทึกข้อมูล — ยังไม่ใช่ระบบ production และการตรวจจับเป้าหมายอาจเป็นข้อมูลจำลอง':'เนื้อหางานวิจัย — ตรวจข้อจำกัดของโมเดลและที่มาก่อนนำผลไปใช้';main.prepend(band);
 if(['openpar.html','single-screen.html'].includes(page)){const privacy=document.createElement('span');privacy.className='privacy-note';privacy.textContent='ตรวจนโยบายกล้องและการจัดเก็บข้อมูลก่อนใช้งาน';top.insertBefore(privacy,top.querySelector('.app-topbar-spacer'));}
 const toggle=top.querySelector('.menu-toggle'),mobile=matchMedia('(max-width: 900px)');
 function closeMenu(){side.classList.remove('open');toggle.setAttribute('aria-expanded','false');toggle.textContent='☰';side.inert=mobile.matches;}
 closeMenu();mobile.addEventListener('change',closeMenu);
 toggle.onclick=()=>{const open=side.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'×':'☰';side.inert=mobile.matches&&!open;};
 side.addEventListener('click',e=>{if(e.target.closest('a')&&mobile.matches)closeMenu();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&side.classList.contains('open')){closeMenu();toggle.focus();}});
 document.body.classList.add('ui-ready');
 return {setUser(user){
  const valid=user&&typeof user.username==='string'&&typeof user.role==='string';
  top.querySelector('.app-user').textContent=valid?`${user.username} · ${thaiRole(user.role)}`:'ผู้เยี่ยมชม';
  top.querySelector('a[href="login.html"]').textContent=valid?'บัญชี / ออกจากระบบ':'เข้าสู่ระบบ';
  const updated=links('พื้นที่ทำงาน',valid&&Object.hasOwn(roleLinks,user.role)?roleLinks[user.role]:roleLinks.customer);
  workspace.replaceWith(updated);workspace=updated;
 }};
}
function thaiRole(role){return ({customer:'ลูกค้า',operator:'ผู้ดูแลสถานี',reviewer:'ผู้ตรวจสอบ',owner:'เจ้าของระบบ'})[role]||role;}
const shell=build();
if(shell){
 getSession()
  .then(d=>d?.user||null)
  .catch(()=>null)
  .then(user=>shell.setUser(user));
}
