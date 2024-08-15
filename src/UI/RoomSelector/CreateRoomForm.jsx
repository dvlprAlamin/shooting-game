import { Box, Button, MenuItem, TextField } from '@mui/material';
import React from 'react';

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
      {/* <TextField
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
        </TextField> */}
      <Button type="submit" variant="contained">
        Start Game
      </Button>
    </Box>
  );
};

export default CreateRoomForm;
