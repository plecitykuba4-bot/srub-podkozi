import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toIban, formatIban, periodFor, variableSymbol, paymentMessage, spdString} from '../lib/payment.mjs';

test('Číslo účtu se převede na správný IBAN', () => {
  // Vzorové účty z dokumentace ČNB/bank s ověřeným IBAN.
  assert.equal(toIban('19-2000145399/0800'), 'CZ6508000000192000145399');
  assert.equal(toIban('178124-4159/0710'), 'CZ6907101781240000004159');
  assert.equal(toIban('CZ65 0800 0000 1920 0014 5399'), 'CZ6508000000192000145399');
  assert.equal(formatIban('CZ6508000000192000145399'), 'CZ65 0800 0000 1920 0014 5399');
});

test('Neplatné číslo účtu nebo IBAN appka odmítne', () => {
  assert.throws(() => toIban('19-2000145398/0800'), /není platné/);
  assert.throws(() => toIban('CZ6608000000192000145399'), /kontrolní součet/);
  assert.throws(() => toIban('123'), /ve tvaru/);
  assert.throws(() => toIban(''), /Zadejte/);
});

test('Období platby: týden po–pá a celý měsíc, i přes přelom roku', () => {
  const w = periodFor('2026-09-16', 'week');
  assert.deepEqual([w.period, w.from, w.to, w.label], ['2026-W38', '2026-09-14', '2026-09-18', 'týden 38/2026']);
  const m = periodFor('2026-09-16', 'month');
  assert.deepEqual([m.period, m.from, m.to, m.label], ['2026-09', '2026-09-01', '2026-09-30', 'září 2026']);
  // 1. 1. 2027 je pátek – týden patří ještě do roku 2026 (ISO týden 53).
  assert.equal(periodFor('2027-01-01', 'week').period, '2026-W53');
});

test('Variabilní symbol je jen z číslic a liší se pro týden, měsíc i firmu', () => {
  const w = variableSymbol(17, periodFor('2026-09-16', 'week'));
  const m = variableSymbol(17, periodFor('2026-09-16', 'month'));
  assert.equal(w, '2638017');
  assert.equal(m, '2669017');
  assert.notEqual(variableSymbol(18, periodFor('2026-09-16', 'week')), w);
});

test('QR Platba obsahuje účet, přesnou částku, symbol a zprávu bez diakritiky', () => {
  const period = periodFor('2026-09-16', 'week');
  const message = paymentMessage('Káča', period);
  assert.equal(message, 'Srub Podkozi - Kaca - tyden 38/2026');
  assert.equal(
    spdString({iban: 'CZ6508000000192000145399', amount: 1336050, vs: '2638017', message}),
    'SPD*1.0*ACC:CZ6508000000192000145399*AM:13360.50*CC:CZK*X-VS:2638017*MSG:Srub Podkozi - Kaca - tyden 38/2026'
  );
  assert.throws(() => spdString({iban: 'CZ6508000000192000145399', amount: 0, vs: '1', message}), /kladná/);
  assert.ok(paymentMessage('Firma * s hvězdičkou a velmi dlouhým názvem, který se nevejde', period).length <= 60);
});
