import App from '@/App';
import Feed from '@/UI/Feed/Feed';

// The feed (kill feed and notices like "Room not found") also shows on the menu, so it lives outside App.
const Game = () => (
  <>
    <App />
    <Feed />
  </>
);

export default Game;
