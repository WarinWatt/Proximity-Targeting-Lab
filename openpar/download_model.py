"""Download official public checkpoint in validated, resumable HTTP ranges."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import os
import requests
import shutil
import time
import subprocess

ROOT = Path(__file__).resolve().parent
URL = 'https://drive.usercontent.google.com/download?id=1Bj1Q_FjeoYBYRbmE5a_EFmBZDq_OzA67&export=download&confirm=t'
SIZE = 1291183817
PART_SIZE = 4*1024*1024

def fetch(i):
    first = i*PART_SIZE
    last = min(SIZE, first+PART_SIZE)-1
    path = ROOT/'download-parts-4m'/f'{i:03}.part'
    if path.exists() and path.stat().st_size == last-first+1: return
    for attempt in range(3):
        try:
            proc = subprocess.run(['curl.exe','--silent','--show-error','--fail','--location','--max-time','120','--connect-timeout','15','--range',f'{first}-{last}','--output',str(path),'--write-out','%{http_code}',URL],capture_output=True,text=True,timeout=130)
            if proc.returncode or proc.stdout.strip() != '206':
                raise RuntimeError('Checkpoint range download failed: '+proc.stderr)
            if path.stat().st_size != last-first+1: raise RuntimeError('Incomplete range')
            print(f'checkpoint part {i+1}/{(SIZE+PART_SIZE-1)//PART_SIZE}',flush=True)
            return
        except Exception:
            if attempt==2: raise
            time.sleep(1)

if __name__ == '__main__':
    (ROOT/'download-parts-4m').mkdir(exist_ok=True)
    count = (SIZE+PART_SIZE-1)//PART_SIZE
    with ThreadPoolExecutor(max_workers=16) as pool: list(pool.map(fetch,range(count)))
    target = ROOT/'PA100k_Checkpoint.complete.tmp'
    with target.open('wb') as out:
        for i in range(count):
            with (ROOT/'download-parts-4m'/f'{i:03}.part').open('rb') as part: shutil.copyfileobj(part,out)
    assert target.stat().st_size==SIZE
    os.replace(target,ROOT/'PA100k_Checkpoint.pth')
    print('Official checkpoint download complete',flush=True)
