import io
import json
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from http.server import ThreadingHTTPServer
from PIL import Image
import server

class ServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = ThreadingHTTPServer(('127.0.0.1',0), server.Handler)
        threading.Thread(target=cls.http.serve_forever,daemon=True).start()
        cls.url = f'http://127.0.0.1:{cls.http.server_port}'
    @classmethod
    def tearDownClass(cls): cls.http.shutdown();cls.http.server_close()
    def request(self,path,body=None,origin='http://127.0.0.1',content='image/jpeg'):
        req = Request(self.url+path,data=body,headers={'Host':'127.0.0.1:8042','Origin':origin,'Content-Type':content})
        try:
            with urlopen(req,timeout=5) as r: return r.status,json.load(r)
        except HTTPError as r: return r.code,json.load(r)
    def setUp(self):
        server.state.update(ready=False,message='test model unavailable')
    def test_health_and_unready_are_honest(self):
        self.assertFalse(self.request('/health')[1]['ready'])
        self.assertEqual(self.request('/infer',b'x')[0],503)
    def test_foreign_origin_denied(self):
        self.assertEqual(self.request('/health',origin='https://example.com')[0],403)
    def test_loopback_frontend_port_allowed(self):
        self.assertEqual(self.request('/health',origin='http://127.0.0.1:8090')[0],200)
    def test_invalid_payload_and_busy(self):
        server.state['ready']=True
        self.assertEqual(self.request('/infer',b'x',content='text/plain')[0],415)
        self.assertEqual(self.request('/infer',b'x')[0],400)
        self.assertEqual(self.request('/infer',b'x'*(server.MAX_BODY+1))[0],413)
        server.lock.acquire()
        try: self.assertEqual(self.request('/infer',b'x')[0],429)
        finally: server.lock.release()
    def test_image_transport_with_test_double_only(self):
        # No model accuracy claim: this explicitly tests only the HTTP contract.
        class Fake:
            def predict(self,image): return [{'id':'test-only','score':.5}]
        previous = server.predictor
        server.predictor=Fake();server.state['ready']=True
        try:
            image=io.BytesIO();Image.new('RGB',(64,64)).save(image,format='JPEG')
            status,data=self.request('/infer',image.getvalue())
            self.assertEqual(status,200);self.assertEqual(data['attributes'][0]['id'],'test-only')
        finally: server.predictor=previous

if __name__=='__main__':unittest.main()
