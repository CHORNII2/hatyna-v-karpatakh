// Розрахунок вартості проживання. Чисті функції: без DOM і без fetch.
// Дати — рядки ISO 'YYYY-MM-DD', уся арифметика в UTC.

const DAY_MS = 24 * 60 * 60 * 1000;

// Повертає Date (UTC, північ) або null, якщо рядок не є реальною датою
export function parseISODate(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Відсікає неіснуючі дати на кшталт 2027-02-30
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

export function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

// Порівнюємо рядки 'MM-DD'; '02-29' як кінець періоду покриває кінець лютого в будь-якому році
function inPeriod(md, { from, to }) {
  // from > to — період переходить через Новий рік
  return from <= to ? md >= from && md <= to : md >= from || md <= to;
}

// Сезон, до якого належить ніч, що починається в цю дату
export function getSeason(isoDate, pricing) {
  const md = isoDate.slice(5);
  const found = pricing.seasons.find((s) => s.periods.some((p) => inPeriod(md, p)));
  return found || pricing.seasons.find((s) => s.default);
}

function nightsWord(n) {
  const last = n % 10;
  const lastTwo = n % 100;
  if (last === 1 && lastTwo !== 11) return 'ніч';
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'ночі';
  return 'ночей';
}

/**
 * Некоректні дати → { errors } без розрахунку.
 * Порушення правил (мінімум ночей, кількість гостей) → повний розрахунок + errors,
 * щоб інтерфейс міг показати і ціну, і причину. Усі суми — цілі гривні.
 */
export function calculatePrice({ checkIn, checkOut, guests, pet }, pricing) {
  const start = parseISODate(checkIn);
  const end = parseISODate(checkOut);
  if (!start || !end) {
    return { errors: [{ code: 'invalidDate', message: 'Некоректна дата заїзду або виїзду' }] };
  }
  if (end <= start) {
    return {
      errors: [{ code: 'checkOutBeforeCheckIn', message: 'Дата виїзду має бути пізніше дати заїзду' }],
    };
  }

  // Ніч належить даті, коли лягаєш спати; день виїзду — не ніч
  const nights = Math.round((end - start) / DAY_MS);
  const bySeason = new Map();
  let minNights = 0;
  for (let i = 0; i < nights; i++) {
    const season = getSeason(toISODate(new Date(start.getTime() + i * DAY_MS)), pricing);
    if (!bySeason.has(season.id)) {
      bySeason.set(season.id, {
        id: season.id,
        name: season.name,
        pricePerNight: season.pricePerNight,
        nights: 0,
        sum: 0,
      });
    }
    const line = bySeason.get(season.id);
    line.nights += 1;
    line.sum += season.pricePerNight;
    // Кілька сезонів — діє найбільший мінімум
    minNights = Math.max(minNights, season.minNights);
  }
  const seasons = [...bySeason.values()];
  const nightsSum = seasons.reduce((acc, s) => acc + s.sum, 0);

  const g = pricing.guests;
  const guestsValid = Number.isInteger(guests) && guests >= g.min && guests <= g.max;
  const extraGuests = Number.isInteger(guests) ? Math.max(0, guests - g.included) : 0;
  const guestSurcharge = extraGuests * g.extraPerNight * nights;
  const petSurcharge = pet ? pricing.petPerNight * nights : 0;

  // Знижка — від ночей і доплат (прибирання без знижки), округлена Math.round до цілої гривні
  const d = pricing.longStayDiscount;
  const discountBase = nightsSum + guestSurcharge + petSurcharge;
  const discount = nights >= d.minNights ? Math.round((discountBase * d.percent) / 100) : 0;
  const cleaningFee = pricing.cleaningFee;
  const total = discountBase - discount + cleaningFee;

  const errors = [];
  if (nights < minNights) {
    errors.push({
      code: 'minNights',
      message: `Для цих дат мінімум ${minNights} ${nightsWord(minNights)}`,
    });
  }
  if (!guestsValid) {
    errors.push({
      code: 'guests',
      message: `Кількість гостей — від ${g.min} до ${g.max}`,
    });
  }

  return {
    nights,
    minNights,
    seasons,
    nightsSum,
    guestSurcharge,
    petSurcharge,
    discount,
    cleaningFee,
    total,
    errors,
  };
}
