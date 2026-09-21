import {classify,cropBox,validateResult} from './openpar-utils.mjs';
import {attributes as catalog} from './openpar-attributes.mjs';
const $=id=>document.getElementById(id), video=$('camera'), canvas=$('snapshot');
const local=['localhost','127.0.0.1'].includes(location.hostname);
const api='http://127.0.0.1:8042';
let stream=null,clipURL=null,clipName='',ready=false,busy=false,opening=false,generation=0,result=null,request=null,healthTimer=null;
function controls(){ $('camera-start').disabled=!!stream||opening;$('camera-stop').disabled=!stream&&!clipURL&&!opening;$('analyze').disabled=!(stream||clipURL)||!ready||busy||video.readyState<2||video.seeking; }
function clearResult(){result=null;canvas.hidden=true;canvas.width=1;canvas.height=1;render();$('result-status').textContent='ยังไม่มีผล — รายการด้านล่างคือสิ่งที่โมเดลรองรับ ไม่ใช่สิ่งที่พบในภาพ';}
function stop(){generation++;request?.abort();stream?.getTracks().forEach(t=>t.stop());stream=null;video.pause();video.srcObject=null;video.removeAttribute('src');video.load();if(clipURL)URL.revokeObjectURL(clipURL);clipURL=null;clipName='';opening=false;busy=false;video.controls=false;$('clip-file').value='';clearResult();$('camera-status').textContent='ปิดแหล่งภาพแล้ว';controls();}
async function health(){
 clearTimeout(healthTimer);
 ready=false;controls();
 if(!local){$('model-status').textContent='เปิดแท็บนี้ผ่าน localhost เพื่อใช้บริการบนเครื่อง ยังไม่ได้เปิด inference ออนไลน์';return;}
 try{const r=await fetch(api+'/health',{signal:AbortSignal.timeout(5000),cache:'no-store'});const data=await r.json();ready=r.ok&&data.ready===true;$('model-status').textContent=ready?`โมเดลพร้อม · ${data.model} · ${data.device}`:`โมเดลยังไม่พร้อม: ${data.message||'กำลังโหลด'}`;}
 catch{$('model-status').textContent='ยังเชื่อมบริการ OpenPAR ที่ 127.0.0.1:8042 ไม่ได้ เปิด webcam ดูภาพได้ แต่ยังวิเคราะห์ไม่ได้';}controls();
 if(!document.hidden)healthTimer=setTimeout(health,15000);
}
$('camera-start').onclick=async()=>{
 if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){$('camera-status').textContent='Browser นี้เปิดกล้องไม่ได้ ต้องใช้ localhost หรือ HTTPS';return;}
 stop();video.autoplay=true;
 const current=++generation;opening=true;controls();
 try{const media=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false});if(current!==generation){media.getTracks().forEach(t=>t.stop());return;}stream=media;video.srcObject=media;stream.getVideoTracks()[0].addEventListener('ended',stop,{once:true});await video.play();$('camera-status').textContent='กล้องเปิดแล้ว · ภาพยังไม่ถูกส่งจนกดวิเคราะห์';}
 catch(e){if(current!==generation)return;stop();$('camera-status').textContent=({NotAllowedError:'ไม่ได้รับอนุญาตใช้กล้อง กรุณาอนุญาตใน browser',NotFoundError:'ไม่พบ webcam',NotReadableError:'กล้องอาจถูกโปรแกรมอื่นใช้งานอยู่'})[e.name]||'เปิดกล้องไม่สำเร็จ';}
 finally{opening=false;controls();}
};
video.addEventListener('loadeddata',()=>{video.parentElement.style.aspectRatio=`${video.videoWidth}/${video.videoHeight}`;controls();});$('camera-stop').onclick=stop;$('recheck').onclick=health;
$('clip-file').onchange=()=>{
 const file=$('clip-file').files?.[0];if(!file)return;
 if(!(file.type.startsWith('video/')||/\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name))){$('camera-status').textContent='กรุณาเลือกไฟล์วิดีโอ MP4 / WebM';return;}
 stop();clipName=file.name;clipURL=URL.createObjectURL(file);video.autoplay=false;video.controls=true;video.src=clipURL;video.load();$('camera-status').textContent=`คลิป: ${clipName} · เล่น/เลื่อนไปเฟรมที่ต้องการ แล้วกดวิเคราะห์ · ไฟล์อยู่ใน browser เท่านั้น`;controls();
};
video.addEventListener('seeking',controls);video.addEventListener('seeked',controls);
video.addEventListener('error',()=>{if(clipURL){stop();$('camera-status').textContent='Browser อ่านคลิปนี้ไม่ได้ ลอง MP4 (H.264) หรือ WebM';}});
function render(){
 const threshold=Number($('threshold').value);$('attributes').replaceChildren();
 const scores=new Map((result?.attributes||[]).map(a=>[a.id,a.score]));
 for(const a of catalog){const tr=document.createElement('tr');const label=document.createElement('td');label.textContent=a.label;const group=document.createElement('small');group.textContent=a.group;label.append(group);const score=document.createElement('td');const value=scores.get(a.id);const state=document.createElement('td');
 if(value===undefined){score.textContent='—';state.textContent='ยังไม่วิเคราะห์';}
 else{score.textContent=(value*100).toFixed(1)+'%';const meter=document.createElement('meter');meter.min=0;meter.max=1;meter.value=value;meter.setAttribute('aria-label',a.label);score.append(meter);state.textContent=classify(value,threshold);state.className=state.textContent==='พบ'?'found':'uncertain';}
 tr.append(label,score,state);$('attributes').append(tr);}
}
$('threshold').oninput=()=>{$('threshold-value').textContent=Number($('threshold').value).toFixed(2);render();};
$('analyze').onclick=async()=>{
 if(busy||!(stream||clipURL)||!ready||video.readyState<2||video.seeking)return;const current=generation;const capturedAt=clipURL?`คลิป ${clipName} ที่ ${video.currentTime.toFixed(2)} วินาที`:`กล้อง เวลา ${new Date().toLocaleTimeString('th-TH')}`;if(clipURL)video.pause();busy=true;clearResult();controls();
 const box=cropBox(video.videoWidth,video.videoHeight);canvas.width=Math.round(box.width);canvas.height=Math.round(box.height);canvas.getContext('2d').drawImage(video,box.x,box.y,box.width,box.height,0,0,canvas.width,canvas.height);canvas.hidden=false;
 $('result-status').textContent='กำลังวิเคราะห์ภาพที่แสดงนี้… CPU อาจใช้เวลาหลายวินาที';
 const begin=performance.now();const controller=new AbortController();request=controller;const timeout=setTimeout(()=>controller.abort(),120000);
 try{const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));if(current!==generation)return;const response=await fetch(api+'/infer',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:blob,signal:controller.signal});const data=await response.json();if(current!==generation)return;if(!response.ok)throw new Error(data.message||'บริการวิเคราะห์ผิดพลาด');result=validateResult(data);render();$('result-status').textContent=`${capturedAt} · inference ${data.inference_ms} ms · รวม ${Math.round(performance.now()-begin)} ms · ผลของภาพที่ส่ง ไม่ใช่ live tracking`;}
 catch(e){if(current===generation){result=null;render();$('result-status').textContent=e.name==='AbortError'?'หมดเวลารอผล ลองใหม่หรือดูสถานะบริการ':e.message;}}
 finally{clearTimeout(timeout);if(current===generation){busy=false;request=null;controls();}}
};
window.addEventListener('pagehide',()=>{clearTimeout(healthTimer);stop();});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(healthTimer);if(stream||opening)stop();else if(clipURL)video.pause();}else health();});render();health();
for(const event of ['canplay','playing','pause','loadedmetadata'])video.addEventListener(event,controls);
const testButton=document.createElement('button');testButton.textContent='ทดสอบโมเดลด้วยภาพตัวอย่าง (ไม่เปิดกล้อง)';$('recheck').after(testButton);
testButton.onclick=async()=>{
 if(busy)return;testButton.disabled=true;busy=true;controls();const current=generation;
 try{await health();if(!ready)throw Error('บริการยังไม่พร้อม หากใช้หน้าออนไลน์ ให้เปิด http://127.0.0.1/pages/content-decision-lab/openpar.html บนเครื่องที่รันโมเดล');
 const img=new Image();img.src='assets/personas.png';await img.decode();
 const sample=document.createElement('canvas');sample.width=256;sample.height=480;sample.getContext('2d').drawImage(img,0,0,img.width/5,img.height,0,0,256,480);
 const blob=await new Promise(resolve=>sample.toBlob(resolve,'image/jpeg',.9));$('result-status').textContent='กำลังทดสอบ inference จริงด้วยภาพคนจำลอง…';
 const response=await fetch(api+'/infer',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:blob,signal:AbortSignal.timeout(120000)});const data=await response.json();if(!response.ok)throw Error(data.message||'Inference failed');if(current!==generation)return;
 result=validateResult(data);canvas.width=256;canvas.height=480;canvas.getContext('2d').drawImage(sample,0,0);canvas.hidden=false;render();$('result-status').textContent=`ทดสอบสำเร็จ · ภาพคนจำลอง ไม่ใช่ webcam · ${data.inference_ms} ms · ${result.attributes.length} attributes`;
 }catch(e){if(current===generation)$('result-status').textContent='ทดสอบไม่สำเร็จ: '+e.message;}finally{busy=false;testButton.disabled=false;controls();}
};
