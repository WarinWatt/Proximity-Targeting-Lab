import {spent,held,charged,refunded} from './sales-engine.mjs';
const baht=v=>'฿'+(v/100).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
export function dashboardSummary(c,events){return {budget:c?.budget||0,available:c?c.budget-spent(events)-held(events):0,held:held(events),charged:charged(events),refund:refunded(events),net:spent(events),completed:events.filter(e=>e.status==='completed').length,pending:events.filter(e=>e.status==='completed'&&e.review==='pending').length};}
export function renderDashboard($,campaign,events){
 const s=dashboardSummary(campaign,events);
 const cards=[['วงเงิน campaign',baht(s.budget)],['งบพร้อมใช้',baht(s.available)],['กันไว้',baht(s.held)],['เรียกเก็บก่อนคืน',baht(s.charged)],['คืนเงินแล้ว',baht(s.refund)],['เรียกเก็บสุทธิ',baht(s.net)],['เล่นจบทั้งหมด',s.completed+' slot'],['รอตรวจบิล',s.pending+' รายการ']];
 $('dashboard-kpis').innerHTML=cards.map(([label,value])=>`<div class="kpi-card"><span>${label}</span><strong>${value}</strong></div>`).join('');
 $('dashboard-state').textContent=campaign?'เปิดทดลอง · '+campaign.name:'Draft · กรอกลูกค้าและตั้ง campaign เพื่อเริ่ม';
 $('customer-summary').textContent=campaign?`${campaign.customer.id} · ${campaign.customer.legalName} | ผู้ติดต่อ ${campaign.customer.contactName} · ${campaign.customer.email} · ${campaign.customer.phone}`:'ยังไม่มีลูกค้าที่ผูกกับ campaign · ข้อมูลด้านล่างเป็นร่าง ไม่ใช่บัญชีลูกค้าจริง';
 $('billing-customer').textContent=campaign?`ข้อมูลออกบิลจำลอง: ${campaign.customer.legalName} · ${campaign.customer.address} · เลขผู้เสียภาษี ${campaign.customer.taxId||'ไม่ระบุ'} · สาขา ${campaign.customer.branch||'ไม่ระบุ'} · ${campaign.customer.payment==='prepaid'?'เติมเงินล่วงหน้า':'ออกใบแจ้งหนี้'} (ยังไม่ทำธุรกรรมจริง)`:'ยังไม่มีข้อมูลลูกค้าสำหรับออกบิล';
}
