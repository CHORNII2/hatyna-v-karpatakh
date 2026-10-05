// Тести логіки сторінки бронювання. Запуск: node tests/booking.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculatePrice } from '../js/pricing.js';
import { addMonths } from '../js/calendar.js';
import {
  validateName, validatePhone, normalizePhone, formatMoney, buildRequestText, restoreDraft, DEFAULT_GUESTS,
} from '../js/booking-logic.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const pricing = read('../data/pricing.json');
const { bookings } = read('../data/bookings.json');
const today = '2026-10-05';
const ctx = { today, maxDate: addMonths(today, 12), bookings, guestsMin: 1, guestsMax: 8 };
const NB = ' ';

test('телефон: правильні формати, пробіли й дефіси дозволені', () => {
  for (const ok of ['+380671234567', '0671234567', '+380 67 123 45 67', '067-123-45-67', ' 067 123-45-67 ']) {
    assert.equal(validatePhone(ok), null, ok);
  }
  assert.equal(normalizePhone('067-123-45-67'), '+380671234567');
  assert.equal(normalizePhone('+380 67 123 45 67'), '+380671234567');
});

test('телефон: неправильні формати, помилка містить приклад', () => {
  for (const bad of ['380671234567', '+38067123456', '06712345678', '(067)1234567', '+380-67-abc-45-67', '+44 20 7946 0958']) {
    const msg = validatePhone(bad);
    assert.ok(msg, bad);
    assert.match(msg, /\+380671234567 або 0671234567/);
  }
  assert.match(validatePhone('   '), /\+380671234567 або 0671234567/);
});

test("ім'я: літери будь-якої мови, апостроф і дефіс", () => {
  for (const ok of ["Мар'яна", 'Марʼяна', 'Мар’яна', 'Анна-Марія', 'Микола', 'José', 'Анна Марія', 'Øystein']) {
    assert.equal(validateName(ok), null, ok);
  }
});

test("ім'я: невалідні значення", () => {
  for (const bad of ['1', '<b>', '', '   ', 'Я', 'Анна--Марія', "'Анна", 'Анна-', 'Mykola2']) {
    assert.ok(validateName(bad), JSON.stringify(bad));
  }
});

test('formatMoney: групування з 10 000, мінус для знижки', () => {
  assert.equal(formatMoney(5400), `5400${NB}грн`);
  assert.equal(formatMoney(25640), `25${NB}640${NB}грн`);
  assert.equal(formatMoney(-1610), `−1610${NB}грн`);
});

test('текст запиту: 12–14 жовтня, 2 гості, 5400 грн', () => {
  const data = { checkIn: '2026-10-12', checkOut: '2026-10-14', guests: 2, pet: false, name: ' Микола ', phone: '067 123 45 67' };
  const quote = calculatePrice(data, pricing);
  const expected = [
    'Запит на бронювання: Хатина в Карпатах',
    '',
    'Заїзд: 12 жовтня 2026, з 14:00',
    'Виїзд: 14 жовтня 2026, до 11:00',
    'Ночей: 2',
    'Гостей: 2',
    'Тварина: ні',
    '',
    'Вартість:',
    `- 2 ночі × 2300${NB}грн (низький сезон): 4600${NB}грн`,
    `- Прибирання: 800${NB}грн`,
    `Разом: 5400${NB}грн`,
    '',
    "Ім'я: Микола",
    'Телефон: +380671234567',
  ].join('\n');
  assert.equal(buildRequestText(data, quote, pricing), expected);
});

test('текст запиту: доплати, тварина і знижка (16–23 листопада, 6 гостей)', () => {
  const data = { checkIn: '2026-11-16', checkOut: '2026-11-23', guests: 6, pet: true, name: 'Анна-Марія', phone: '+380671234567' };
  const text = buildRequestText(data, calculatePrice(data, pricing), pricing);
  assert.match(text, new RegExp(`- Гості понад 4: 2 × 300${NB}грн × 7 ночей: 4200${NB}грн`));
  assert.match(text, new RegExp(`- Тварина: 200${NB}грн × 7 ночей: 1400${NB}грн`));
  assert.match(text, new RegExp(`- Знижка 10% від 7 ночей: −2170${NB}грн`));
  // (16100 + 4200 + 1400) × 0.9 + 800 = 20330
  assert.match(text, new RegExp(`Разом: 20${NB}330${NB}грн`));
  assert.match(text, /Тварина: так/);
});

test('кожен сезон у pricing.json має підпис label', () => {
  for (const s of pricing.seasons) assert.match(s.label ?? '', /\S+ сезон$/, s.id);
});

test('текст запиту: підпис сезону з pricing.json (5–12 січня — святковий і високий)', () => {
  const data = { checkIn: '2027-01-05', checkOut: '2027-01-12', guests: 2, pet: false, name: 'Микола', phone: '0671234567' };
  const text = buildRequestText(data, calculatePrice(data, pricing), pricing);
  assert.match(text, new RegExp(`- 4 ночі × 4500${NB}грн \\(святковий сезон\\): 18${NB}000${NB}грн`));
  assert.match(text, new RegExp(`- 3 ночі × 3200${NB}грн \\(високий сезон\\): 9600${NB}грн`));
  assert.match(text, new RegExp(`Разом: 25${NB}640${NB}грн`));
  assert.doesNotMatch(text, /свята сезон/);
});

test('чернетка: вільні дати й дані відновлюються', () => {
  const raw = JSON.stringify({ checkIn: '2026-10-12', checkOut: '2026-10-14', guests: 6, pet: true, name: 'Мар\'яна', phone: '0671234567' });
  assert.deepEqual(restoreDraft(raw, ctx), {
    checkIn: '2026-10-12', checkOut: '2026-10-14', guests: 6, pet: true, name: "Мар'яна", phone: '0671234567', datesReset: false,
  });
});

test('чернетка: дати в минулому скидаються, решта лишається', () => {
  const raw = JSON.stringify({ checkIn: '2026-09-20', checkOut: '2026-09-23', guests: 3, name: 'Микола', phone: '0671234567' });
  const d = restoreDraft(raw, ctx);
  assert.equal(d.checkIn, null);
  assert.equal(d.checkOut, null);
  assert.equal(d.datesReset, true);
  assert.equal(d.guests, 3);
  assert.equal(d.name, 'Микола');
  assert.equal(d.phone, '0671234567');
});

test('чернетка: дати, що тепер перетинають бронювання, скидаються', () => {
  const d = restoreDraft(JSON.stringify({ checkIn: '2026-10-15', checkOut: '2026-10-17', name: 'Микола' }), ctx);
  assert.equal(d.checkIn, null);
  assert.equal(d.datesReset, true);
  assert.equal(d.name, 'Микола');
});

test('чернетка: лише заїзд — зберігається, якщо вільний', () => {
  assert.equal(restoreDraft(JSON.stringify({ checkIn: '2026-10-12', checkOut: null }), ctx).checkIn, '2026-10-12');
  assert.equal(restoreDraft(JSON.stringify({ checkIn: '2026-10-16', checkOut: null }), ctx).checkIn, null);
});

test('чернетка: гості поза межами й сміття — значення за замовчуванням', () => {
  assert.equal(restoreDraft(JSON.stringify({ guests: 12 }), ctx).guests, DEFAULT_GUESTS);
  assert.equal(restoreDraft(JSON.stringify({ guests: '5' }), ctx).guests, DEFAULT_GUESTS);
  for (const raw of [null, '', 'не json', '[1,2]', '42', JSON.stringify({ checkIn: 'abc', checkOut: 'zzz' })]) {
    const d = restoreDraft(raw, ctx);
    assert.equal(d.checkIn, null, String(raw));
    assert.equal(d.guests, DEFAULT_GUESTS, String(raw));
    assert.equal(d.name, '', String(raw));
  }
});
