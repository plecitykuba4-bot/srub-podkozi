import {test} from 'node:test';
import assert from 'node:assert/strict';
import {closed,validDate,portionPrice,pragueNow} from '../domain.mjs';
test('Česká uzávěrka: 07:59 ano, 08:00 ne, po 11:00 stále ne',()=>{
 assert.equal(closed('2026-09-09',new Date('2026-09-09T05:59:59Z')),false);
 assert.equal(closed('2026-09-09',new Date('2026-09-09T06:00:00Z')),true);
 assert.equal(closed('2026-09-09',new Date('2026-09-09T10:00:00Z')),true);
 assert.equal(closed('2026-09-10',new Date('2026-09-09T10:00:00Z')),false);
 assert.equal(closed('2026-09-08',new Date('2026-09-09T01:00:00Z')),true);
});
test('Zimní čas a český den fungují nezávisle na časové zóně serveru',()=>{
 assert.equal(closed('2026-12-10',new Date('2026-12-10T06:59:59Z')),false);
 assert.equal(closed('2026-12-10',new Date('2026-12-10T07:00:00Z')),true);
 assert.equal(pragueNow(new Date('2026-09-08T22:30:00Z')).date,'2026-09-09');
});
test('Validace datumu odmítne neexistující den',()=>{assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2026-09-09'),true);assert.equal(validDate('tomorrow'),false);});
test('Firemní cena hlavního jídla neovlivní polévku',()=>{
 const company={price:13900,soup_price:null};
 assert.equal(portionPrice({price:16500,category:'Hlavní jídlo'},company),13900);
 assert.equal(portionPrice({price:6000,category:'Polévka'},company),6000);
 assert.equal(portionPrice({price:6000,category:'Polévka'},{...company,soup_price:4500}),4500);
});

test('Firma má vlastní cenu pro každé ze čtyř hlavních jídel', () => {
 const company={price:13900,soup_price:5000,price_m1:11900,price_m2:null,price_m3:15900,price_m4:null};
 const main=(slot,price)=>({price,category:'Hlavní jídlo',slot});
 assert.equal(portionPrice(main(1,16500),company),11900,'M1 má sjednanou cenu');
 assert.equal(portionPrice(main(3,16500),company),15900,'M3 má sjednanou cenu');
 assert.equal(portionPrice(main(2,16500),company),13900,'M2 spadne na obecnou firemní cenu');
 assert.equal(portionPrice(main(2,16500),{...company,price:null}),16500,'bez firemní ceny platí cena z lístku');
 assert.equal(portionPrice({price:6000,category:'Polévka',slot:0},company),5000,'polévka se řídí svou cenou');
});
