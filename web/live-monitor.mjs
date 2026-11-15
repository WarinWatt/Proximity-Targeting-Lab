const $ = id => document.getElementById(id);
const cards = new Map();
let timer, controller, pending = false, stopped = false, generation = 0;
function node(tag, text) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = String(text);
  return element;
}
class RoleError extends Error {}
async function get(action, signal) {
  const response = await fetch(`api.php?action=${action}`, {credentials: 'same-origin', cache: 'no-store', signal});
  if (response.status === 401 || response.status === 403) throw new RoleError('ต้องเข้าสู่ระบบด้วยบัญชี Operator หรือ Owner · หยุดอัปเดตแล้ว');
  if (!response.ok) throw new Error(`API ไม่พร้อม (HTTP ${response.status})`);
  return response.json();
}
function clearMedia(card) {
  for (const video of card.preview.querySelectorAll('video')) { video.pause(); video.removeAttribute('src'); video.load(); }
  card.preview.replaceChildren();
}
function clearCards() {
  for (const card of cards.values()) clearMedia(card);
  cards.clear(); $('monitor-stations').replaceChildren();
}
function render(stations, runs, campaigns) {
  const selected = [...stations].sort((a, b) => Number(a.id) - Number(b.id)).slice(0, 5);
  const ids = new Set(selected.map(station => String(station.id)));
  for (const [id, card] of cards) if (!ids.has(id)) { clearMedia(card); card.root.remove(); cards.delete(id); }
  const sortedRuns = [...runs].sort((a, b) => Number(b.id) - Number(a.id));
  for (const station of selected) {
    const id = String(station.id);
    let card = cards.get(id);
    if (!card) {
      const root = node('article'), title = node('h2'), config = node('p'), current = node('div'), last = node('div'), preview = node('div');
      root.append(title, config, node('p', 'Camera / Screen health: Unknown · ไม่มี heartbeat'), current, last);
      const button = node('button', 'เลือกดูคลิปต้นฉบับ (ไม่ใช่ภาพสด)'); button.type = 'button';
      const close = node('button', 'ปิดคลิป'); close.type = 'button';
      root.append(button, close, preview); $('monitor-stations').append(root);
      card = {root, title, config, current, last, preview, button, mediaId: null};
      cards.set(id, card);
      button.addEventListener('click', () => {
        if (card.mediaId == null) return;
        clearMedia(card);
        const video = node('video'); video.controls = true; video.playsInline = true; video.preload = 'none';
        video.setAttribute('width', '240');
        video.src = `api.php?action=cycle-media&id=${encodeURIComponent(card.mediaId)}`;
        video.addEventListener('error', () => { const message = node('p', 'อ่านคลิปไม่ได้ กรุณาตรวจสิทธิ์หรือรีเฟรช'); preview.append(message); }, {once: true});
        preview.append(node('p', `คลิปต้นฉบับ Campaign #${card.mediaId} · กด Play เอง · การดูนี้ไม่เปลี่ยนสถานะรอบเล่น`), video);
      });
      close.addEventListener('click', () => clearMedia(card));
    }
    card.title.textContent = `จอ / สถานี #${id} · ${station.name ?? 'ไม่ระบุชื่อ'}`;
    card.config.textContent = Number(station.active) === 1 ? 'ทะเบียน: Active configuration · ไม่ใช่ Online' : 'ทะเบียน: Archived configuration';
    const stationRuns = sortedRuns.filter(run => String(run.station_id) === id);
    const playing = stationRuns.find(run => run.state === 'playing');
    const queued = stationRuns.find(run => run.state === 'queued');
    const completed = stationRuns.find(run => run.state === 'completed');
    card.current.replaceChildren(node('h3', 'สถานะ API ปัจจุบัน'));
    for (const [label, run] of [['Playing', playing], ['Queued', queued]]) {
      card.current.append(node('p', run ? `${label}: Run #${run.id} · Campaign #${run.campaign_id} · state=${run.state} · started_at=${run.started_at ?? '—'}` : `${label}: ไม่พบในข้อมูล API ล่าสุด`));
    }
    card.last.replaceChildren(node('h3', 'รอบจบล่าสุดในข้อมูล API'), node('p', completed ? `Run #${completed.id} · Campaign #${completed.campaign_id} · state=${completed.state} · completed_at=${completed.completed_at ?? '—'} · review=${completed.review ?? '—'}` : 'ไม่พบรอบ completed ในข้อมูล API ล่าสุด'));
    const candidate = playing ?? queued ?? completed;
    const campaign = candidate && campaigns.find(item => String(item.id) === String(candidate.campaign_id));
    card.mediaId = campaign?.id ?? null;
    card.button.disabled = card.mediaId == null;
    card.button.textContent = campaign ? `เลือกดูคลิปต้นฉบับ #${campaign.id} · ${campaign.title ?? ''}` : 'ยังไม่มีคลิปให้เลือกดู';
    // Leave an opened video intact across polls, even when the latest run changes.
  }
  if (!selected.length) $('monitor-status').textContent = 'API ไม่พบทะเบียนสถานี';
}
function schedule() {
  clearTimeout(timer);
  if (!stopped && !document.hidden) timer = setTimeout(poll, 10000);
}
async function poll() {
  if (pending || stopped || document.hidden) return;
  pending = true; $('monitor-refresh').disabled = true;
  const version = generation;
  controller = new AbortController();
  const timeout = setTimeout(() => controller?.abort(), 10000);
  try {
    const {user} = await get('session', controller.signal);
    if (!user || !['operator', 'owner'].includes(user.role)) throw new RoleError('ต้องเข้าสู่ระบบด้วยบัญชี Operator หรือ Owner · หยุดอัปเดตแล้ว');
    const [data, stationData] = await Promise.all([get('cycle-list', controller.signal), get('stations', controller.signal)]);
    if (version !== generation || document.hidden) return;
    if (!Array.isArray(data.runs) || !Array.isArray(data.campaigns) || !Array.isArray(stationData.stations)) throw new Error('รูปแบบข้อมูล API ไม่ถูกต้อง');
    $('monitor-status').textContent = `ข้อมูล API ล่าสุด ${new Date().toLocaleString('th-TH')} · ไม่ใช่หลักฐานว่าอุปกรณ์ออนไลน์`;
    render(stationData.stations, data.runs, data.campaigns);
  } catch (error) {
    if (version !== generation) return;
    if (error instanceof RoleError) { stopped = true; clearCards(); }
    else for (const card of cards.values()) card.button.disabled = true;
    $('monitor-status').textContent = error instanceof RoleError ? error.message : 'อ่านข้อมูลล่าสุดไม่ได้ · ข้อมูลที่ยังแสดงอาจเก่า · จะลองใหม่ใน 10 วินาที';
  } finally {
    clearTimeout(timeout); controller = null; pending = false;
    $('monitor-refresh').disabled = stopped;
    schedule();
  }
}
$('monitor-refresh').addEventListener('click', () => { clearTimeout(timer); poll(); });
document.addEventListener('visibilitychange', () => {
  clearTimeout(timer);
  if (document.hidden) {
    generation++; controller?.abort();
    for (const card of cards.values()) for (const video of card.preview.querySelectorAll('video')) video.pause();
    $('monitor-status').textContent = 'พักการอัปเดตเมื่อซ่อนหน้า · ข้อมูลที่แสดงอาจเก่า';
  } else if (!pending) poll();
});
window.addEventListener('pagehide', () => { generation++; clearTimeout(timer); controller?.abort(); clearCards(); });
window.addEventListener('pageshow', event => { if (event.persisted && !stopped) poll(); });
poll();
