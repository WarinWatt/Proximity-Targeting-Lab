import {screens} from './engine.mjs';
export const initialStations=()=>screens.map((s,i)=>({id:s.id,camera:s.camera,location:'L'+(i+1),name:s.name,active:true,ready:true,playing:false}));
