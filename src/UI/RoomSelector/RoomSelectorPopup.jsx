import { Box, Dialog } from '@mui/material';
import { useState } from 'react';
import { SHORT_SCREEN_MEDIA } from '../../theme/shortScreen';

export default function RoomSelectorPopup({ action, children }) {
  const [open, setOpen] = useState(false);

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <>
      <Box component="span" onClick={handleClickOpen}>
        {action}
      </Box>
      <Dialog
        open={open}
        onClose={handleClose}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
        fullWidth
        maxWidth={false}
        slotProps={{
          backdrop: {
            sx: {
              backdropFilter: 'blur(5px)',
            },
          },
        }}
        PaperProps={{
          sx: {
            maxWidth: 400,
            boxShadow: 'none',
            background: 'rgba(0,0,0,0.5)',
            [SHORT_SCREEN_MEDIA]: {
              m: 1.5,
              width: 'calc(100% - 24px)',
              maxHeight: 'calc(100% - 24px)',
            },
          },
        }}
      >
        <Box sx={{ p: 3, [SHORT_SCREEN_MEDIA]: { p: 2 } }}>{children}</Box>
      </Dialog>
    </>
  );
}
