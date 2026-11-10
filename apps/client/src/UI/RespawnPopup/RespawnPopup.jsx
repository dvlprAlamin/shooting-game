import { useEffect, useState } from 'react';
import PrimaryButton from '../elements/Primarybutton';
import { Box, Dialog, Typography } from '@mui/material';
import LeaderBoard from '../LeaderBoard/LeaderBoard';
import { SHORT_SCREEN_MEDIA } from '../../theme/shortScreen';

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
        fullWidth
        PaperProps={{
          sx: {
            boxShadow: 'none',
            background: '#00000080',
            // The paper is a flex column: the header keeps its size and only the leaderboard scrolls.
            height: '90%',
            overflow: 'hidden',
            // Keep the default 32px on top: on touch the kill feed snackbars sit at the top centre.
            [SHORT_SCREEN_MEDIA]: {
              m: 1.5,
              mt: 4,
              width: 'calc(100% - 24px)',
              height: 'calc(100% - 44px)',
              maxHeight: 'none',
            },
          },
        }}
      >
        <Box
          sx={{
            p: 3,
            textAlign: 'center',
            flexShrink: 0,
            // Phone in landscape: title and respawn button on one row to leave room for the leaderboard.
            [SHORT_SCREEN_MEDIA]: {
              p: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
            },
          }}
        >
          <Box
            component="h1"
            sx={{ color: '#fff', mb: 1, [SHORT_SCREEN_MEDIA]: { mb: 0, fontSize: 24 } }}
          >
            {isGameOver ? 'Game Over!' : 'You are dead!'}
          </Box>
          {!isGameOver ? (
            <Box sx={{ height: 40, display: 'grid', placeItems: 'center' }}>
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
