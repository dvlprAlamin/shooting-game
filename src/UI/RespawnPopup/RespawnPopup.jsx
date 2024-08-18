import { useEffect, useState } from 'react';
import PrimaryButton from '../elements/Primarybutton';
import { Box, Dialog, Typography } from '@mui/material';
import LeaderBoard from '../LeaderBoard/LeaderBoard';

const RespawnPopup = ({ reSpawnHandler, leaderboard, isGameOver }) => {
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
      <Dialog
        open={true}
        PaperProps={{
          sx: {
            boxShadow: 'none',
            background: '#00000080',
            width: '80vw',
            height: '90vh',
          },
        }}
      >
        <Box
          sx={{
            p: 3,
            textAlign: 'center',
          }}
        >
          <h1 style={{ color: '#fff', marginBottom: 8 }}>
            {isGameOver ? 'Game Over!' : 'You are dead!'}
          </h1>
          {!isGameOver ? (
            <Box sx={{ height: 40 }}>
              {!activeButton ? (
                <Typography sx={{ fontSize: 18, color: '#fff' }}>
                  Wait {waitingTime} second{waitingTime > 1 ? 's' : ''}
                </Typography>
              ) : (
                <PrimaryButton onClick={reSpawnHandler}>Respawn</PrimaryButton>
              )}
            </Box>
          ) : (
            <></>
          )}
        </Box>
        <LeaderBoard leaderboard={leaderboard} />
      </Dialog>
    </div>
  );
};

export default RespawnPopup;
