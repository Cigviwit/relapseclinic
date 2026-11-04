/** Reception computers are shared and left unattended, so the screen locks itself. Clinics can change the delay or turn it off. */
export const DEFAULT_LOCK_MINUTES = 15;
export const lockMinutes = (setting?: number) => setting === undefined ? DEFAULT_LOCK_MINUTES : setting;
export const isIdle = (lastActive: number, now: number, minutes: number) => minutes > 0 && now - lastActive >= minutes * 60_000;

const KEY = 'lastActive';
/** Kept across tabs and reloads, so closing the tab does not skip the lock. Without storage, each tab tracks its own activity. */
export const readLastActive = () => { try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; } };
export const markActive = (at = Date.now()) => { try { localStorage.setItem(KEY, String(at)); } catch { /* storage unavailable */ } };
export const clearActivity = () => markActive(0);
