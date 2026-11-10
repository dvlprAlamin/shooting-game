import { Box, TextField } from '@mui/material';
import React from 'react';
import PrimaryButton from '../elements/Primarybutton';
import { SHORT_SCREEN_MEDIA, useShortScreen } from '../../theme/shortScreen';

const JoinRoomForm = ({ handleSubmit }) => {
  const isShortScreen = useShortScreen();
  const fieldProps = { fullWidth: true, required: true, size: isShortScreen ? 'small' : 'medium' };

  return (
    <Box
      onSubmit={handleSubmit}
      component="form"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 2,
        [SHORT_SCREEN_MEDIA]: { gap: 1.5 },
      }}
    >
      <TextField
        {...fieldProps}
        defaultValue={localStorage.getItem('playerName') || ''}
        label="Your Name"
        name="playerName"
        type="text"
        placeholder="Enter Your Name"
      />

      <TextField
        {...fieldProps}
        label="Room Id"
        name="roomId"
        type="text"
        placeholder="Enter Room Id"
      />

      <PrimaryButton type="submit" variant="contained">
        Join Game
      </PrimaryButton>
    </Box>
  );
};

export default JoinRoomForm;
