import {getSession} from './session-client.mjs';

const $=id=>document.getElementById(id);
const homes={customer:'advertiser',owner:'owner',operator:'caster',reviewer:'single-screen'};
const destinations={customer:['advertiser','profile'],owner:['owner','advertiser','caster','live-monitor','single-screen','users','profile'],operator:['caster','live-monitor','profile'],reviewer:['single-screen','profile']};
const labels={advertiser:'Ads Owner',owner:'System Owner',caster:'Station Operator','live-monitor':'Live Monitor','single-screen':'ตรวจสอบการแสดงผลและบิล'};
const requested=new URLSearchParams(location.search).get('next');
let csrf='',busy=false;
const roleNames={customer:'Ads Owner',owner:'System Owner',operator:'Station Operator',reviewer:'Reviewer'};
const requestedRole={advertiser:'customer',owner:'owner',users:'owner',caster:'operator','live-monitor':'operator','single-screen':'reviewer'}[requested]||'';
let profiles=[],demoExpires=0;
function setRoles(roles,selected=''){
 $('login-role').replaceChildren();
 const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='พื้นที่เริ่มต้นของบัญชี';$('login-role').append(placeholder);
 for(const role of roles){if(!Object.hasOwn(roleNames,role))continue;const option=document.createElement('option');option.value=role;option.textContent=roleNames[role];$('login-role').append(option);}
 $('login-role').value=roles.includes(selected)?selected:'';
}
setRoles(Object.keys(roleNames),requestedRole);
function clearDemo(){
 profiles=[];demoExpires=0;$('demo').hidden=true;
 if($('demo-account').value){$('username').value='';$('password').value='';}
 $('demo-account').replaceChildren();setRoles(Object.keys(roleNames),requestedRole);
}
async function loadDemo(){
 try{
  await getSession();
  const r=await fetch('api.php?action=demo-profiles',{cache:'no-store',signal:AbortSignal.timeout(5000)});if(!r.ok)return;
  const d=await r.json();demoExpires=Date.parse(d.expires_at);
  if(d.enabled!==true||!Number.isFinite(demoExpires)||demoExpires<=Date.now())return;
  profiles=(Array.isArray(d.profiles)?d.profiles:[]).filter(p=>typeof p.username==='string'&&p.username.startsWith('trial-')&&typeof p.password==='string'&&p.password&&Array.isArray(p.roles));
  if(!profiles.length)return;
  for(const [index,profile]of profiles.entries()){const option=document.createElement('option');option.value=String(index);option.textContent=(profile.display_name||profile.username)+' · '+profile.username;$('demo-account').append(option);}
  $('demo-expiry').textContent='ทดลองใช้ได้ถึง '+new Date(demoExpires).toLocaleString('th-TH');$('demo').hidden=false;
  setTimeout(clearDemo,Math.min(demoExpires-Date.now(),2147483647));
 }catch{/* Account login stays available when trial access is unavailable. */}
}
$('demo-account').onchange=()=>{
 const value=$('demo-account').value,profile=value===''?null:profiles[Number(value)];
 if(!profile||Date.now()>=demoExpires){$('username').value='';$('password').value='';setRoles(Object.keys(roleNames),requestedRole);return;}
 $('username').value=profile.username;$('password').value=profile.password;setRoles(profile.roles,profile.roles.includes(requestedRole)?requestedRole:profile.roles[0]);
};
$('username').addEventListener('input',()=>{if($('demo-account').value!==''){$('demo-account').value='';$('password').value='';setRoles(Object.keys(roleNames),requestedRole);}});
loadDemo();

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
$('login').onsubmit=async e=>{
 e.preventDefault();if(busy)return;busy=true;$('sign-in').disabled=true;$('status').textContent='กำลังเข้าสู่ระบบ…';
 try{
  await session(true);
  if($('demo-account').value!==''&&Date.now()>=demoExpires){clearDemo();throw Error('การทดลองใช้หมดอายุแล้ว');}
  const payload={username:$('username').value,password:$('password').value};if($('login-role').value)payload.role=$('login-role').value;
  const r=await fetch('api.php?action=login',{method:'POST',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(payload)});
  const d=await r.json();if(!r.ok)throw Error(r.status===401?'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง':d.error||'ไม่สามารถเข้าสู่ระบบได้ กรุณาลองอีกครั้ง');
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
