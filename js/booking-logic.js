// Чиста логіка сторінки бронювання: валідація, текст запиту, відновлення чернетки. Без DOM.
import { parseISODate, nightsWord } from './pricing.js';
import { canCheckIn, canCheckOut, formatDate } from './calendar.js';

export const DEFAULT_GUESTS = 2;
const PHONE_EXAMPLE = '+380671234567 або 0671234567';

// Літери будь-якої мови; частини імені — через пробіл, дефіс або апостроф (' ʼ ’)
const NAME_RE = /^\p{L}[\p{L}\p{M}]*(?:(?:\s+|['ʼ’-])\p{L}[\p{L}\p{M}]*)*$/u;

export function validateName(raw) {
  const name = String(raw ?? '').trim();
  if (!name) return "Вкажіть ім'я.";
  if (!NAME_RE.test(name)) return "Ім'я може містити лише літери, апостроф і дефіс.";
  if ([...name.matchAll(/\p{L}/gu)].length < 2) return "Ім'я має містити щонайменше 2 літери.";
  return null;
}

// Пробіли й дефіси дозволені; результат — +380XXXXXXXXX або null
export function normalizePhone(raw) {
  const compact = String(raw ?? '').replace(/[\s-]/g, '');
  if (/^\+380\d{9}$/.test(compact)) return compact;
  if (/^0\d{9}$/.test(compact)) return `+38${compact}`;
  return null;
}

export function validatePhone(raw) {
  if (!String(raw ?? '').trim()) return `Вкажіть телефон, наприклад ${PHONE_EXAMPLE}.`;
  if (!normalizePhone(raw)) return `Перевірте номер: потрібен формат ${PHONE_EXAMPLE}.`;
  return null;
}

// До 9999 — без розділювача (як у таблиці тарифів), далі — групи по 3 через нерозривний пробіл
export function formatMoney(amount) {
  const abs = Math.abs(amount);
  const digits = abs >= 10000 ? String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : String(abs);
  return `${amount < 0 ? '−' : ''}${digits} грн`;
}

// Рядки розбивки для картки й тексту запиту: [{ label, amount }]
export function quoteLines(quote, { guests }, pricing) {
  const n = quote.nights;
  const perNights = `${n} ${nightsWord(n)}`;
  const lines = quote.seasons.map((s) => ({
    label: `${s.nights} ${nightsWord(s.nights)} × ${formatMoney(s.pricePerNight)} (${s.label})`,
    amount: s.sum,
  }));
  if (quote.guestSurcharge) {
    const g = pricing.guests;
    lines.push({
      label: `Гості понад ${g.included}: ${guests - g.included} × ${formatMoney(g.extraPerNight)} × ${perNights}`,
      amount: quote.guestSurcharge,
    });
  }
  if (quote.petSurcharge) {
    lines.push({ label: `Тварина: ${formatMoney(pricing.petPerNight)} × ${perNights}`, amount: quote.petSurcharge });
  }
  if (quote.discount) {
    const d = pricing.longStayDiscount;
    lines.push({ label: `Знижка ${d.percent}% від ${d.minNights} ${nightsWord(d.minNights)}`, amount: -quote.discount });
  }
  lines.push({ label: 'Прибирання', amount: quote.cleaningFee });
  return lines;
}

export function buildRequestText({ checkIn, checkOut, guests, pet, name, phone }, quote, pricing) {
  return [
    'Запит на бронювання: Хатина в Карпатах',
    '',
    `Заїзд: ${formatDate(checkIn)}, з 14:00`,
    `Виїзд: ${formatDate(checkOut)}, до 11:00`,
    `Ночей: ${quote.nights}`,
    `Гостей: ${guests}`,
    `Тварина: ${pet ? 'так' : 'ні'}`,
    '',
    'Вартість:',
    ...quoteLines(quote, { guests }, pricing).map((l) => `- ${l.label}: ${formatMoney(l.amount)}`),
    `Разом: ${formatMoney(quote.total)}`,
    '',
    `Ім'я: ${String(name).trim()}`,
    `Телефон: ${normalizePhone(phone)}`,
  ].join('\n');
}

const isISO = (v) => typeof v === 'string' && parseISODate(v) !== null;

/**
 * Відновлює чернетку з рядка localStorage.
 * Дати скидаються, якщо вони в минулому, поза межею або вже зайняті; решта даних лишається.
 * ctx: { today, maxDate, bookings, guestsMin, guestsMax }
 */
export function restoreDraft(raw, ctx) {
  const result = {
    checkIn: null, checkOut: null, guests: DEFAULT_GUESTS, pet: false, name: '', phone: '', datesReset: false,
  };
  let draft;
  try {
    draft = JSON.parse(raw);
  } catch {
    return result;
  }
  if (!draft || typeof draft !== 'object') return result;

  if (typeof draft.name === 'string') result.name = draft.name.slice(0, 60);
  if (typeof draft.phone === 'string') result.phone = draft.phone.slice(0, 20);
  result.pet = draft.pet === true;
  if (Number.isInteger(draft.guests) && draft.guests >= ctx.guestsMin && draft.guests <= ctx.guestsMax) {
    result.guests = draft.guests;
  }

  const hadDates = draft.checkIn != null || draft.checkOut != null;
  if (isISO(draft.checkIn) && canCheckIn(draft.checkIn, ctx)) {
    if (draft.checkOut == null) {
      result.checkIn = draft.checkIn;
    } else if (isISO(draft.checkOut) && canCheckOut(draft.checkIn, draft.checkOut, ctx)) {
      result.checkIn = draft.checkIn;
      result.checkOut = draft.checkOut;
    }
  }
  result.datesReset = hadDates && result.checkIn === null;
  return result;
}
