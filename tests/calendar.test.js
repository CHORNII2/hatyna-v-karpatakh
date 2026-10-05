// Тести чистих функцій календаря. Запуск: node tests/calendar.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addDays, addMonths, buildMonth, isNightBooked, isRangeFree,
  canCheckIn, canCheckOut, getDayStatus,
} from '../js/calendar.js';

const { bookings } = JSON.parse(readFileSync(new URL('../data/bookings.json', import.meta.url), 'utf8'));
const today = '2026-10-05';
const ctx = { today, maxDate: addMonths(today, 12), bookings };

test('addDays і addMonths: переходи через місяць, рік і кінець місяця', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(addMonths('2027-01-31', 1), '2027-02-28');
  assert.equal(addMonths('2026-10-05', 12), '2027-10-05');
});

test('buildMonth: жовтень 2026 починається з четверга, тиждень з понеділка', () => {
  const weeks = buildMonth(2026, 10);
  assert.deepEqual(weeks[0], [null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  assert.equal(weeks.flat().filter(Boolean).length, 31);
  assert.ok(weeks.every((w) => w.length === 7));
});

test('buildMonth: лютий 2028 має 29 днів, лютий 2027 — 28', () => {
  assert.equal(buildMonth(2028, 2).flat().filter(Boolean).length, 29);
  assert.equal(buildMonth(2027, 2).flat().filter(Boolean).length, 28);
});

test('isNightBooked: день заїзду зайнятий, день виїзду — ні', () => {
  assert.equal(isNightBooked('2026-10-02', bookings), true);
  assert.equal(isNightBooked('2026-10-05', bookings), true);
  assert.equal(isNightBooked('2026-10-06', bookings), false);
});

test('isRangeFree: діапазон через зайняту ніч недоступний', () => {
  assert.equal(isRangeFree('2026-10-06', '2026-10-09', bookings), true); // виїзд у день чужого заїзду
  assert.equal(isRangeFree('2026-10-06', '2026-10-10', bookings), false);
  assert.equal(isRangeFree('2026-10-12', '2026-10-25', bookings), false);
});

test('минулі дні недоступні при today = 2026-10-05', () => {
  for (const iso of ['2026-10-01', '2026-10-04', '2026-09-30']) {
    assert.equal(getDayStatus(iso, ctx), 'past', iso);
    assert.equal(canCheckIn(iso, ctx), false, iso);
  }
});

test('день виїзду можна обрати як заїзд, якщо того ж дня не починається інше бронювання', () => {
  // 11.10 — виїзд після 09–11, 21.10 — виїзд після 18–21
  for (const iso of ['2026-10-06', '2026-10-11', '2026-10-21']) {
    assert.equal(canCheckIn(iso, ctx), true, iso);
    assert.equal(getDayStatus(iso, ctx), 'free', iso);
  }
});

test('18.10: виїзд після 16–18 і заїзд 18–21 того ж дня — дата повністю зайнята', () => {
  assert.equal(canCheckIn('2026-10-18', ctx), false);
  assert.equal(getDayStatus('2026-10-18', ctx), 'busy');
});

test('«можна виїхати»: ніч зайнята, але попередня вільна', () => {
  assert.equal(getDayStatus('2026-10-09', ctx), 'checkout-only');
  assert.equal(getDayStatus('2026-10-16', ctx), 'checkout-only');
  assert.equal(canCheckOut('2026-10-06', '2026-10-09', ctx), true);
  assert.equal(getDayStatus('2026-10-10', ctx), 'busy');
});

test('сьогодні зайняте (02–06): не можна ні заїхати, ні виїхати', () => {
  assert.equal(getDayStatus(today, ctx), 'busy');
});

test('межа бронювання: 12 місяців уперед', () => {
  assert.equal(canCheckIn('2027-10-04', ctx), true);
  assert.equal(canCheckIn('2027-10-05', ctx), false);
  assert.equal(getDayStatus('2027-10-05', ctx), 'checkout-only');
  assert.equal(getDayStatus('2027-10-06', ctx), 'outside');
  assert.equal(canCheckOut('2027-10-01', '2027-10-05', ctx), true);
  assert.equal(canCheckOut('2027-10-01', '2027-10-06', ctx), false);
});

test('виїзд не може бути раніше або в день заїзду', () => {
  assert.equal(canCheckOut('2026-10-12', '2026-10-12', ctx), false);
  assert.equal(canCheckOut('2026-10-12', '2026-10-11', ctx), false);
});
