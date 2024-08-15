import { Box, Button, TextField } from '@mui/material';
import React from 'react';

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

      <Button type="submit" variant="contained">
        Join Game
      </Button>
    </Box>
  );
};

export default JoinRoomForm;
