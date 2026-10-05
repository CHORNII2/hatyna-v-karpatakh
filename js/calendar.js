// Календар зайнятості й вибір діапазону заїзд → виїзд.
// Дати — рядки ISO 'YYYY-MM-DD', арифметика в UTC. «Сьогодні» завжди передається параметром.
import { parseISODate, toISODate, nightsWord } from './pricing.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const WEEKDAYS = ['понеділок', 'вівторок', 'середа', 'четвер', "п'ятниця", 'субота', 'неділя'];
const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

// ---------- Чисті функції ----------

export function addDays(iso, n) {
  return toISODate(new Date(parseISODate(iso).getTime() + n * DAY_MS));
}

// Якщо в цільовому місяці немає такого числа — останній день місяця (31.01 + 1 міс. = 28.02)
export function addMonths(iso, n) {
  const d = parseISODate(iso);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return toISODate(target);
}

const monthStart = (iso) => iso.slice(0, 8) + '01';
const monthEnd = (iso) => addDays(addMonths(monthStart(iso), 1), -1);
// Понеділок = 0 … неділя = 6
const weekdayIndex = (iso) => (parseISODate(iso).getUTCDay() + 6) % 7;

// Ніч зайнята, якщо checkIn ≤ дата < checkOut (день виїзду — вже вільна ніч)
export function isNightBooked(iso, bookings) {
  return bookings.some((b) => b.checkIn <= iso && iso < b.checkOut);
}

// Усі ночі від checkIn до checkOut (не включно) вільні
export function isRangeFree(checkIn, checkOut, bookings) {
  return !bookings.some((b) => b.checkIn < checkOut && checkIn < b.checkOut);
}

// Тижні місяця (month: 1–12), тиждень з понеділка; порожні клітинки — null
export function buildMonth(year, month) {
  const first = toISODate(new Date(Date.UTC(year, month - 1, 1)));
  const last = monthEnd(first);
  const days = [...Array(weekdayIndex(first)).fill(null)];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  while (days.length % 7) days.push(null);
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

export function canCheckIn(iso, { today, maxDate, bookings }) {
  return iso >= today && iso < maxDate && !isNightBooked(iso, bookings);
}

export function canCheckOut(checkIn, iso, { maxDate, bookings }) {
  return iso > checkIn && iso <= maxDate && isRangeFree(checkIn, iso, bookings);
}

/**
 * Стан дня без урахування вибору:
 * past | outside | free | checkout-only (ніч зайнята, але попередня вільна — можна виїхати) | busy
 */
export function getDayStatus(iso, ctx) {
  if (iso < ctx.today) return 'past';
  if (iso > ctx.maxDate) return 'outside';
  if (canCheckIn(iso, ctx)) return 'free';
  const prev = addDays(iso, -1);
  if (prev >= ctx.today && !isNightBooked(prev, ctx.bookings)) return 'checkout-only';
  return 'busy';
}

export function formatDate(iso, withYear = true) {
  const d = parseISODate(iso);
  const text = `${d.getUTCDate()} ${MONTHS_GEN[d.getUTCMonth()]}`;
  return withYear ? `${text} ${d.getUTCFullYear()}` : text;
}

// ---------- Інтерфейс ----------

const STATUS_TEXT = {
  past: 'минула дата',
  outside: 'поза межами бронювання',
  free: 'вільно',
  'checkout-only': 'зайнято, можна виїхати',
  busy: 'зайнято',
};

/**
 * Малює календар у container.
 * options: { today, maxDate, bookings, onChange({ checkIn, checkOut }) }
 */
export function createCalendar(container, options) {
  const ctx = { today: options.today, maxDate: options.maxDate, bookings: options.bookings };
  const minFocus = monthStart(ctx.today);
  const maxFocus = monthEnd(ctx.maxDate);
  const wide = window.matchMedia('(min-width: 900px)');

  const state = {
    checkIn: null,
    checkOut: null,
    focused: ctx.today,
    view: monthStart(ctx.today),
  };

  container.classList.add('cal');
  container.innerHTML = `
    <div class="cal__nav">
      <button type="button" class="cal__arrow" data-dir="-1" aria-label="Попередній місяць">‹</button>
      <button type="button" class="cal__arrow" data-dir="1" aria-label="Наступний місяць">›</button>
    </div>
    <div class="cal__months"></div>
    <p class="cal__status" aria-live="polite"></p>`;
  const monthsEl = container.querySelector('.cal__months');
  const statusEl = container.querySelector('.cal__status');
  const [prevBtn, nextBtn] = container.querySelectorAll('.cal__arrow');

  const monthsVisible = () => (wide.matches ? 2 : 1);
  const lastVisible = () => addMonths(state.view, monthsVisible() - 1);

  function say(text) {
    statusEl.textContent = text;
  }

  // Зсуває видимі місяці так, щоб дата у фокусі була на екрані
  function ensureVisible(iso) {
    const m = monthStart(iso);
    if (m < state.view) state.view = m;
    else if (m > lastVisible()) state.view = addMonths(m, -(monthsVisible() - 1));
    if (state.view < minFocus) state.view = minFocus;
  }

  function dayLabel(iso, status) {
    const parts = [`${formatDate(iso)}, ${WEEKDAYS[weekdayIndex(iso)]}`, STATUS_TEXT[status]];
    if (iso === state.checkIn) parts.push('обрано заїзд');
    if (iso === state.checkOut) parts.push('обрано виїзд');
    if (iso === ctx.today) parts.push('сьогодні');
    return parts.join(', ');
  }

  function renderMonth(first) {
    const [y, m] = first.split('-').map(Number);
    const rows = buildMonth(y, m).map((week) => `<tr>${week.map((iso) => {
      if (!iso) return '<td></td>';
      const status = getDayStatus(iso, ctx);
      const cls = ['cal__day', `cal__day--${status}`];
      if (iso === state.checkIn) cls.push('is-start');
      if (iso === state.checkOut) cls.push('is-end');
      if (state.checkIn && state.checkOut && iso > state.checkIn && iso < state.checkOut) cls.push('is-between');
      const unavailable = status === 'past' || status === 'outside' || status === 'busy';
      return `<td><button type="button" class="${cls.join(' ')}" data-date="${iso}"
        tabindex="${iso === state.focused ? 0 : -1}"
        ${unavailable ? 'aria-disabled="true"' : ''}
        ${iso === ctx.today ? 'aria-current="date"' : ''}
        aria-label="${dayLabel(iso, status)}">${Number(iso.slice(8))}</button></td>`;
    }).join('')}</tr>`).join('');

    return `<table class="cal__month">
      <caption>${MONTHS[m - 1]} ${y}</caption>
      <thead><tr>${WEEKDAYS_SHORT.map((d, i) => `<th scope="col" abbr="${WEEKDAYS[i]}">${d}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function render(keepFocus = false) {
    ensureVisible(state.focused);
    let html = '';
    for (let i = 0; i < monthsVisible(); i++) html += renderMonth(addMonths(state.view, i));
    monthsEl.innerHTML = html;
    prevBtn.disabled = state.view <= minFocus;
    nextBtn.disabled = lastVisible() >= monthStart(ctx.maxDate);
    if (keepFocus) monthsEl.querySelector(`[data-date="${state.focused}"]`)?.focus();
  }

  function emit() {
    options.onChange?.({ checkIn: state.checkIn, checkOut: state.checkOut });
  }

  function startNew(iso, prefix = '') {
    state.checkIn = iso;
    state.checkOut = null;
    say(`${prefix}Заїзд ${formatDate(iso, false)}. Тепер оберіть дату виїзду.`);
  }

  function select(iso) {
    const status = getDayStatus(iso, ctx);
    if (status === 'past' || status === 'outside') {
      say('Ця дата недоступна для бронювання.');
      return;
    }
    const waitingCheckOut = state.checkIn && !state.checkOut;

    if (waitingCheckOut && iso > state.checkIn) {
      if (canCheckOut(state.checkIn, iso, ctx)) {
        state.checkOut = iso;
        const nights = Math.round((parseISODate(iso) - parseISODate(state.checkIn)) / DAY_MS);
        say(`Обрано: ${formatDate(state.checkIn, false)} – ${formatDate(iso, false)}, ${nights} ${nightsWord(nights)}.`);
      } else if (canCheckIn(iso, ctx)) {
        startNew(iso, 'Між датами є зайняті ночі, тому вибір почато заново. ');
      } else {
        say('Між датами є зайняті ночі. Оберіть іншу дату виїзду.');
        return;
      }
    } else if (canCheckIn(iso, ctx)) {
      startNew(iso);
    } else if (status === 'checkout-only') {
      say('На цю дату можна лише виїхати. Спершу оберіть дату заїзду.');
      return;
    } else {
      say('Ця дата зайнята.');
      return;
    }
    render(true);
    emit();
  }

  function moveFocus(iso) {
    if (iso < minFocus) iso = minFocus;
    if (iso > maxFocus) iso = maxFocus;
    state.focused = iso;
    render(true);
  }

  monthsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-date]');
    if (!btn) return;
    state.focused = btn.dataset.date;
    select(btn.dataset.date);
  });

  monthsEl.addEventListener('keydown', (e) => {
    const btn = e.target.closest('[data-date]');
    if (!btn) return;
    const iso = btn.dataset.date;
    const wd = weekdayIndex(iso);
    const moves = {
      ArrowLeft: () => addDays(iso, -1),
      ArrowRight: () => addDays(iso, 1),
      ArrowUp: () => addDays(iso, -7),
      ArrowDown: () => addDays(iso, 7),
      PageUp: () => addMonths(iso, -1),
      PageDown: () => addMonths(iso, 1),
      Home: () => addDays(iso, -wd),
      End: () => addDays(iso, 6 - wd),
    };
    if (!moves[e.key]) return;
    e.preventDefault();
    moveFocus(moves[e.key]());
  });

  container.querySelector('.cal__nav').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-dir]');
    if (!btn || btn.disabled) return;
    const dir = Number(btn.dataset.dir);
    state.view = addMonths(state.view, dir);
    // Фокус переносимо в новий видимий місяць, щоб render не повернув старий вид
    const target = addMonths(state.focused, dir);
    state.focused = target < minFocus ? minFocus : target > maxFocus ? maxFocus : target;
    render();
  });

  wide.addEventListener('change', () => render());

  render();
}
