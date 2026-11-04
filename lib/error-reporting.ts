import { auth, callFunction } from './firebase';

/** Sends browser errors to Cloud Logging. Only the error itself and the page name: no form values or patient ids. */
const MAX_PER_PAGE_LOAD = 5;
let sent = 0;

export function reportError(error: unknown) {
  if (sent >= MAX_PER_PAGE_LOAD || !auth.currentUser || import.meta.env.DEV) return;
  sent += 1;
  const e = error instanceof Error ? error : new Error(String(error));
  const page = location.hash.slice(1).split('/')[0];
  void callFunction('reportClientError', { message: e.message, stack: e.stack, page, release: import.meta.env.VITE_RELEASE || '' }).catch(() => { /* reporting must never cause an error of its own */ });
}

export function installErrorReporting() {
  window.addEventListener('error', event => reportError(event.error || event.message));
  window.addEventListener('unhandledrejection', event => reportError(event.reason));
}
