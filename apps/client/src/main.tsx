import React from 'react';
import ReactDOM from 'react-dom/client';
// Bundled with the app (no font CDN), latin subsets only load when used.
import '@fontsource/big-shoulders-stencil/800.css';
import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';
import '@/index.scss';
import { GOOGLE_SIGN_IN, IS_NATIVE, IS_TOUCH } from '@/config';

document.documentElement.classList.toggle('touch', IS_TOUCH);

// On the web, Google's sign-in popup comes back to this page with the result in the hash (state=popup, see
// net/account.js). Loading the sign-in plugin hands it to the game's window and closes the popup. The game is
// imported only otherwise: its modules start loading the 3D models as soon as they're imported.
const signInPopup = GOOGLE_SIGN_IN && !IS_NATIVE && /[#&]state=popup(&|$)/.test(window.location.hash);

if (signInPopup) {
  import('@capgo/capacitor-social-login');
} else {
  import('@/Game.jsx').then(({ default: Game }) =>
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <Game />
      </React.StrictMode>
    )
  );
}
