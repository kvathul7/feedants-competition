const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const MONTHS_HI = ['जन', 'फ़र', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुल', 'अग', 'सित', 'अक्ट', 'नव', 'दिस'];

/** "10 Aug 26" - the compact form used on the Important Dates card. */
export function formatDate(value, locale = 'en') {
  if (!value) return '-';
  const d = new Date(value);
  const months = locale === 'hi' ? MONTHS_HI : MONTHS_EN;
  return `${d.getDate()} ${months[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
}

/** "11:50 PM" */
export function formatTime(value) {
  if (!value) return '';
  const d = new Date(value);
  const h = d.getHours();
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${suffix}`;
}

/**
 * Money arrives as integer paise and is grouped in the Indian system
 * (1,50,000 rather than 150,000). Intl is available in Hermes but the locale
 * data for en-IN is not guaranteed on every RN build, so the grouping is done
 * explicitly.
 */
export function formatRupees(amount) {
  const n = Math.round(Number(amount) || 0);
  const s = String(Math.abs(n));
  if (s.length <= 3) return (n < 0 ? '-' : '') + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${n < 0 ? '-' : ''}${rest},${last3}`;
}

export const paiseToRupees = (paise) => Math.round((Number(paise) || 0) / 100);
