/**
 * Spreadsheet export. A cell starting with = + - or @ runs as a formula when the file is opened in Excel,
 * and patient names and notes are typed by people, so those cells get a leading apostrophe.
 */
function cell(value: unknown) {
  const text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) && typeof value !== 'number' ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]) {
  return [columns.join(','), ...rows.map(row => columns.map(c => cell(row[c])).join(','))].join('\r\n');
}

/** Firestore timestamps become ISO strings so the file can be read without Firebase. */
export function plainValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  const stamp = value as { toDate?: () => Date };
  if (typeof stamp.toDate === 'function') return stamp.toDate().toISOString();
  if (Array.isArray(value)) return value.map(plainValue);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plainValue(v)]));
}

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
