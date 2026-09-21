# OpenPAR webcam attribute service (local research prototype)

Frontend: `../web/openpar.html`

After starting the web stack, open `http://127.0.0.1:8090/openpar.html`. Camera permission is requested only on click. One manually framed person per request; no detector, tracker, segmentation, relationship inference or billing. Browser hides/stops camera and clears results on tab hiding or navigation. Snapshot processing only, not real-time FPS.

## Run

Use `.venv/Scripts/python.exe server.py` from this directory. Binds only `127.0.0.1:8042`. Only loopback frontend origins are accepted. The service exposes `/health` and `/infer`, accepts JPEG up to 2 MB and 4 megapixels, processes one inference at a time and stores no images. It does not send user images to external services. This is not a production hosting setup or a service for remote warin.me clients.

## Model provenance

- Official source: https://github.com/Event-AHU/OpenPAR/tree/main/PromptPAR
- Source revision: `15de98ac66e9e834029074d2375571b1bbd281b0`.
- Checkpoint: official README Google Drive folder, `PA100k_Checkpoint.pth`, ID `1Bj1Q_FjeoYBYRbmE5a_EFmBZDq_OzA67`.
- Setup: Python 3.10, existing CPU torch 2.4.1 / torchvision 0.19.1, isolated venv with system-site-packages; additional tokenizer/download packages installed only in venv.
- Retain the vendor MIT license. Check checkpoint/dataset usage terms separately before commercial deployment.
- Local vendor edits in `models/base_block.py`: optional backbone initialization (complete classifier weights must load strictly); device-neutral nonpersistent text buffer; removed hard-coded CUDA text transfer. No retraining.
- Adapter reads the exact 26 prompt strings/order from author's PA100K preprocessing script without importing/executing that script; 224x224 resize and normalization mean/std 0.5; sigmoid of classifier output as in author's validation code. `vis_embed` is remapped to `visual_embed` as in author's test script. Both weight dictionaries must load strictly. Checkpoint loading uses `weights_only=True` and does not fall back to arbitrary pickle execution.
- Released PA100K checkpoint contains an extra initialization `vit.*` subtree absent in current source. Adapter verifies the duplicated final-block/norm tensors match their active aliases, then excludes this unused subtree. Active classifier and CLIP parameters still load strictly; no missing active weights are accepted.
- `Female` is a dataset appearance label, not verified identity. Do not infer male from its absence. Age bins and direction may conflict; outputs remain independent. Confidence scores are uncalibrated. UI 0.70/0.30 thresholds are exploratory, not validated operating points.

## Verification

From the repository root: `node --test web/*.test.mjs`

Model smoke tests can use the existing AI-generated persona atlas cropped to a single person, never a user's webcam without explicit interaction. This tests execution, not accuracy or calibration on real CCTV.

Checkpoint download can be resumed with `.venv/Scripts/python.exe download_model.py`. The service waits for the complete official byte size before loading. If weights cannot load strictly, health stays unready and no scores are returned. Frontend periodically checks readiness while visible. Do not interpret UI/API transport tests as a successful model inference test.

Verified 2026-09-04: `smoke_model.py` completed real inference through HTTP using one cropped AI-generated persona; 26 finite sigmoid outputs, 4276 ms inference on this CPU. This is an execution smoke test, not a webcam/CCTV accuracy benchmark or a guaranteed latency. Real webcam permissions and capture are left for the user to exercise.
