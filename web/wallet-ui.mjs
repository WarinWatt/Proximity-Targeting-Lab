import {getSession} from './session-client.mjs';
let disposeWallet;

export function walletNode(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}

// Integer minor units only: preserve cents without floating point rounding.
export function formatWalletMoney(value) {
  if (!/^-?\d+$/.test(String(value)) || value == null) return 'ไม่พร้อมแสดง';
  const amount = BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? '-' : ''}฿${(absolute / 100n).toLocaleString('th-TH')}.${String(absolute % 100n).padStart(2, '0')}`;
}

export async function walletRequest(action, body) {
  const options = {credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000)};
  if (body !== undefined) {
    const session = await getSession(true);
    if (!session.user || session.user.role !== 'owner') throw new Error('ต้องเข้าสู่ระบบด้วยบัญชี Owner');
    options.method = 'POST';
    options.headers = {'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf};
    options.body = JSON.stringify(body);
  }
  let response;
  try { response = await fetch(`api.php?action=${encodeURIComponent(action)}`, options); }
  catch { throw new Error('เชื่อมต่อ API ไม่สำเร็จ กรุณาลองใหม่ด้วยรายการเดิม'); }
  let data;
  try { data = await response.json(); }
  catch { throw new Error(`API ตอบกลับไม่ถูกต้อง (HTTP ${response.status})`); }
  if (!response.ok) {
    const fallback = response.status === 401 ? 'กรุณาเข้าสู่ระบบใหม่' : response.status === 403 ? 'ไม่มีสิทธิ์ทำรายการ' : 'ทำรายการไม่สำเร็จ';
    throw new Error(`HTTP ${response.status}: ${typeof data?.error === 'string' ? data.error : fallback}`);
  }
  return data;
}

export function mountWallet(target = document.querySelector('main')) {
  if (!target) throw new Error('Wallet mount target missing');
  disposeWallet?.();
  document.getElementById('advertiser-wallet')?.remove();
  const section = walletNode('section');
  section.id = 'advertiser-wallet';
  section.dataset.wallet = 'advertiser';
  section.append(walletNode('h2', 'กระเป๋าเครดิตโฆษณา'), walletNode('p', 'เครดิตที่ Owner จัดสรรให้ใช้โฆษณา · ไม่ใช่เงินสดหรือยอดรับชำระ · หน่วย THB'));
  const refreshButton = walletNode('button', 'รีเฟรชกระเป๋า');
  refreshButton.type = 'button';
  const status = walletNode('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const balances = walletNode('div', undefined, 'arch-grid');
  const history = walletNode('div');
  const historyDetails=walletNode('details');historyDetails.append(walletNode('summary','ดูประวัติเครดิต'),history);
  section.append(refreshButton, status, balances, historyDetails);
  target.append(section);
  const lifecycle = new AbortController();
  let pending = false, refreshQueued = false;
  disposeWallet = () => { lifecycle.abort(); section.remove(); };
  async function refresh() {
    if (lifecycle.signal.aborted) return;
    if (pending) { refreshQueued = true; return; }
    pending = true;
    refreshButton.disabled = true;
    balances.replaceChildren();
    history.replaceChildren();
    status.textContent = 'กำลังโหลดเครดิต…';
    try {
      const session = await getSession(true);
      if (!session.user) throw new Error('กรุณาเข้าสู่ระบบเพื่อดูกระเป๋าเครดิต');
      const data = await walletRequest('wallet');
      if (!Array.isArray(data.ledger)) throw new Error('ข้อมูลประวัติจาก API ไม่ถูกต้อง');
      for (const [label, value] of [['เครดิตพร้อมใช้', data.available_minor], ['เครดิตจัดสรรให้แคมเปญ', data.escrow_minor]]) {
        const card = walletNode('article');
        card.append(walletNode('h3', label), walletNode('p', formatWalletMoney(value)));
        balances.append(card);
      }
      if (!data.ledger.length) history.append(walletNode('p', 'ยังไม่มีรายการเครดิต'));
      for (const entry of data.ledger) {
        const row = walletNode('article');
        row.append(walletNode('h4', `#${entry.id ?? '—'} · ${entry.kind ?? 'รายการเครดิต'}`), walletNode('p', formatWalletMoney(entry.amount_minor)));
        for (const field of ['created_at', 'reason', 'campaign_id']) {
          if (entry[field] != null) row.append(walletNode('p', `${field}: ${entry[field]}`));
        }
        history.append(row);
      }
      status.textContent = `ปรับปรุงยอดล่าสุด ${new Date().toLocaleString('th-TH')}`;
    } catch (error) { balances.replaceChildren(); history.replaceChildren(); status.textContent = error.message; }
    finally {
      pending = false; refreshButton.disabled = false;
      if (refreshQueued) { refreshQueued = false; refresh(); }
    }
  }
  refreshButton.addEventListener('click', refresh);
  window.addEventListener('wallet-updated', refresh, {signal: lifecycle.signal});
  window.addEventListener('pagehide', () => { balances.replaceChildren(); history.replaceChildren(); status.textContent = ''; }, {signal: lifecycle.signal});
  window.addEventListener('pageshow', event => { if (event.persisted && section.isConnected) refresh(); }, {signal: lifecycle.signal});
  refresh();
  return {element: section, refresh};
}
