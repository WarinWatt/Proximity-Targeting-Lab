import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {classify,cropBox,validateResult} from './openpar-utils.mjs';
import {attributes as catalog} from './openpar-attributes.mjs';
test('attributes use independent scores and explicit uncertainty',()=>{
 assert.equal(classify(.9),'พบ');assert.equal(classify(.1),'ไม่พบ');assert.equal(classify(.5),'ไม่แน่ใจ');assert.equal(classify(.7),'พบ');assert.throws(()=>classify(NaN));assert.throws(()=>classify(1.1));
});
test('person crop matches 40% x 90% guide',()=>{assert.deepEqual(cropBox(640,480),{x:192,y:24,width:256,height:432});});
test('reject simulated or malformed inference responses',()=>{
 const good={model:'OpenPAR/PromptPAR-PA100K',attributes:catalog.map(a=>({...a,score:.5}))};
 assert.equal(validateResult(good),good);assert.throws(()=>validateResult({...good,model:'mock'}));assert.throws(()=>validateResult({...good,attributes:[]}));good.attributes[1].id='0';assert.throws(()=>validateResult(good));
});
test('all Lab pages expose OpenPAR navigation',async()=>{for(const file of ['index.html','references.html','openpar.html']){const text=await readFile(new URL(file,import.meta.url),'utf8');assert.match(text,/href="openpar.html"/);}});
test('webcam requires click, sends one image, and stops tracks on leaving',async()=>{
 const old={document:globalThis.document,window:globalThis.window,location:globalThis.location,fetch:globalThis.fetch,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator')};
 let calls=0,stopped=0;const listeners={};
 const node=()=>({textContent:'',disabled:false,hidden:false,children:[],style:{},value:'.7',after(){},append(...x){this.children.push(...x);},replaceChildren(){this.children=[];},setAttribute(){},addEventListener(){}});
 const html=await readFile(new URL('openpar.html',import.meta.url),'utf8');const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],node()]));
 Object.assign(nodes.get('camera'),{readyState:2,seeking:false,videoWidth:640,videoHeight:480,currentTime:8.5,parentElement:node(),async play(){},pause(){},load(){},removeAttribute(){}});
 Object.assign(nodes.get('snapshot'),{getContext:()=>({drawImage(){}}),toBlob:cb=>cb(new Blob(['test-only']))});
 const track={stop(){stopped++;},addEventListener(){}};
 globalThis.document={hidden:false,getElementById:id=>nodes.get(id),createElement:node,addEventListener:(event,fn)=>listeners[event]=fn};
 globalThis.window={isSecureContext:true,addEventListener:(event,fn)=>listeners[event]=fn};globalThis.location={hostname:'127.0.0.1'};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{async getUserMedia(){calls++;return {getTracks:()=>[track],getVideoTracks:()=>[track]};}}}});
 let posts=0;
 globalThis.fetch=async(_url,options={})=>({ok:true,json:async()=>{if(options.method==='POST'){posts++;return {model:'OpenPAR/PromptPAR-PA100K',inference_ms:1,attributes:catalog.map(a=>({...a,score:.5}))};}return {ready:true,model:'test-only',device:'test'};}});
 try{
  await import('./openpar.mjs?unit-test');await new Promise(r=>setImmediate(r));assert.equal(calls,0);assert.equal(posts,0);assert.equal(nodes.get('attributes').children.length,26);assert.equal(nodes.get('attributes').children[0].children[1].textContent,'—');
  await nodes.get('camera-start').onclick();assert.equal(calls,1);assert.equal(posts,0);assert.equal(nodes.get('analyze').disabled,false);
  await nodes.get('analyze').onclick();assert.equal(posts,1);assert.equal(nodes.get('attributes').children.length,26);assert.equal(nodes.get('attributes').children[0].children[1].textContent,'50.0%');assert.equal(nodes.get('attributes').children[0].children[2].textContent,'ไม่แน่ใจ');
  document.hidden=true;listeners.visibilitychange();assert.equal(stopped,1);assert.equal(nodes.get('attributes').children.length,26);assert.equal(nodes.get('attributes').children[0].children[1].textContent,'—');assert.equal(nodes.get('snapshot').hidden,true);
  document.hidden=false;nodes.get('clip-file').files=[new File(['test-video'],'street.webm',{type:'video/webm'})];nodes.get('clip-file').onchange();assert.equal(calls,1);assert.equal(nodes.get('camera').controls,true);assert.equal(posts,1);
  await nodes.get('analyze').onclick();assert.equal(posts,2);assert.match(nodes.get('result-status').textContent,/street.webm ที่ 8.50/);assert.equal(nodes.get('attributes').children[0].children[1].textContent,'50.0%');nodes.get('camera-stop').onclick();assert.equal(nodes.get('analyze').disabled,true);
 }finally{listeners.pagehide?.();for(const key of ['document','window','location','fetch']){if(old[key]===undefined)delete globalThis[key];else globalThis[key]=old[key];}if(old.navigator)Object.defineProperty(globalThis,'navigator',old.navigator);else delete globalThis.navigator;}
});
