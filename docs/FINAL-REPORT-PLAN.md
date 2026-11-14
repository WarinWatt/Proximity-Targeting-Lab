# แผนหลักฐานรายงานฉบับสมบูรณ์

แหล่งโครงการ: FF69.pdf, รหัส 217383 / 69A306000040; ตรวจ 15 พฤศจิกายน 2569

## โครงรายงาน

1. บทนำและวัตถุประสงค์: เชื่อมวัตถุประสงค์หน้า 5 กับผลที่พิสูจน์ได้
2. วรรณกรรมและ baseline: แยกผลงานเดิมที่ระบุหน้า 19–23 จากผลต้นแบบรอบนี้
3. วิธีวิจัย: dataset, สิทธิ์ใช้, split ระดับบุคคล/วิดีโอ, annotation guide, model version, hardware, seed, ethics scope
4. การออกแบบ: centralized database, distributed inference/cache/player, auction, RBAC, billing ledger และ UI รายบทบาท
5. ผลทดลอง: ประชากรศาสตร์, จิตวิทยา, engagement, annotation และการทดสอบสามฝั่ง
6. อภิปรายข้อจำกัด ความคลาดเคลื่อนจากข้อเสนอ และความพร้อมใช้งาน
7. ผลผลิต ผลลัพธ์ งบประมาณ และหลักฐานส่งมอบ
8. ภาคผนวก: test logs, screenshots, dataset manifest, model cards, deployment guide และ trace การคิดบิล

## ตารางหลักฐานที่ต้องเติม

| งาน | ตัวชี้วัด | หลักฐานที่ต้องมี | สถานะ |
|---|---|---|---|
| ประชากรศาสตร์ | macro-F1, balanced accuracy, age MAE, per-group errors | held-out labels, predictions, model hash | ยังไม่มีผลยืนยัน |
| จิตวิทยา | macro-F1, calibration, split leakage | dataset ที่มีสิทธิ์และ label ที่ตรวจสอบได้ | ยังไม่มีผลยืนยัน; ไม่อนุมานจากใบหน้า |
| Engagement | gaze precision/recall, dwell MAE, false charge rate | timeline annotation เทียบ playback | simulation เท่านั้น |
| Annotation | kappa, IoU, disagreement | guide, double annotation, adjudication log | ยังต้องทำ |
| โฆษณา/เจ้าของผลิตภัณฑ์ | purchase success, A/B counts, refund reconciliation | workflow traces และ API tests | ต้นแบบ |
| ผู้ให้บริการ | cache hit, offline recovery, duplicate commands | station logs, concurrent 5-screen runs | ยังต้องทดสอบรวม |
| ระบบกระจาย | p50/p95/p99, throughput, watts | environment และ raw benchmark | ยังไม่มีผลยืนยัน |

ทุก experiment เก็บ run ID, commit, config, dataset/model versions, hardware, timestamp, sample size, exclusions และ raw results ก่อนสรุปผล ห้ามนับ software tests เป็น model accuracy หรือ business uplift

## ประเด็นที่ต้องชี้แจงก่อนปิดรายงาน

- หน้า 5 ระบุอายุ 18–40 แต่หน้า 6 ระบุ 18–45 ต้องยืนยันขอบเขตสุดท้าย
- หน้า 6 วางแผนเก็บภาพสถานที่จริง แต่ทิศทางปัจจุบันเป็นวิดีโอเดิม/จำลอง ต้องรายงานการเปลี่ยนวิธีและผลต่อความเที่ยงตรงตามจริง
- หน้า 17 ระบุไม่มีการวิจัยในมนุษย์ แต่การใช้วิดีโอคนจริงต้องมีผลพิจารณาจากหน่วยงานจริยธรรมตามขอบเขตจริง
- หน้า 18 ตั้งเป้า TRL/SRL 7; software tests และ simulation ยังไม่พิสูจน์ operational environment หรือ stakeholder validation
- stack ในข้อเสนอ (Go/Vue/RabbitMQ/Swarm) ต่างจากต้นแบบปัจจุบัน ต้องอธิบายเหตุผลและ benchmark ก่อนกล่าวอ้างความเทียบเท่า
- เกณฑ์ engagement > ครึ่งคลิปและ premium 25% เป็นกติกาทดลองของต้นแบบ ต้องระบุเวอร์ชันและตรวจงบรวม premium ก่อนใช้จริง

## การอัปเดตประจำหน้า

แก้ web/page-report.mjs ทุกครั้งที่แก้หน้า: มีแล้ว / ยังต้องทำ / หลักฐาน / ตัวชี้วัด ห้ามเลื่อนสถานะเป็นผ่านหากไม่มีผลทดสอบรองรับ บันทึกนี้แสดงผ่าน session-bar และดาวน์โหลด JSON ได้ ข้อมูลยังเป็น source-controlled register ไม่มีตารางฐานข้อมูลใหม่
