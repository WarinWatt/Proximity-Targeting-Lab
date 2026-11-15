// Exact THB decimal parsing; never silently round a bid, budget or grant.
export function parseBaht(value){
 const text=String(value).trim();if(!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(text))throw Error('กรอกจำนวนเงินไม่ติดลบและทศนิยมไม่เกิน 2 ตำแหน่ง');
 const [whole,fraction='']=text.split('.');const minor=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(minor)||minor>100000000)throw Error('จำนวนเงินเกินขอบเขตที่รองรับ');return minor;
}
