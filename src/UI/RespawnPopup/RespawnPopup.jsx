import { useEffect, useState } from 'react';

const RespawnPopup = ({ reSpawnHandler }) => {
  const [activeButton, setActiveButton] = useState(false);
  const [waitingTime, setWaitingTime] = useState(5);
  useEffect(() => {
    const timeOutId = setTimeout(() => {
      setActiveButton(true);
    });
    return () => {
      clearTimeout(timeOutId);
    };
  }, []);
  return (
    <div>
      <div
        onClick={(e) => e.preventDefault()}
        style={{
          height: '80vh',
          width: '80vw',
          position: 'fixed',
          top: '10vh',
          left: '10vw',
          zIndex: 999,
          background: '#00000080',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '20px',
          }}
        >
          <h1>You are dead!</h1>
          {!activeButton ? (
            <h3>wait {waitingTime} seconds</h3>
          ) : (
            <button onClick={reSpawnHandler}>Respawn</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RespawnPopup;
