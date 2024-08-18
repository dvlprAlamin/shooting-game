import { Box, Button, MenuItem, TextField } from '@mui/material';
import React from 'react';
import PrimaryButton from '../elements/Primarybutton';

const CreateRoomForm = ({ handleSubmit }) => {
  return (
    <Box onSubmit={handleSubmit} component="form">
      <TextField
        sx={{ mb: 2 }}
        defaultValue={localStorage.getItem('playerName') || ''}
        label="Your Name"
        name="playerName"
        fullWidth
        type="text"
        placeholder="Enter Your Name"
        required
      />
      <TextField
        label="Duration"
        sx={{ my: 2 }}
        defaultValue={5}
        name="duration"
        select
        fullWidth
        required
      >
        <MenuItem value={5}>5 minutes</MenuItem>
        <MenuItem value={10}>10 minutes</MenuItem>
        <MenuItem value={15}>15 minutes</MenuItem>
        <MenuItem value={20}>20 minutes</MenuItem>
        <MenuItem value={25}>25 minutes</MenuItem>
        <MenuItem value={30}>30 minutes</MenuItem>
      </TextField>
      <TextField
        label="Players Limit"
        sx={{ my: 2 }}
        defaultValue={5}
        name="playersLimit"
        select
        fullWidth
        required
      >
        <MenuItem value={5}>5 Players</MenuItem>
        <MenuItem value={10}>10 Players</MenuItem>
        <MenuItem value={15}>15 Players</MenuItem>
      </TextField>
      <PrimaryButton type="submit" variant="contained">
        Start Game
      </PrimaryButton>
    </Box>
  );
};

export default CreateRoomForm;
