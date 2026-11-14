let pending;
// Share initial session creation so parallel page modules cannot overwrite each other's cookies.
export function getSession(force=false){
 if(!pending||force)pending=fetch('api.php?action=session',{signal:AbortSignal.timeout(5000)}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error||'Session unavailable');return data;}).catch(error=>{pending=undefined;throw error;});
 return pending;
}
