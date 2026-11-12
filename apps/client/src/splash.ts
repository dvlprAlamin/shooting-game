// The splash screen in index.html. It starts as the scope from the native launch screen, in the same spot, and once
// the page has loaded (when Android takes its launch screen down, see MainActivity) the scope moves aside for the
// name. It goes when the menu is up, but not before the name has been on screen for a moment.
const splash = document.getElementById('splash');

const HOLD_MS = 1000; // from the start of the intro to the earliest the splash can go
const FONT_WAIT_MS = 500; // the name is in the stencil font, which is bundled, so this is only a backstop
const FADE_MS = 300; // index.html's #splash transition

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const introDone = new Promise<void>((resolve) => {
  if (!splash) return resolve();
  const start = async () => {
    await Promise.race([document.fonts.ready, wait(FONT_WAIT_MS)]);
    splash.classList.add('splash-in');
    await wait(HOLD_MS);
    resolve();
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
});

/** Fades the splash out, once the intro has played. Call it when the app is on screen. */
export const hideSplash = async () => {
  await introDone;
  if (!splash?.isConnected) return;
  splash.classList.add('splash-out');
  await wait(FADE_MS);
  splash.remove();
};
