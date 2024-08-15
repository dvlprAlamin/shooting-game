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
      >
        <Box sx={{ p: 3 }}>{children}</Box>
      </Dialog>
    </>
  );
}
