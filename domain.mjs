export function pragueNow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`, hour:Number(parts.hour)};
}
export function validDate(date) { return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10)===date; }
export function closed(date, now = new Date()) { const p=pragueNow(now); return date<p.date || (date===p.date && p.hour>=8); }
export function money(value) { const n=Number(value); if(!Number.isFinite(n)||n<0||n>10000) throw new Error('Cena musí být mezi 0 a 10 000 Kč.'); return Math.round(n*100); }
// Firma může mít sjednanou vlastní cenu pro každé ze čtyř hlavních jídel (M1–M4).
// meal.slot je pořadí hlavního jídla v daném dni; 0 nebo chybějící slot znamená polévku.
export function portionPrice(meal, company) {
 if (meal.category === 'Polévka') return company.soup_price ?? meal.price;
 const perSlot = meal.slot >= 1 && meal.slot <= 4 ? company[`price_m${meal.slot}`] : null;
 return perSlot ?? company.price ?? meal.price;
}
export function dayAfter(date, days) {const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
