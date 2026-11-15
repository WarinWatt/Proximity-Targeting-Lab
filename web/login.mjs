import {getSession} from './session-client.mjs';

const $=id=>document.getElementById(id);
const homes={customer:'advertiser',owner:'owner',operator:'caster',reviewer:'single-screen'};
const destinations={customer:['advertiser'],owner:['owner','advertiser','caster','live-monitor','single-screen'],operator:['caster','live-monitor'],reviewer:['single-screen']};
const labels={advertiser:'Ads Owner',owner:'System Owner',caster:'Station Operator','live-monitor':'Live Monitor','single-screen':'ตรวจสอบการแสดงผลและบิล'};
const requested=new URLSearchParams(location.search).get('next');
let csrf='',busy=false;

// Return only literal local filenames; never navigate to a URL supplied by the caller.
export function loginDestination(role,next=requested){
 if(!Object.hasOwn(homes,role))return null;
 return (destinations[role].includes(next)?next:homes[role])+'.html';
}
if(Object.hasOwn(labels,requested))$('login-context').textContent='เข้าสู่พื้นที่ '+labels[requested];
async function session(force=false){
 const d=await getSession(force);csrf=d.csrf;
 $('status').textContent=d.user?'เข้าสู่ระบบ: '+d.user.username+' / '+d.user.role:'เข้าสู่ระบบเพื่อเริ่มใช้งาน';
 const destination=d.user?loginDestination(d.user.role):null;
 $('continue').hidden=!destination;
 if(destination)$('continue').href=destination;
 $('logout').hidden=!d.user;
 return d;
}
if(['localhost','127.0.0.1','[::1]'].includes(location.hostname)){
 $('demo').hidden=false;
 for(const role of ['customer','operator','reviewer','owner']){const p=document.createElement('p');p.textContent=role+'.demo / LabTest!2026-'+role;$('accounts').append(p);}
}
$('login').onsubmit=async e=>{
 e.preventDefault();if(busy)return;busy=true;$('sign-in').disabled=true;$('status').textContent='กำลังเข้าสู่ระบบ…';
 try{
  await session(true);
  const r=await fetch('api.php?action=login',{method:'POST',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({username:$('username').value,password:$('password').value})});
  const d=await r.json();if(!r.ok)throw Error(r.status===401?'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง':'ไม่สามารถเข้าสู่ระบบได้ กรุณาลองอีกครั้ง');
  csrf=d.csrf;$('password').value='';
  const signedIn=await session(true);
  const destination=loginDestination(signedIn.user?.role);
  if(!destination)throw Error('บัญชีนี้ยังไม่มีพื้นที่ใช้งาน กรุณาติดต่อผู้ดูแล');
  location.assign(destination);
 }catch(error){$('status').textContent=error.name==='TimeoutError'?'การเชื่อมต่อใช้เวลานาน กรุณาลองอีกครั้ง':error.message;}
 finally{busy=false;$('sign-in').disabled=false;}
};
$('logout').onclick=async()=>{
 if(busy)return;busy=true;$('logout').disabled=true;
 try{
  await session(true);
  const r=await fetch('api.php?action=logout',{method:'POST',signal:AbortSignal.timeout(10000),headers:{'X-CSRF-Token':csrf}});
  if(!r.ok)throw Error('ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง');
  await session(true);location.replace('login.html');
 }catch(error){$('status').textContent=error.message;}
 finally{busy=false;$('logout').disabled=false;}
};
session().catch(()=>$('status').textContent='เชื่อมต่อบริการบัญชีไม่ได้ กรุณาลองเข้าสู่ระบบอีกครั้ง');
