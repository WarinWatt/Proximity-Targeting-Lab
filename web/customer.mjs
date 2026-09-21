export function validateCustomer(c){
 for(const field of ['legalName','contactName','email','phone','address'])if(typeof c[field]!=='string'||!c[field].trim())throw Error('กรอกข้อมูลลูกค้า ผู้ติดต่อ อีเมล โทรศัพท์ และที่อยู่ออกบิลให้ครบ');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email))throw Error('อีเมลลูกค้าไม่ถูกต้อง');
 if(c.taxId&&!/^\d{13}$/.test(c.taxId))throw Error('เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก หรือเว้นว่าง');
 if(!['company','person'].includes(c.type)||!['prepaid','invoice'].includes(c.payment))throw Error('ประเภทลูกค้าหรือรูปแบบชำระไม่ถูกต้อง');
 return Object.freeze({...c});
}
export function readCustomer($){return validateCustomer({id:'CUS-001',type:$('customer-type').value,legalName:$('customer-name').value.trim(),contactName:$('contact-name').value.trim(),email:$('customer-email').value.trim(),phone:$('customer-phone').value.trim(),address:$('billing-address').value.trim(),taxId:$('tax-id').value.trim(),branch:$('branch').value.trim(),payment:$('payment-type').value});}
