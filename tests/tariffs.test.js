// Перевіряє, що тарифи в index.html збігаються з data/pricing.json.
// Запуск: node tests/tariffs.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getSeason, toISODate } from '../js/pricing.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const pricing = JSON.parse(read('../data/pricing.json'));
const html = read('../index.html');

// Число з видимого тексту клітинки: «4500 грн» → 4500
const toNumber = (text) => Number(text.replace(/<[^>]*>/g, '').replace(/\D/g, ''));
const byPath = (obj, path) => path.split('.').reduce((o, key) => o?.[key], obj);

const tableRows = [...html.matchAll(/<tr data-season="(\w+)">([\s\S]*?)<\/tr>/g)];

test('таблиця містить усі сезони з pricing.json', () => {
  assert.deepEqual(
    tableRows.map((r) => r[1]).sort(),
    pricing.seasons.map((s) => s.id).sort()
  );
});

test('ціна за ніч і мінімум ночей у таблиці збігаються з pricing.json', () => {
  for (const [, id, rowHtml] of tableRows) {
    const season = pricing.seasons.find((s) => s.id === id);
    const cells = Object.fromEntries(
      [...rowHtml.matchAll(/<td[^>]*data-field="(\w+)"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => [m[1], toNumber(m[2])])
    );
    assert.equal(cells.pricePerNight, season.pricePerNight, `${id}: ціна`);
    assert.equal(cells.minNights, season.minNights, `${id}: мінімум ночей`);
  }
});

test('доплати під таблицею збігаються з pricing.json', () => {
  const fields = [...html.matchAll(/<span[^>]*data-field="([\w.]+)"[^>]*>([^<]*)<\/span>/g)];
  assert.ok(fields.length >= 6, 'знайдено замало полів доплат');
  for (const [, path, text] of fields) {
    assert.equal(toNumber(text), byPath(pricing, path), path);
  }
});

test('сегменти стрічки року рахуються з меж сезонів (від 1 березня, 365 днів)', () => {
  // Невисокосний рік: 1.03.2026 – 28.02.2027
  const start = Date.UTC(2026, 2, 1);
  const expected = [];
  for (let i = 0; i < 365; i++) {
    const id = getSeason(toISODate(new Date(start + i * 86400000)), pricing).id;
    const last = expected.at(-1);
    if (last && last.id === id) last.days += 1;
    else expected.push({ id, days: 1 });
  }

  const actual = [...html.matchAll(/class="year__seg[^"]*" data-season="(\w+)" style="--days: (\d+)/g)].map((m) => ({
    id: m[1],
    days: Number(m[2]),
  }));
  assert.deepEqual(actual, expected);
});

test('ціни в підписах стрічки збігаються з pricing.json', () => {
  const segs = [...html.matchAll(/data-season="(\w+)" style="--days[^>]*>([\s\S]*?)<\/div>/g)];
  for (const [, id, segHtml] of segs) {
    const price = pricing.seasons.find((s) => s.id === id).pricePerNight;
    assert.match(segHtml, new RegExp(`${price} грн`), `${id}: ціна в підписі`);
  }
});
