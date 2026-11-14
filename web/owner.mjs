const $ = id => document.getElementById(id);
const money = new Intl.NumberFormat('th-TH', {style: 'currency', currency: 'THB'});
const count = new Intl.NumberFormat('th-TH');
async function api(action) {
  const response = await fetch(`api.php?action=${action}`, {credentials: 'same-origin', cache: 'no-store'});
  const data = await response.json();
  if (!response.ok) throw new Error(response.status === 401 ? 'กรุณาเข้าสู่ระบบ แล้วรีเฟรชข้อมูล' : response.status === 403 ? 'บัญชีนี้ไม่มีสิทธิ์ดูข้อมูล' : 'บริการข้อมูลไม่พร้อม กรุณาลองใหม่');
  return data;
}
function clear() {
  for (const id of ['charge', 'refund', 'net', 'pending-reviews', 'budget-hold', 'station-count', 'record-count']) $(id).textContent = '—';
  for (const id of ['revenue-status', 'database-status', 'health-time']) $(id).textContent = '';
  $('revenue').hidden = true;
  $('health').hidden = true;
}
async function revenue() {
  try {
    const data = await api('owner-summary');
    const s = data.summary;
    for (const id of ['charge', 'refund', 'net']) $(id).textContent = money.format(s[id] / 100);
    $('budget-hold').textContent = money.format(s.budget_hold / 100);
    $('pending-reviews').textContent = count.format(s.pending_reviews);
    $('revenue-status').textContent = `ข้อมูลสะสม ณ ${new Date(data.checked_at).toLocaleString('th-TH')}`;
  } catch (error) { $('revenue-status').textContent = error.message; }
}
async function health() {
  try {
    const data = await api('system-health');
    $('database-status').textContent = `ฐานข้อมูลอ่านได้ · เวลา query ${data.database.query_ms} ms · ตรวจเฉพาะตารางที่ใช้ในหน้านี้`;
    $('station-count').textContent = `${count.format(data.counts.stations)} ทั้งหมด · ${count.format(data.counts.active_stations)} active`;
    $('record-count').textContent = `${count.format(data.counts.runs)} runs · ${count.format(data.counts.ledger_entries)} ledger entries`;
    $('health-time').textContent = `ตรวจเมื่อ ${new Date(data.checked_at).toLocaleString('th-TH')}`;
  } catch (error) { $('database-status').textContent = error.message; }
}
async function refresh() {
  $('refresh').disabled = true;
  clear();
  $('status').textContent = 'กำลังตรวจสอบสิทธิ์และโหลดข้อมูล…';
  try {
    const {user} = await api('session');
    if (!user) throw new Error('กรุณาเข้าสู่ระบบด้วยบัญชี Owner หรือ Operator');
    if (!['owner', 'operator'].includes(user.role)) throw new Error('หน้านี้สำหรับ Owner หรือ Operator เท่านั้น');
    $('status').textContent = `${user.username} · ${user.role} · รีเฟรชเพื่ออ่านข้อมูลล่าสุด`;
    $('health').hidden = false;
    const jobs = [health()];
    if (user.role === 'owner') { $('revenue').hidden = false; jobs.push(revenue()); }
    await Promise.all(jobs);
  } catch (error) { clear(); $('status').textContent = error.message; }
  finally { $('refresh').disabled = false; }
}
$('refresh').addEventListener('click', refresh);
window.addEventListener('pagehide', clear);
window.addEventListener('pageshow', event => { if (event.persisted) refresh(); });
refresh();
