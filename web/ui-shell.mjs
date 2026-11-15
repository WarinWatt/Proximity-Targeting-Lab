import {getSession} from './session-client.mjs';
// Version the stylesheet so CDN/browser caches receive the matching release styles.
for(const link of document.querySelectorAll('link[rel="stylesheet"]'))if(new URL(link.href).pathname.endsWith('/ui-shell.css'))link.href='ui-shell.css?v=20261115-accounts-1';

const page=location.pathname.split('/').pop()||'index.html';
const commercialPages=new Set(['portal.html','login.html','register.html','profile.html','users.html','advertiser.html','owner.html','caster.html','live-monitor.html','single-screen.html']);
const commercial=commercialPages.has(page);
document.body.classList.toggle('commercial',commercial);
if(!commercial)import('./page-report.mjs');
const modes={
 'register.html':['pilot','สร้างบัญชี'],
 'profile.html':['pilot','บัญชีของฉัน'],
 'users.html':['pilot','จัดการผู้ใช้'],
 'caster.html':['pilot','สถานีและจอ'],
 'live-monitor.html':['pilot','ติดตามการแสดงผล'],
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
 customer:[['advertiser.html','แคมเปญของฉัน'],['advertiser.html#purchase','ซื้อแคมเปญ']],
 operator:[['caster.html','สถานีและจอของฉัน'],['live-monitor.html','ติดตามการแสดงผล']],
 reviewer:[['single-screen.html','ตรวจสอบการแสดงผลและบิล']],
 owner:[['owner.html','ภาพรวมระบบ'],['caster.html','สถานีและจอ'],['live-monitor.html','ติดตามการแสดงผล'],['users.html','จัดการผู้ใช้']]
};
const entryLinks=[['login.html?next=advertiser','Ads Owner'],['login.html?next=owner','System Owner'],['login.html?next=caster','Station Operator'],['login.html?next=live-monitor','Live Monitor'],['register.html','สร้างบัญชีเจ้าของโฆษณา']];
function links(title,items){const block=document.createElement('div');const heading=document.createElement('p');heading.className='workspace-label';heading.textContent=title;const nav=document.createElement('nav');nav.className='app-nav';nav.setAttribute('aria-label',title);block.append(heading,nav);const current=page+location.search+location.hash;const exact=items.some(([href])=>href===current);let marked=false;for(const [href,label] of items){const a=document.createElement('a');a.href=href;a.textContent=label;if(!marked&&(exact?href===current:href===page)){a.setAttribute('aria-current','page');marked=true;}nav.append(a);}return block;}
function build(){
 const main=document.querySelector('main');
 if(!main||document.querySelector('.app-shell'))return;
 if(page==='portal.html'){const register=document.createElement('a');register.href='register.html';register.textContent='สร้างบัญชีเจ้าของโฆษณา';main.querySelector('.portal-footnote')?.append(' · ',register);}
 main.id=main.id||'main-content';main.tabIndex=-1;
 const shell=document.createElement('div');shell.className='app-shell';
 const top=document.createElement('header');top.className='app-topbar';
 top.innerHTML=`<button class="menu-toggle" type="button" aria-label="เปิดเมนู" aria-expanded="false" aria-controls="app-sidebar">☰</button><a class="app-brand" href="index.html"><span class="app-brand-mark">PTL</span><span>Proximity Targeting Lab</span></a><span class="data-mode ${mode}">${modeLabel}</span><span class="app-topbar-spacer"></span><span class="app-user">ผู้เยี่ยมชม</span><a href="login.html">เข้าสู่ระบบ</a>`;
 if(commercial){top.querySelector('.app-brand').href='portal.html';top.querySelector('.app-brand span:last-child').textContent='Proximity Ads';top.querySelector('.data-mode').remove();}
 const accountLink=top.querySelector('a[href="login.html"]');
 const side=document.createElement('aside');side.className='app-sidebar';side.id='app-sidebar';
 let workspace=links('พื้นที่ทำงาน',entryLinks);side.append(workspace);
 const roleBox=document.createElement('div');roleBox.hidden=true;
 const roleLabel=document.createElement('label');roleLabel.className='app-role-switch';
 const roleTitle=document.createElement('span');roleTitle.textContent='พื้นที่ใช้งาน';
 const roleSelect=document.createElement('select');roleSelect.id='active-role';roleSelect.setAttribute('aria-label','สลับพื้นที่ใช้งาน');roleLabel.append(roleTitle,roleSelect);
 const roleStatus=document.createElement('p');roleStatus.className='app-role-status';roleStatus.setAttribute('role','status');roleBox.append(roleLabel,roleStatus);side.prepend(roleBox);
 let activeRole='',switching=false;
 roleSelect.onchange=async()=>{
  if(switching)return;switching=true;roleSelect.disabled=true;roleStatus.textContent='กำลังเปลี่ยนพื้นที่…';
  try{
   const {csrf}=await getSession(true);
   const r=await fetch('api.php?action=role-switch',{method:'POST',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({role:roleSelect.value})});
   const d=await r.json();if(!r.ok)throw Error(d.error||'เปลี่ยนพื้นที่ไม่สำเร็จ');
   const refreshed=await getSession(true),homes={customer:'advertiser.html',owner:'owner.html',operator:'caster.html',reviewer:'single-screen.html'};
   const role=refreshed.user?.role;
   if(!Object.hasOwn(homes,role))throw Error('บัญชีนี้ไม่มีพื้นที่ใช้งาน');
   location.assign(homes[role]);
  }catch(error){roleSelect.value=activeRole;roleStatus.textContent=error.message;}
  finally{switching=false;roleSelect.disabled=false;}
 };
 const research=document.createElement('details');research.className='research-links';const researchTitle=document.createElement('summary');researchTitle.textContent='งานวิจัยและเครื่องมือทดลอง';research.append(researchTitle,links('ห้องวิจัย',[...publicResearch,['campaigns.html','ทดลองแคมเปญ'],['operator.html','จำลองสถานี'],['backend-console.html','เครื่องมือข้อมูล']]));
 if(commercial)side.append(research);else{side.append(links('บริการโฆษณา',[['portal.html','เข้าสู่บริการโฆษณา']]));side.append(links('ห้องวิจัย',publicResearch),links('เครื่องมือทดลอง',[['campaigns.html','ทดลองแคมเปญ'],['operator.html','จำลองสถานี'],['backend-console.html','เครื่องมือข้อมูล']]));}
 const content=document.createElement('div');content.className='app-content';
 main.parentNode.insertBefore(shell,main);shell.append(top,side,content);content.append(main);
 const skip=document.createElement('a');skip.className='skip-link';skip.href='#'+main.id;skip.textContent='ข้ามไปเนื้อหาหลัก';document.body.prepend(skip);
 const band=document.createElement('div');band.className=`trust-band ${mode==='pilot'?'pilot':''}`;
 band.textContent=mode==='simulated'?'ข้อมูลจำลองเพื่อการวิจัย — ไม่ใช่ข้อมูลผู้ชม การเล่น หรือยอดเรียกเก็บจริง':mode==='pilot'?'ระบบนำร่องที่บันทึกข้อมูล — ยังไม่ใช่ระบบ production และการตรวจจับเป้าหมายอาจเป็นข้อมูลจำลอง':'เนื้อหางานวิจัย — ตรวจข้อจำกัดของโมเดลและที่มาก่อนนำผลไปใช้';if(!commercial)main.prepend(band);
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
  accountLink.textContent=valid?'บัญชีของฉัน':'เข้าสู่ระบบ';accountLink.href=valid?'profile.html':'login.html';
  const items=valid&&Object.hasOwn(roleLinks,user.role)?[...roleLinks[user.role],['profile.html','บัญชีของฉัน'],['login.html','เปลี่ยนบัญชี / ออกจากระบบ']]:entryLinks;
  const updated=links('พื้นที่ทำงาน',items);
  workspace.replaceWith(updated);workspace=updated;
  main.querySelector('#trial-mode-notice')?.remove();
  if(valid&&Number(user.is_demo)){const notice=document.createElement('p');notice.id='trial-mode-notice';notice.className='account-demo-note';notice.textContent='บัญชีทดลองใช้ร่วมกัน · ข้อมูลและเครดิตแยกจากบัญชีใช้งานจริง';main.prepend(notice);}
  activeRole=valid?user.role:'';roleSelect.replaceChildren();
  const assigned=valid&&Array.isArray(user.roles)?user.roles.filter(role=>Object.hasOwn(roleLinks,role)):[];
  for(const role of assigned){const option=document.createElement('option');option.value=role;option.textContent=thaiRole(role);roleSelect.append(option);}
  roleSelect.value=activeRole;roleBox.hidden=assigned.length<2;
 }};
}
function thaiRole(role){const roles={customer:'เจ้าของโฆษณา',operator:'ผู้ดูแลสถานี',reviewer:'ผู้ตรวจสอบ',owner:'เจ้าของระบบ'};return Object.hasOwn(roles,role)?roles[role]:role;}
const shell=build();
if(shell){
 getSession()
  .then(d=>d?.user||null)
  .catch(()=>null)
  .then(user=>shell.setUser(user));
 window.addEventListener('account-updated',()=>getSession(true).then(d=>shell.setUser(d.user)).catch(()=>shell.setUser(null)));
}
