import {attributes} from './openpar-attributes.mjs';
const knownIds=new Set(attributes.map(a=>a.id));
export function classify(score,threshold=.7){
 if(!Number.isFinite(score)||score<0||score>1)throw new Error('Invalid attribute score');
 return score>=threshold?'พบ':score<=1-threshold?'ไม่พบ':'ไม่แน่ใจ';
}
export function cropBox(width,height){return {x:width*.3,y:height*.05,width:width*.4,height:height*.9};}
export function validateResult(data){
 if(data?.model!=='OpenPAR/PromptPAR-PA100K'||!Array.isArray(data.attributes)||data.attributes.length!==26)throw new Error('รูปแบบผลโมเดลไม่ถูกต้อง');
 const ids=new Set();
 for(const a of data.attributes){if(typeof a.label!=='string'||!knownIds.has(a.id)||ids.has(a.id))throw new Error('label ไม่ถูกต้อง');ids.add(a.id);classify(a.score);}
 return data;
}
