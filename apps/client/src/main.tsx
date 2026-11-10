import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/index.scss';
import Game from '@/Game.jsx';
import { IS_TOUCH } from '@/config';

document.documentElement.classList.toggle('touch', IS_TOUCH);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Game />
  </React.StrictMode>
);
