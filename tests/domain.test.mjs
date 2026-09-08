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
