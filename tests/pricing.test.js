// Тести розрахунку вартості. Запуск: node tests/pricing.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculatePrice, getSeason } from '../js/pricing.js';

const pricing = JSON.parse(readFileSync(new URL('../data/pricing.json', import.meta.url), 'utf8'));

const calc = (checkIn, checkOut, guests = 2, pet = false) =>
  calculatePrice({ checkIn, checkOut, guests, pet }, pricing);

const codes = (result) => result.errors.map((e) => e.code);

// --- Випадки з TESTING.md ---

test('низький сезон, 2 ночі, 2 гості → 5400', () => {
  const r = calc('2026-10-12', '2026-10-14');
  assert.equal(r.nights, 2);
  assert.equal(r.total, 5400);
  assert.deepEqual(r.errors, []);
});

test('свята 25.12 → 30.12, 5 ночей, мінімум виконано → 23300', () => {
  const r = calc('2026-12-25', '2026-12-30');
  assert.equal(r.nights, 5);
  assert.equal(r.total, 23300);
  assert.deepEqual(r.errors, []);
});

test('23.12 → 27.12 зачіпає свята → помилка «мінімум 5 ночей», але ціна є', () => {
  const r = calc('2026-12-23', '2026-12-27');
  assert.equal(r.minNights, 5);
  assert.deepEqual(codes(r), ['minNights']);
  assert.match(r.errors[0].message, /мінімум 5 ночей/);
  assert.equal(r.total, 2 * 2300 + 2 * 4500 + 800);
});

test('05.01 → 12.01: 4 ночі свят + 3 високого, знижка 10% → 25640', () => {
  const r = calc('2027-01-05', '2027-01-12');
  assert.equal(r.nights, 7);
  assert.deepEqual(
    r.seasons.map((s) => [s.id, s.nights]),
    [['holiday', 4], ['high', 3]]
  );
  assert.equal(r.discount, 2760);
  assert.equal(r.total, 25640);
});

test('26.02 → 03.03.2027: 3 ночі високого + 2 низького → 15000', () => {
  const r = calc('2027-02-26', '2027-03-03');
  assert.deepEqual(
    r.seasons.map((s) => [s.id, s.nights]),
    [['high', 3], ['low', 2]]
  );
  assert.equal(r.total, 15000);
});

test('16.11 → 23.11: 7 ночей, знижка → 15290', () => {
  const r = calc('2026-11-16', '2026-11-23');
  assert.equal(r.nights, 7);
  assert.equal(r.discount, 1610);
  assert.equal(r.total, 15290);
});

test('6 гостей, 2 ночі → 6600', () => {
  const r = calc('2026-10-12', '2026-10-14', 6);
  assert.equal(r.guestSurcharge, 1200);
  assert.equal(r.total, 6600);
});

test('2 гості + тварина, 2 ночі → 5800', () => {
  const r = calc('2026-10-12', '2026-10-14', 2, true);
  assert.equal(r.petSurcharge, 400);
  assert.equal(r.total, 5800);
});

test('31.05 → 02.06: перехід низький → високий → 6300', () => {
  const r = calc('2027-05-31', '2027-06-02');
  assert.deepEqual(
    r.seasons.map((s) => [s.id, s.nights]),
    [['low', 1], ['high', 1]]
  );
  assert.equal(r.total, 6300);
});

test('28.02 → 01.03.2028: 29 лютого — високий сезон → 7200', () => {
  const r = calc('2028-02-28', '2028-03-01');
  assert.equal(r.nights, 2);
  assert.deepEqual(
    r.seasons.map((s) => [s.id, s.nights]),
    [['high', 2]]
  );
  assert.equal(r.total, 7200);
});

// --- Додаткові випадки ---

test('getSeason: межі сезонів', () => {
  assert.equal(getSeason('2026-12-24', pricing).id, 'low');
  assert.equal(getSeason('2026-12-25', pricing).id, 'holiday');
  assert.equal(getSeason('2027-01-08', pricing).id, 'holiday');
  assert.equal(getSeason('2027-01-09', pricing).id, 'high');
  assert.equal(getSeason('2027-02-28', pricing).id, 'high');
  assert.equal(getSeason('2027-03-01', pricing).id, 'low');
  assert.equal(getSeason('2027-08-31', pricing).id, 'high');
  assert.equal(getSeason('2027-09-01', pricing).id, 'low');
});

test('6 ночей — без знижки', () => {
  const r = calc('2026-11-16', '2026-11-22');
  assert.equal(r.discount, 0);
  assert.equal(r.total, 6 * 2300 + 800);
});

test('1 ніч — помилка мінімуму, розрахунок є', () => {
  const r = calc('2026-10-12', '2026-10-13');
  assert.deepEqual(codes(r), ['minNights']);
  assert.match(r.errors[0].message, /мінімум 2 ночі/);
  assert.equal(r.total, 2300 + 800);
});

test('9 гостей — помилка, розрахунок є', () => {
  const r = calc('2026-10-12', '2026-10-14', 9);
  assert.deepEqual(codes(r), ['guests']);
  assert.equal(r.total, 4600 + 5 * 300 * 2 + 800);
});

test('виїзд раніше заїзду або в той самий день — лише помилка', () => {
  for (const r of [calc('2026-10-14', '2026-10-12'), calc('2026-10-12', '2026-10-12')]) {
    assert.deepEqual(codes(r), ['checkOutBeforeCheckIn']);
    assert.equal(r.total, undefined);
  }
});

test('не дата — лише помилка', () => {
  for (const r of [calc('2027-02-30', '2027-03-02'), calc('', '2026-10-14'), calc('12.10.2026', '2026-10-14')]) {
    assert.deepEqual(codes(r), ['invalidDate']);
    assert.equal(r.total, undefined);
  }
});
