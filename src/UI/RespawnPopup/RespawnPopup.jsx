import { useEffect, useState } from 'react';
import Button from '../elements/Button';

const RespawnPopup = ({ reSpawnHandler }) => {
  const [activeButton, setActiveButton] = useState(false);
  const [waitingTime, setWaitingTime] = useState(5);

  useEffect(() => {
    const timeOutId = setTimeout(() => {
      setActiveButton(true);
    }, 5000);

    const intervalId = setInterval(() => {
      setWaitingTime((preValue) => (preValue > 0 ? preValue - 1 : preValue));
    }, 1000);

    return () => {
      clearTimeout(timeOutId);
      clearInterval(intervalId);
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
            gap: '30px',
            height: '100%',
          }}
        >
          <h1 style={{ color: '#fff' }}>You are dead!</h1>
          {!activeButton ? (
            <h3 style={{ color: '#fff' }}>
              Wait {waitingTime} second{waitingTime > 1 ? 's' : ''}
            </h3>
          ) : (
            <Button text="Respawn" onClick={reSpawnHandler} />
          )}
        </div>
      </div>
    </div>
  );
};

export default RespawnPopup;
