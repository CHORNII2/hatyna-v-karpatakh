// Сторінка бронювання. Поки що: завантаження даних, календар і рядок з обраними датами.
import { createCalendar, addMonths, formatDate } from './calendar.js';
import { parseISODate, nightsWord } from './pricing.js';

const calendarEl = document.getElementById('calendar');
const summaryEl = document.getElementById('selection');

// Локальна дата користувача у форматі ISO
function localToday() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function loadJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

function showError(text) {
  calendarEl.innerHTML = `<p class="notice notice--error" role="alert">${text}</p>`;
}

function renderSelection({ checkIn, checkOut }) {
  const nights = checkIn && checkOut
    ? Math.round((parseISODate(checkOut) - parseISODate(checkIn)) / 86400000)
    : null;
  summaryEl.innerHTML = `
    <div><dt>Заїзд</dt><dd>${checkIn ? formatDate(checkIn) : '—'}</dd></div>
    <div><dt>Виїзд</dt><dd>${checkOut ? formatDate(checkOut) : '—'}</dd></div>
    <div><dt>Ночей</dt><dd>${nights ? `${nights} ${nightsWord(nights)}` : '—'}</dd></div>`;
}

async function init() {
  let bookings, pricing;
  try {
    [bookings, pricing] = await Promise.all([loadJSON('data/bookings.json'), loadJSON('data/pricing.json')]);
  } catch (err) {
    console.warn(err);
    showError(location.protocol === 'file:'
      ? 'Запустіть сайт через сервер (не відкривайте файл подвійним кліком).'
      : 'Не вдалося завантажити зайняті дати. Оновіть сторінку.');
    return;
  }

  const today = localToday();
  renderSelection({ checkIn: null, checkOut: null });
  createCalendar(calendarEl, {
    today,
    maxDate: addMonths(today, pricing.bookingWindowMonths),
    bookings: bookings.bookings,
    onChange: renderSelection,
  });
  // Легенда потрібна лише тоді, коли календар намальовано
  document.querySelector('.cal-legend').hidden = false;
}

init();
