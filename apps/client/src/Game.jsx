import { useEffect } from 'react';
import App from '@/App';
import Feed from '@/UI/Feed/Feed';
import { hideSplash } from '@/splash';

// The feed (kill feed and notices like "Room not found") also shows on the menu, so it lives outside App.
const Game = () => {
  useEffect(() => {
    hideSplash(); // the menu is up
  }, []);

  return (
    <>
      <App />
      <Feed />
    </>
  );
};

export default Game;
