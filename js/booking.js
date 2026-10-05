// Сторінка бронювання: зв'язує календар, гостей, картку вартості, форму, підтвердження й чернетку.
import { createCalendar, addMonths, formatDate } from './calendar.js';
import { calculatePrice, nightsWord } from './pricing.js';
import {
  validateName, validatePhone, normalizePhone, formatMoney, quoteLines, buildRequestText, restoreDraft, DEFAULT_GUESTS,
} from './booking-logic.js';

const DRAFT_KEY = 'hatyna-draft';
const LIVE_DELAY_MS = 700;

const $ = (id) => document.getElementById(id);
const el = {
  layout: $('booking-layout'),
  loadError: $('load-error'),
  draftNotice: $('draft-notice'),
  calendar: $('calendar'),
  legend: document.querySelector('.cal-legend'),
  guests: $('guests'),
  guestsHint: $('guests-hint'),
  stepButtons: document.querySelectorAll('[data-step]'),
  pet: $('pet'),
  quoteBody: $('quote-body'),
  quoteLive: $('quote-live'),
  form: $('booking-form'),
  name: $('name'),
  phone: $('phone'),
  submit: $('submit'),
  submitReason: $('submit-reason'),
  bookingView: $('booking-view'),
  confirm: $('confirm'),
  confirmTitle: $('confirm-title'),
  confirmSummary: $('confirm-summary'),
  copy: $('copy'),
  copyStatus: $('copy-status'),
  requestText: $('request-text'),
  edit: $('edit'),
};

const state = { checkIn: null, checkOut: null, quote: null };
let pricing;

const fields = [
  { input: el.name, error: $('name-error'), validate: validateName, touched: false },
  { input: el.phone, error: $('phone-error'), hint: $('phone-hint'), validate: validatePhone, touched: false },
];

// ---------- Дані й чернетка ----------

function localToday() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function loadJSON(url) {
  // no-cache: браузер перевіряє, чи змінився файл, і не бере застарілі тарифи з кешу
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

function readDraft() {
  try {
    return localStorage.getItem(DRAFT_KEY);
  } catch {
    return null; // сховище заборонене (приватний режим) — працюємо без чернетки
  }
}

function saveDraft() {
  const guests = readGuests();
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      checkIn: state.checkIn,
      checkOut: state.checkOut,
      guests: Number.isNaN(guests) ? null : guests,
      pet: el.pet.checked,
      name: el.name.value,
      phone: el.phone.value,
    }));
  } catch {
    // Немає місця або доступу — чернетка просто не збережеться
  }
}

// ---------- Розрахунок і картка ----------

function readGuests() {
  const value = el.guests.value.trim();
  return /^\d+$/.test(value) ? Number(value) : NaN;
}

function currentData() {
  return {
    checkIn: state.checkIn,
    checkOut: state.checkOut,
    guests: readGuests(),
    pet: el.pet.checked,
    name: el.name.value,
    phone: el.phone.value,
  };
}

function textEl(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function renderQuote() {
  const body = el.quoteBody;
  body.replaceChildren();
  if (!state.checkIn) {
    body.append(textEl('p', 'Оберіть дати заїзду й виїзду в календарі.', 'quote__empty'));
    return;
  }
  if (!state.checkOut) {
    body.append(textEl('p', `Заїзд ${formatDate(state.checkIn)}. Тепер оберіть дату виїзду.`, 'quote__empty'));
    return;
  }

  const q = state.quote;
  body.append(textEl('p', `${formatDate(state.checkIn, false)} – ${formatDate(state.checkOut)}, ${q.nights} ${nightsWord(q.nights)}`, 'quote__dates'));

  const list = document.createElement('ul');
  list.className = 'quote__lines';
  for (const line of quoteLines(q, { guests: readGuests() }, pricing)) {
    const li = document.createElement('li');
    if (line.amount < 0) li.className = 'is-discount';
    li.append(textEl('span', line.label), textEl('span', formatMoney(line.amount), 'quote__amount'));
    list.append(li);
  }
  body.append(list);

  const total = document.createElement('p');
  total.className = 'quote__total';
  total.append(textEl('span', 'Разом'), textEl('strong', formatMoney(q.total)));
  body.append(total);

  if (q.errors.length) {
    const errors = document.createElement('ul');
    errors.className = 'quote__errors';
    for (const e of q.errors) errors.append(textEl('li', e.message));
    body.append(errors);
  }
}

// Озвучуємо лише підсумок або помилку і з затримкою, щоб не говорити на кожне натискання «+»
let liveTimer;
let lastLive = '';
function announce() {
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    const q = state.quote;
    if (!q) return;
    const total = `Разом ${formatMoney(q.total)} за ${q.nights} ${nightsWord(q.nights)}.`;
    const message = q.errors.length ? `${q.errors.map((e) => e.message).join('. ')}. ${total}` : total;
    if (message !== lastLive) {
      lastLive = message;
      el.quoteLive.textContent = message;
    }
  }, LIVE_DELAY_MS);
}

function blockReason() {
  if (!state.checkIn) return 'Оберіть дати заїзду й виїзду.';
  if (!state.checkOut) return 'Оберіть дату виїзду.';
  if (state.quote.errors.length) return `${state.quote.errors.map((e) => e.message).join('. ')}.`;
  return '';
}

function update({ speak = true } = {}) {
  state.quote = state.checkIn && state.checkOut
    ? calculatePrice({ checkIn: state.checkIn, checkOut: state.checkOut, guests: readGuests(), pet: el.pet.checked }, pricing)
    : null;
  renderQuote();

  const guests = readGuests();
  const [minus, plus] = el.stepButtons;
  minus.disabled = guests <= pricing.guests.min;
  plus.disabled = guests >= pricing.guests.max;

  const reason = blockReason();
  el.submit.disabled = Boolean(reason);
  el.submitReason.textContent = reason;
  el.submitReason.hidden = !reason;

  saveDraft();
  if (speak) announce();
}

// ---------- Форма ----------

function checkField(field) {
  const message = field.validate(field.input.value);
  field.error.textContent = message ?? '';
  field.error.hidden = !message;
  field.input.setAttribute('aria-invalid', message ? 'true' : 'false');
  // Помилка вже містить приклад — загальну підказку ховаємо і не зачитуємо
  if (field.hint) {
    field.hint.hidden = Boolean(message);
    field.input.setAttribute('aria-describedby', message ? field.error.id : `${field.hint.id} ${field.error.id}`);
  }
  return !message;
}

function showConfirm() {
  const data = currentData();
  const q = state.quote;
  const rows = [
    ['Заїзд', `${formatDate(data.checkIn)}, з 14:00`],
    ['Виїзд', `${formatDate(data.checkOut)}, до 11:00`],
    ['Ночей', String(q.nights)],
    ['Гостей', String(data.guests)],
    ['Тварина', data.pet ? 'так' : 'ні'],
    ['Вартість', formatMoney(q.total)],
    ["Ім'я", data.name.trim()],
    ['Телефон', normalizePhone(data.phone)],
  ];
  // Дані користувача — лише через textContent
  el.confirmSummary.replaceChildren(...rows.map(([term, value]) => {
    const row = document.createElement('div');
    row.append(textEl('dt', term), textEl('dd', value));
    return row;
  }));
  el.requestText.textContent = buildRequestText(data, q, pricing);
  el.requestText.hidden = true;
  el.copyStatus.textContent = '';

  el.bookingView.hidden = true;
  el.confirm.hidden = false;
  window.scrollTo(0, 0);
  el.confirmTitle.focus();
}

async function copyText(text) {
  try {
    // Якщо браузер не відповідає (чекає дозволу), за 1,5 с переходимо до запасного варіанта
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500));
    await Promise.race([navigator.clipboard.writeText(text), timeout]);
    return true;
  } catch {
    // Запасний варіант для браузерів без доступу до буфера
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

function bindEvents() {
  el.stepButtons.forEach((btn) => btn.addEventListener('click', () => {
    const current = readGuests();
    const next = (Number.isNaN(current) ? DEFAULT_GUESTS : current) + Number(btn.dataset.step);
    el.guests.value = Math.min(pricing.guests.max, Math.max(pricing.guests.min, next));
    update();
  }));
  el.guests.addEventListener('input', () => update());
  el.pet.addEventListener('change', () => update());

  for (const field of fields) {
    field.input.addEventListener('input', () => {
      field.touched = true;
      if (field.input.getAttribute('aria-invalid') === 'true') checkField(field);
      saveDraft();
    });
    field.input.addEventListener('blur', () => {
      if (field.touched) checkField(field);
    });
  }

  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (blockReason()) return;
    const invalid = fields.filter((f) => !checkField(f));
    if (invalid.length) {
      invalid[0].input.focus();
      return;
    }
    showConfirm();
  });

  el.copy.addEventListener('click', async () => {
    const ok = await copyText(el.requestText.textContent);
    el.copyStatus.textContent = ok
      ? 'Запит скопійовано.'
      : 'Не вдалося скопіювати автоматично. Виділіть текст нижче й скопіюйте вручну.';
    el.requestText.hidden = ok;
  });

  el.edit.addEventListener('click', () => {
    el.confirm.hidden = true;
    el.bookingView.hidden = false;
    el.name.focus();
  });
}

// ---------- Старт ----------

async function init() {
  let bookings;
  try {
    [bookings, pricing] = await Promise.all([loadJSON('data/bookings.json'), loadJSON('data/pricing.json')]);
  } catch (err) {
    console.warn(err);
    el.loadError.textContent = 'Не вдалося завантажити зайняті дати. Оновіть сторінку.';
    el.loadError.hidden = false;
    el.layout.hidden = true;
    return;
  }

  const today = localToday();
  const maxDate = addMonths(today, pricing.bookingWindowMonths);
  const g = pricing.guests;
  const draft = restoreDraft(readDraft(), {
    today, maxDate, bookings: bookings.bookings, guestsMin: g.min, guestsMax: g.max,
  });

  state.checkIn = draft.checkIn;
  state.checkOut = draft.checkOut;
  el.guests.value = draft.guests;
  el.pet.checked = draft.pet;
  el.name.value = draft.name;
  el.phone.value = draft.phone;
  el.guestsHint.textContent = `Від ${g.min} до ${g.max}. До ${g.included} гостей — у ціні, кожен наступний +${g.extraPerNight} грн за ніч.`;
  if (draft.datesReset) {
    el.draftNotice.textContent = 'Збережені дати вже недоступні, оберіть нові.';
    el.draftNotice.hidden = false;
  }

  createCalendar(el.calendar, {
    today,
    maxDate,
    bookings: bookings.bookings,
    initial: { checkIn: state.checkIn, checkOut: state.checkOut },
    onChange: ({ checkIn, checkOut }) => {
      state.checkIn = checkIn;
      state.checkOut = checkOut;
      el.draftNotice.hidden = true;
      update();
    },
  });
  el.legend.hidden = false;

  bindEvents();
  update({ speak: false });
}

init();
