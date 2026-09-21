"""Loopback-only webcam inference: no persistence, no outbound image requests."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
import json
import threading
import time
import warnings
import sys
from pathlib import Path
from urllib.parse import urlparse
from adapter import MODEL_NAME

state = {'ready':False, 'model':MODEL_NAME, 'device':'CPU', 'message':'กำลังโหลด checkpoint'}
predictor = None
lock = threading.Lock()
MAX_BODY = 2*1024*1024

def load_model():
    global predictor
    try:
        root = Path(__file__).resolve().parent
        checkpoint = root/'PA100k_Checkpoint.pth'
        while not checkpoint.exists() or checkpoint.stat().st_size != 1291183817:
            downloaded = sum(p.stat().st_size for p in (root/'download-parts-4m').glob('*.part'))
            state['message'] = f'checkpoint ยังไม่ครบ ({downloaded//1048576} / 1231 MB) ยังวิเคราะห์ไม่ได้'
            time.sleep(5)
        state['message'] = 'กำลังโหลดและตรวจสอบ weights บน CPU'
        from adapter import Predictor
        predictor = Predictor()
        state.update(ready=True, message='พร้อม')
    except Exception as exc:
        state.update(ready=False, message=f'โหลดโมเดลไม่สำเร็จ: {type(exc).__name__}: {exc}')
        print(ascii(state['message']), flush=True)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def setup(self):
        super().setup()
        self.connection.settimeout(10)
    def allowed(self):
        origin_host = urlparse(self.headers.get('Origin', '')).hostname
        return self.headers.get('Host') in {'127.0.0.1:8042','localhost:8042'} and origin_host in {'127.0.0.1','localhost'}
    def send_json(self, code, data):
        payload = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        origin = self.headers.get('Origin')
        if urlparse(origin or '').hostname in {'127.0.0.1','localhost'}: self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Vary','Origin')
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(payload)))
        self.end_headers()
        try: self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError): pass
    def do_OPTIONS(self):
        if not self.allowed(): return self.send_json(403, {'message':'Origin denied'})
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin',self.headers['Origin'])
        self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers','Content-Type')
        self.send_header('Vary','Origin')
        self.end_headers()
    def do_GET(self):
        if not self.allowed(): return self.send_json(403, {'message':'Origin denied'})
        if self.path != '/health': return self.send_json(404, {'message':'Not found'})
        self.send_json(200, state)
    def do_POST(self):
        if not self.allowed(): return self.send_json(403, {'message':'Origin denied'})
        if self.path != '/infer': return self.send_json(404, {'message':'Not found'})
        if not state['ready']: return self.send_json(503, {'message':state['message']})
        if self.headers.get('Content-Type') != 'image/jpeg': return self.send_json(415, {'message':'JPEG required'})
        try: size = int(self.headers.get('Content-Length','0'))
        except ValueError: return self.send_json(400, {'message':'Invalid length'})
        if not 0 < size <= MAX_BODY: return self.send_json(413, {'message':'ภาพต้องไม่เกิน 2 MB'})
        if not lock.acquire(blocking=False): return self.send_json(429, {'message':'โมเดลกำลังประมวลผลภาพก่อนหน้า กรุณารอสักครู่'})
        try:
            from PIL import Image
            raw = self.rfile.read(size)
            with warnings.catch_warnings():
                warnings.simplefilter('error', Image.DecompressionBombWarning)
                with Image.open(BytesIO(raw)) as source:
                    if source.format != 'JPEG' or source.width*source.height>4_000_000 or min(source.size)<32:
                        return self.send_json(400, {'message':'ขนาดหรือชนิดภาพไม่รองรับ'})
                    image = source.convert('RGB')
            begin = time.perf_counter()
            attributes = predictor.predict(image)
            self.send_json(200, {'model':MODEL_NAME, 'device':'CPU', 'inference_ms':round((time.perf_counter()-begin)*1000), 'attributes':attributes})
        except Exception:
            self.send_json(400, {'message':'วิเคราะห์ภาพไม่สำเร็จ ตรวจรูปแบบภาพหรือสถานะโมเดล'})
        finally:
            lock.release()

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    threading.Thread(target=load_model, daemon=True).start()
    print('OpenPAR local API: http://127.0.0.1:8042', flush=True)
    ThreadingHTTPServer(('127.0.0.1',8042), Handler).serve_forever()
