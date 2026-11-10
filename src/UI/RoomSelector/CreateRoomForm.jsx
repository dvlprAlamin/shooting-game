import { Box, MenuItem, TextField } from '@mui/material';
import React from 'react';
import PrimaryButton from '../elements/Primarybutton';
import { SHORT_SCREEN_MEDIA, useShortScreen } from '../../theme/shortScreen';
import { PLAYER_LIMITS, ROOM_DURATIONS } from '@/shared/gameplay';

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
          defaultValue={ROOM_DURATIONS[0]}
          name="duration"
          select
          SelectProps={selectProps}
        >
          {ROOM_DURATIONS.map((minutes) => (
            <MenuItem key={minutes} value={minutes}>
              {minutes} minutes
            </MenuItem>
          ))}
        </TextField>
        <TextField
          {...fieldProps}
          label="Players Limit"
          defaultValue={PLAYER_LIMITS[0]}
          name="playersLimit"
          select
          SelectProps={selectProps}
        >
          {PLAYER_LIMITS.map((limit) => (
            <MenuItem key={limit} value={limit}>
              {limit} Players
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <PrimaryButton type="submit" variant="contained">
        Start Game
      </PrimaryButton>
    </Box>
  );
};

export default CreateRoomForm;
