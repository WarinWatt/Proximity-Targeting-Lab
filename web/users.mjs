import {getSession} from './session-client.mjs';
const $=id=>document.getElementById(id);
const roleNames={customer:'Ads Owner',owner:'System Owner',operator:'Station Operator',reviewer:'Reviewer'};
let current=null,users=[],busy=false;
$('username').minLength=3;$('username').maxLength=80;$('username').pattern='[a-zA-Z0-9][a-zA-Z0-9._\\-]{2,79}';
$('display-name').maxLength=120;$('email').maxLength=254;$('password').minLength=12;
async function api(action,body){
 const {csrf}=await getSession(true);
 const r=await fetch('api.php?action='+action,{signal:AbortSignal.timeout(10000),...(body?{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(body)}:{})});
 const d=await r.json();if(!r.ok){if(r.status===401)location.replace('login.html?next=users');throw Error(d.error||'ดำเนินการไม่สำเร็จ');}return d;
}
function edit(user=null){
 if(busy)return;
 $('user-editor').reset();$('user-id').value=user?.id||'';$('username').value=user?.username||'';$('display-name').value=user?.display_name||'';$('email').value=user?.email||'';
 $('active').checked=user?Boolean(Number(user.active)):true;$('password').required=!user;
 for(const input of document.querySelectorAll('input[name=roles]'))input.checked=(user?.roles||['customer']).includes(input.value);
 $('editor-title').textContent=user?'แก้ไขผู้ใช้: '+user.username:'เพิ่มผู้ใช้';
 $('password-help').textContent=user?'เว้นว่างเพื่อใช้รหัสผ่านเดิม · รหัสผ่านใหม่อย่างน้อย 12 ตัวอักษร':'รหัสผ่านอย่างน้อย 12 ตัวอักษร';
 $('editor-status').textContent='';$('user-fields').disabled=false;
}
function render(){
 $('users-list').replaceChildren();
 if(!users.length){$('users-list').textContent='ยังไม่มีบัญชีผู้ใช้';return;}
 for(const user of users){
  const card=document.createElement('div');card.className='account-user-card';const info=document.createElement('div');
  const name=document.createElement('strong');name.textContent=user.display_name||user.username;
  const detail=document.createElement('p');detail.textContent=user.username+' · '+(user.email||'ไม่มีอีเมล');
  const roles=document.createElement('p');roles.textContent=(user.roles||[]).map(role=>Object.hasOwn(roleNames,role)?roleNames[role]:role).join(' · ');
  const badge=document.createElement('span');badge.className='account-badge'+(Number(user.is_demo)?' demo':'');badge.textContent=Number(user.is_demo)?'บัญชีทดลอง':'บัญชีใช้งาน';
  info.append(name,badge,detail,roles);
  if(!Number(user.active)){const state=document.createElement('span');state.className='account-badge inactive';state.textContent='ปิดใช้งาน';info.append(state);}
  const button=document.createElement('button');button.type='button';button.textContent='แก้ไข';button.onclick=()=>{edit(user);$('user-editor').scrollIntoView({block:'center'});$('username').focus();};
  card.append(info,button);$('users-list').append(card);
 }
}
function demoState(d){$('demo-enabled').checked=d.enabled===true;const date=new Date(d.expires_at);$('demo-state').textContent=(d.enabled?'เปิดให้ทดลองใช้':'ปิดการทดลองใช้')+(d.expires_at&&!Number.isNaN(date.valueOf())?' · หมดอายุ '+date.toLocaleString('th-TH'):'');}
async function load(){
 $('refresh-users').disabled=true;
 try{
  const d=await getSession(true);current=d.user;
  if(!current){location.replace('login.html?next=users');return;}
  if(current.role!=='owner')throw Error('พื้นที่นี้สำหรับเจ้าของระบบ กรุณาเลือกบทบาทเจ้าของระบบหากบัญชีของคุณมีสิทธิ์');
  users=(await api('users')).users||[];render();$('user-management').hidden=false;edit();
  $('status').textContent=Number(current.is_demo)?'บัญชีทดลอง · จัดการได้เฉพาะบัญชีทดลองที่ระบบอนุญาต':'จัดการบัญชีผู้ใช้และพื้นที่ใช้งาน';
  $('demo-management').hidden=Boolean(Number(current.is_demo));
  if(!Number(current.is_demo)){try{demoState(await api('demo-mode'));$('demo-fields').disabled=false;$('demo-status').textContent='';}catch(error){$('demo-status').textContent=error.message;}}
 }catch(error){$('user-management').hidden=true;$('status').textContent=error.message;}
 finally{$('refresh-users').disabled=false;}
}
$('user-editor').onsubmit=async e=>{
 e.preventDefault();if(busy)return;
 const roles=[...document.querySelectorAll('input[name=roles]:checked')].map(input=>input.value);
 if(!roles.length){$('editor-status').textContent='เลือกพื้นที่ใช้งานอย่างน้อยหนึ่งบทบาท';return;}
 const body={username:$('username').value.trim(),display_name:$('display-name').value.trim(),email:$('email').value.trim(),roles,active:$('active').checked};
 if($('user-id').value)body.id=Number($('user-id').value);
 const password=$('password').value;if(password){if([...password].length<12||new TextEncoder().encode(password).length>72){$('editor-status').textContent='ใช้รหัสผ่านอย่างน้อย 12 ตัวอักษร และไม่เกิน 72 ไบต์';return;}body.password=password;}
 busy=true;$('user-fields').disabled=true;$('editor-status').textContent='กำลังบันทึก…';
 try{await api('user-save',body);$('password').value='';busy=false;await load();window.dispatchEvent(new Event('account-updated'));$('editor-status').textContent='บันทึกผู้ใช้แล้ว';}
 catch(error){$('editor-status').textContent=error.message;}
 finally{busy=false;$('user-fields').disabled=false;}
};
$('demo-mode').onsubmit=async e=>{
 e.preventDefault();if(busy)return;busy=true;$('demo-fields').disabled=true;$('demo-status').textContent='กำลังบันทึก…';
 try{demoState(await api('demo-mode',{enabled:$('demo-enabled').checked}));$('demo-status').textContent='บันทึกการทดลองใช้แล้ว';}
 catch(error){$('demo-status').textContent=error.message;}
 finally{busy=false;$('demo-fields').disabled=false;}
};
$('new-user').onclick=()=>{edit();$('username').focus();};$('cancel-edit').onclick=()=>edit();$('refresh-users').onclick=()=>{if(!busy)load();};
load();
