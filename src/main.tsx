import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/index.scss';
import Game from '@/Game.jsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Game />
  </React.StrictMode>
);
