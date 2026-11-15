import {getSession} from './session-client.mjs';
import {walletNode as node, walletRequest, formatWalletMoney} from './wallet-ui.mjs';
import {parseBaht} from './money.mjs';
let disposeOwnerWallet;

export function parseWalletTHB(value) {
  const minor = parseBaht(value);
  if (minor <= 0) throw new Error('จำนวนเครดิตต้องมากกว่า 0');
  return minor;
}

export function mountOwnerWallet(target = document.getElementById('revenue') ?? document.querySelector('main')) {
  if (!target) throw new Error('Owner wallet mount target missing');
  disposeOwnerWallet?.();
  document.getElementById('owner-wallet')?.remove();
  const section = node('section');
  section.id = 'owner-wallet';
  section.dataset.wallet = 'owner';
  section.append(node('h2', 'จัดสรรเครดิตโฆษณาให้ลูกค้า'), node('p', 'Owner เท่านั้น · Grant เป็นเครดิตใช้โฆษณา ไม่ใช่เงินสดหรือหลักฐานรับชำระ'));
  const form = node('form');
  const fields = node('fieldset');
  fields.append(node('legend', 'รายการจัดสรรเครดิต'));
  const customer = node('select');
  customer.required = true;
  const amount = node('input');
  amount.type = 'text'; amount.inputMode = 'decimal'; amount.required = true; amount.autocomplete = 'off';
  amount.placeholder = '100.25'; amount.maxLength = 20;
  const reason = node('textarea');
  reason.required = true;
  for (const [title, control] of [['ลูกค้า', customer], ['จำนวนเครดิต (THB)', amount], ['เหตุผล (จำเป็น)', reason]]) {
    const label = node('label', title);
    label.append(control); fields.append(label);
  }
  const submit = node('button', 'จัดสรรเครดิต'); submit.type = 'submit';
  fields.append(submit); form.append(fields);
  const refreshButton = node('button', 'รีเฟรชลูกค้าและยอดเครดิต'); refreshButton.type = 'button';
  const balance = node('p');
  const status = node('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  section.append(refreshButton, balance, form, status); target.append(section);
  const lifecycle = new AbortController();
  let customers = [], pending = false, authorized = false, key = null, refreshQueued = false;
  let storageKey = null, savedGrant = null, restoredCustomer = '';
  const fingerprint = payload => JSON.stringify([payload.user_id, payload.amount_minor, payload.reason]);
  function restoreGrant(owner) {
    const nextStorageKey = `proximity.wallet-grant.v1:${location.pathname}:${owner.id ?? owner.username}`;
    if (storageKey === nextStorageKey) return;
    let saved;
    try {
      saved = JSON.parse(sessionStorage.getItem(nextStorageKey) ?? 'null');
      if (saved && (typeof saved.key !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(saved.key)
        || !Number.isSafeInteger(saved.payload?.user_id) || saved.payload.user_id <= 0
        || !Number.isSafeInteger(saved.payload?.amount_minor) || saved.payload.amount_minor <= 0
        || typeof saved.payload?.reason !== 'string' || !saved.payload.reason.trim()
        || saved.fingerprint !== fingerprint(saved.payload))) throw new Error('Invalid saved grant');
    } catch { throw new Error('อ่านรายการเครดิตเดิมใน sessionStorage ไม่ได้ หยุดส่งเพื่อป้องกันการจัดสรรซ้ำ'); }
    storageKey = nextStorageKey;
    savedGrant = saved;
    key = saved?.key ?? null;
    restoredCustomer = saved ? String(saved.payload.user_id) : '';
    amount.value = saved ? `${Math.floor(saved.payload.amount_minor / 100)}.${String(saved.payload.amount_minor % 100).padStart(2, '0')}` : '';
    reason.value = saved?.payload.reason ?? '';
  }
  function changed() {
    if (pending) return;
    try { if (storageKey) sessionStorage.removeItem(storageKey); }
    catch { authorized = false; controls(); status.textContent = 'ล้างรายการเดิมใน sessionStorage ไม่ได้ จึงหยุดส่งเครดิต'; return; }
    key = null; savedGrant = null; restoredCustomer = '';
    status.textContent = ''; selectedBalance();
  }
  disposeOwnerWallet = () => { lifecycle.abort(); section.remove(); };
  function controls() { fields.disabled = pending || !authorized; refreshButton.disabled = pending; }
  function selectedBalance() {
    const selected = customers.find(item => String(item.id) === customer.value);
    balance.textContent = !selected ? 'เลือกลูกค้าเพื่อดูยอดเครดิต' : `เครดิตพร้อมใช้: ${formatWalletMoney(selected.available_minor)} · Escrow แคมเปญ: ${formatWalletMoney(selected.escrow_minor)}`;
  }
  async function loadCustomers() {
    const session = await getSession(true);
    if (session.user?.role !== 'owner') { authorized = false; throw new Error('ต้องเข้าสู่ระบบด้วยบัญชี Owner'); }
    restoreGrant(session.user);
    const data = await walletRequest('wallet-customers');
    if (!Array.isArray(data.customers)) throw new Error('รายชื่อลูกค้าจาก API ไม่ถูกต้อง');
    const previous = restoredCustomer || customer.value;
    restoredCustomer = '';
    customers = data.customers;
    const placeholder = node('option', 'เลือกลูกค้า'); placeholder.value = '';
    customer.replaceChildren(placeholder);
    for (const item of customers) {
      const option = node('option', `${item.username} (#${item.id})`); option.value = String(item.id); customer.append(option);
    }
    if (previous && !customers.some(item => String(item.id) === previous)) {
      const unavailable = node('option', `ลูกค้า #${previous} ไม่พร้อมใช้งาน`);
      unavailable.value = previous; unavailable.disabled = true; customer.append(unavailable);
    }
    customer.value = previous;
    authorized = true; selectedBalance();
  }
  async function refresh() {
    if (lifecycle.signal.aborted) return;
    if (pending) { refreshQueued = true; return; }
    pending = true; controls(); balance.textContent = ''; status.textContent = 'กำลังโหลดลูกค้า…';
    try { await loadCustomers(); status.textContent = savedGrant ? 'คืนรายการเครดิตเดิมแล้ว · ส่งซ้ำใช้รหัสเดิมเพื่อป้องกันเครดิตซ้ำ · แก้ไขข้อมูลเพื่อเริ่มรายการใหม่' : customers.length ? 'ข้อมูลเครดิตจาก API พร้อมใช้งาน' : 'ยังไม่มีบัญชีลูกค้า'; }
    catch (error) { authorized = false; customers = []; customer.replaceChildren(); balance.textContent = ''; status.textContent = error.message; }
    finally { pending = false; controls(); if (refreshQueued) { refreshQueued = false; refresh(); } }
  }
  form.addEventListener('input', changed);
  customer.addEventListener('change', changed);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || !authorized) return;
    let payload;
    try {
      if (!/^\d+$/.test(customer.value) || !customers.some(item => String(item.id) === customer.value)) throw new Error('กรุณาเลือกลูกค้า');
      const userId = Number(customer.value);
      if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('รหัสลูกค้าไม่ถูกต้อง');
      if (!reason.value.trim()) throw new Error('กรุณาระบุเหตุผล');
      const amountMinor = parseWalletTHB(amount.value);
      key ??= crypto.randomUUID();
      payload = {user_id: userId, amount_minor: amountMinor, key, reason: reason.value.trim()};
      if (savedGrant && savedGrant.fingerprint !== fingerprint(payload)) throw new Error('ข้อมูลต่างจากรายการเดิม กรุณาแก้ไขช่องข้อมูลเพื่อเริ่มรายการใหม่');
      const record = {key, payload, fingerprint: fingerprint(payload)};
      // Persist before POST, including successful requests until an explicit edit.
      try { sessionStorage.setItem(storageKey, JSON.stringify(record)); }
      catch { throw new Error('บันทึกรหัสรายการใน sessionStorage ไม่ได้ จึงยังไม่ส่งเครดิต'); }
      savedGrant = record;
    } catch (error) { status.textContent = error.message; return; }
    pending = true; controls(); status.textContent = 'กำลังส่งรายการเครดิต…';
    try {
      await walletRequest('wallet-grant', payload);
      status.textContent = 'API ยืนยันรายการเครดิตแล้ว · กำลังรีเฟรชยอด';
      try { await loadCustomers(); status.textContent = 'API ยืนยันรายการเครดิตแล้ว · อัปเดตยอดเครดิตเรียบร้อย'; }
      catch (error) { balance.textContent = ''; status.textContent = `API ยืนยันรายการแล้ว แต่รีเฟรชยอดไม่สำเร็จ: ${error.message}`; }
      // Keep the key after success too: resubmitting unchanged inputs is a replay.
    } catch (error) { balance.textContent = ''; status.textContent = `${error.message} · ลองส่งรายการเดิมอีกครั้งได้ด้วยรหัสเดิม`; }
    finally { pending = false; controls(); if (refreshQueued) { refreshQueued = false; refresh(); } }
  });
  refreshButton.addEventListener('click', refresh);
  window.addEventListener('wallet-updated', refresh, {signal: lifecycle.signal});
  window.addEventListener('pagehide', () => { restoredCustomer = savedGrant ? String(savedGrant.payload.user_id) : customer.value; balance.textContent = ''; customer.replaceChildren(); customers = []; authorized = false; controls(); }, {signal: lifecycle.signal});
  window.addEventListener('pageshow', event => { if (event.persisted && section.isConnected) refresh(); }, {signal: lifecycle.signal});
  controls(); refresh();
  return {element: section, refresh};
}
