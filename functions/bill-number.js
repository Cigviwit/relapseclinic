// Indian financial year (April to March) for a clinic-local YYYY-MM-DD date, e.g. 2026-27.
function financialYear(date) {
  const year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7));
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

// Numbers run in sequence per clinic and restart each financial year. Under 16 characters, the GST invoice limit.
const billNumber = (date, n) => `${financialYear(date)}/${String(n).padStart(5, '0')}`;

module.exports = { financialYear, billNumber };
