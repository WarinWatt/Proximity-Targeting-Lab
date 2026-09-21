"""Read-only inference check on an existing AI-generated fictional persona."""
import io
import json
import time
import urllib.request
from pathlib import Path
from PIL import Image

headers={'Origin':'http://127.0.0.1'}
for attempt in range(120):
    req=urllib.request.Request('http://127.0.0.1:8042/health',headers=headers)
    with urllib.request.urlopen(req,timeout=5) as response: health=json.load(response)
    if health['ready']: break
    if 'RuntimeError' in health.get('message','') or 'Error:' in health.get('message',''):
        raise RuntimeError(ascii(health['message']))
    if attempt%6==0: print(ascii(health['message']),flush=True)
    time.sleep(5)
else: raise TimeoutError('Model not ready for real inference verification')

atlas_path = Path(__file__).resolve().parent.parent/'web'/'assets'/'personas.png'
with Image.open(atlas_path) as atlas:
    person=atlas.crop((0,0,atlas.width//5,atlas.height)).convert('RGB')
    person.thumbnail((256,480))
    payload=io.BytesIO();person.save(payload,format='JPEG')
req=urllib.request.Request('http://127.0.0.1:8042/infer',data=payload.getvalue(),headers={**headers,'Content-Type':'image/jpeg'})
with urllib.request.urlopen(req,timeout=120) as response: result=json.load(response)
assert result['model']=='OpenPAR/PromptPAR-PA100K'
assert len(result['attributes'])==26
assert all(0<=a['score']<=1 for a in result['attributes'])
print('REAL INFERENCE OK',result['inference_ms'],'ms',flush=True)
print([(a['id'],round(a['score'],3)) for a in result['attributes']],flush=True)
