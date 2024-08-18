import { Box, Button, TextField } from '@mui/material';
import React from 'react';
import PrimaryButton from '../elements/Primarybutton';

const JoinRoomForm = ({ handleSubmit }) => {
  return (
    <Box onSubmit={handleSubmit} component="form">
      <TextField
        defaultValue={localStorage.getItem('playerName') || ''}
        label="Your Name"
        name="playerName"
        fullWidth
        type="text"
        placeholder="Enter Your Name"
        required
      />

      <TextField
        sx={{ my: 2 }}
        label="Room Id"
        name="roomId"
        fullWidth
        type="text"
        placeholder="Enter Room Id"
        required
      />

      <PrimaryButton type="submit" variant="contained">
        Join Game
      </PrimaryButton>
    </Box>
  );
};

export default JoinRoomForm;
