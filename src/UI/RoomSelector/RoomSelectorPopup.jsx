import { Box, Dialog } from '@mui/material';
import { useState } from 'react';

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
        sx={{
          width: '90%',
          maxWidth: '400px',
          mx: 'auto',
        }}
        slotProps={{
          backdrop: {
            sx: {
              backdropFilter: 'blur(5px)',
            },
          },
        }}
        PaperProps={{
          sx: {
            boxShadow: 'none',
            background: 'rgba(0,0,0,0.5)',
          },
        }}
      >
        <Box sx={{ p: 3 }}>{children}</Box>
      </Dialog>
    </>
  );
}
