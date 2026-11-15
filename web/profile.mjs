import {getSession} from './session-client.mjs';
const $=id=>document.getElementById(id);
const roleNames={customer:'Ads Owner',owner:'System Owner',operator:'Station Operator',reviewer:'Reviewer'};
let busy=false;
$('display-name').maxLength=120;$('email').maxLength=254;$('password').minLength=12;
async function api(body){
 const {csrf}=await getSession(true);
 const r=await fetch('api.php?action=profile',{signal:AbortSignal.timeout(10000),...(body?{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(body)}:{})});
 const d=await r.json();if(!r.ok){if(r.status===401)location.replace('login.html?next=profile');throw Error(d.error||'โหลดบัญชีไม่สำเร็จ');}return d;
}
function render(user){
 if(!user)throw Error('กรุณาเข้าสู่ระบบ');
 $('display-name').value=user.display_name||'';$('email').value=user.email||'';
 $('profile-identity').textContent='ชื่อผู้ใช้: '+user.username;
 $('profile-roles').textContent='พื้นที่ใช้งาน: '+(user.roles||[user.role]).map(role=>Object.hasOwn(roleNames,role)?roleNames[role]:role).join(' · ');
 $('profile-demo').hidden=!Number(user.is_demo);$('profile-fields').disabled=false;
}
$('profile').onsubmit=async e=>{
 e.preventDefault();if(busy)return;
 const body={display_name:$('display-name').value.trim(),email:$('email').value.trim()},password=$('password').value;
 if(password||$('confirm-password').value||$('current-password').value){
  if(!password||password!==$('confirm-password').value){$('status').textContent='กรุณายืนยันรหัสผ่านใหม่ให้ตรงกัน';return;}
  if(!$('current-password').value){$('status').textContent='กรุณาระบุรหัสผ่านปัจจุบัน';return;}
  if([...password].length<12||new TextEncoder().encode(password).length>72){$('status').textContent='ใช้รหัสผ่านอย่างน้อย 12 ตัวอักษร และไม่เกิน 72 ไบต์';return;}
  body.password=password;body.current_password=$('current-password').value;
 }
 busy=true;$('profile-fields').disabled=true;$('status').textContent='กำลังบันทึก…';
 try{const d=await api(body);render(d.user);for(const id of ['password','confirm-password','current-password'])$(id).value='';await getSession(true);window.dispatchEvent(new Event('account-updated'));$('status').textContent='บันทึกข้อมูลแล้ว';}
 catch(error){$('status').textContent=error.message;}
 finally{busy=false;$('profile-fields').disabled=false;}
};
api().then(d=>{render(d.user);$('status').textContent='';}).catch(error=>$('status').textContent=error.message);
