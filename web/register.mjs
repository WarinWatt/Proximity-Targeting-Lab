import {getSession} from './session-client.mjs';
const $=id=>document.getElementById(id);
let busy=false;
$('username').minLength=3;$('username').maxLength=80;$('username').pattern='[a-zA-Z0-9][a-zA-Z0-9._\\-]{2,79}';
$('display-name').maxLength=120;$('email').maxLength=254;$('password').minLength=12;
$('register-fields').disabled=false;$('status').textContent='';
$('register').onsubmit=async e=>{
 e.preventDefault();if(busy)return;
 const password=$('password').value;
 if(password!==$('confirm-password').value){$('status').textContent='รหัสผ่านทั้งสองช่องไม่ตรงกัน';return;}
 if([...password].length<12||new TextEncoder().encode(password).length>72){$('status').textContent='ใช้รหัสผ่านอย่างน้อย 12 ตัวอักษร และไม่เกิน 72 ไบต์';return;}
 busy=true;$('register-fields').disabled=true;$('status').textContent='กำลังสร้างบัญชี…';
 try{
  const {csrf}=await getSession(true);
  const r=await fetch('api.php?action=register',{method:'POST',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({username:$('username').value.trim(),display_name:$('display-name').value.trim(),email:$('email').value.trim(),password})});
  const d=await r.json();if(!r.ok)throw Error(d.error||'สร้างบัญชีไม่สำเร็จ');
  $('password').value='';$('confirm-password').value='';
  await getSession(true);location.assign('advertiser.html');
 }catch(error){$('status').textContent=error.message;}
 finally{busy=false;$('register-fields').disabled=false;}
};
