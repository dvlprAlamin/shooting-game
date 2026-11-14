import { Capacitor } from '@capacitor/core';
import { APP_BUILD, SERVER_URL } from '@/config';

// Crash reports: uncaught errors, unhandled promise rejections and what React's error boundaries catch go to the
// game server (POST /errors, apps/server/src/errors.js), which keeps them for 30 days. Nothing in a report ties it to
// a player. Each distinct error is sent once per session, and at most MAX_REPORTS in all, so a loop can't flood.
// Development builds only log.

const ENDPOINT = `${SERVER_URL.replace(/\/+$/, '')}/errors`;
const MAX_REPORTS = 10;
const MAX_STACK = 4096;
// Browser noise, not the game's bugs.
const IGNORED = [/ResizeObserver loop/];

const sent = new Set<string>();

// Chromium's User-Agent Client Hints, which TypeScript's DOM types don't have yet.
type UserAgentData = { getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string }> };

// The device: the model where the browser says (Chromium does, so Android's WebView too) and the user agent, which
// has the OS and browser versions.
let device = navigator.userAgent;
(navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData?.getHighEntropyValues?.(['model']).then(
  ({ model }) => {
    if (model) device = `${model} · ${navigator.userAgent}`;
  },
  () => {}
);

const describe = (error: unknown) => {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: error.stack ?? '' };
  try {
    return { message: typeof error === 'string' ? error : JSON.stringify(error), stack: '' };
  } catch {
    return { message: String(error), stack: '' };
  }
};

/** Reports `error` (anything thrown); `componentStack` is React's, for errors in rendering. */
export function reportCrash(error: unknown, componentStack?: string) {
  const { message, stack } = describe(error);
  if (!message || IGNORED.some((re) => re.test(message))) return;
  const key = `${message}\n${stack.split('\n', 2)[1] ?? ''}`;
  if (sent.has(key) || sent.size >= MAX_REPORTS) return;
  sent.add(key);
  if (import.meta.env.DEV) return;

  const body = JSON.stringify({
    message,
    stack: (componentStack ? `${stack}\nComponent stack:${componentStack}` : stack).slice(0, MAX_STACK),
    version: APP_BUILD,
    platform: Capacitor.getPlatform(),
    device,
    url: window.location.origin + window.location.pathname, // never the hash: a sign-in can leave a token there
  });
  // A string goes as text/plain, which needs no CORS preflight; a beacon is sent even if the page is closing.
  try {
    if (navigator.sendBeacon?.(ENDPOINT, body)) return;
  } catch {
    // fall back to fetch
  }
  fetch(ENDPOINT, { method: 'POST', body, keepalive: true }).catch(() => {});
}

/** Starts reporting uncaught errors and unhandled rejections. */
export function startCrashReports() {
  window.addEventListener('error', (e) =>
    reportCrash(e.error ?? `${e.message} (${e.filename}:${e.lineno}:${e.colno})`)
  );
  window.addEventListener('unhandledrejection', (e) => reportCrash(e.reason));
}
