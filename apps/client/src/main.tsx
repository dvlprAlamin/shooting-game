import React from 'react';
import ReactDOM from 'react-dom/client';
// Bundled with the app (no font CDN), latin subsets only load when used.
import '@fontsource/big-shoulders-stencil/800.css';
import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';
import '@/index.scss';
import Game from '@/Game.jsx';
import { IS_TOUCH } from '@/config';

document.documentElement.classList.toggle('touch', IS_TOUCH);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Game />
  </React.StrictMode>
);
