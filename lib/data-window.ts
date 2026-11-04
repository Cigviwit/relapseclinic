import { addDays } from './clinic.ts';

/**
 * How far back the workspace keeps live. Older visits, prescriptions and messages load only when someone opens
 * that patient or that week, so a clinic's fifth year costs the same to open as its first.
 * Bills and payments are not limited: balances are worked out from a patient's whole history.
 */
export const HISTORY_DAYS = 180;
export const historyStart = (today: string) => addDays(today, -HISTORY_DAYS);

/** Combines lists of records, with later lists winning when an id appears twice. */
export function mergeById<T extends { id: string }>(...lists: T[][]): T[] {
  const byId = new Map<string, T>();
  for (const list of lists) for (const item of list) byId.set(item.id, item);
  return [...byId.values()];
}
