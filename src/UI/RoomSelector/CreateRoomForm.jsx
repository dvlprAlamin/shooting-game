import { Box, MenuItem, TextField } from '@mui/material';
import React from 'react';
import PrimaryButton from '../elements/Primarybutton';
import { SHORT_SCREEN_MEDIA, useShortScreen } from '../../theme/shortScreen';

const CreateRoomForm = ({ handleSubmit }) => {
  const isShortScreen = useShortScreen();
  // On a phone in landscape: small fields, the two selects side by side, and a dense menu.
  const fieldProps = { fullWidth: true, required: true, size: isShortScreen ? 'small' : 'medium' };
  const selectProps = {
    MenuProps: {
      MenuListProps: { dense: isShortScreen },
      PaperProps: { sx: { [SHORT_SCREEN_MEDIA]: { maxHeight: 'calc(100% - 32px)' } } },
    },
  };

  return (
    <Box
      onSubmit={handleSubmit}
      component="form"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 3,
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
      <Box
        sx={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          [SHORT_SCREEN_MEDIA]: { flexDirection: 'row', gap: 1.5 },
        }}
      >
        <TextField
          {...fieldProps}
          label="Duration"
          defaultValue={5}
          name="duration"
          select
          SelectProps={selectProps}
        >
          <MenuItem value={5}>5 minutes</MenuItem>
          <MenuItem value={10}>10 minutes</MenuItem>
          <MenuItem value={15}>15 minutes</MenuItem>
          <MenuItem value={20}>20 minutes</MenuItem>
          <MenuItem value={25}>25 minutes</MenuItem>
          <MenuItem value={30}>30 minutes</MenuItem>
        </TextField>
        <TextField
          {...fieldProps}
          label="Players Limit"
          defaultValue={5}
          name="playersLimit"
          select
          SelectProps={selectProps}
        >
          <MenuItem value={5}>5 Players</MenuItem>
          <MenuItem value={10}>10 Players</MenuItem>
          <MenuItem value={15}>15 Players</MenuItem>
        </TextField>
      </Box>
      <PrimaryButton type="submit" variant="contained">
        Start Game
      </PrimaryButton>
    </Box>
  );
};

export default CreateRoomForm;
