import { Box, IconButton, Tooltip } from '@mui/material';
import React, { useState } from 'react';

const InviteFriends = () => {
  const roomId = localStorage.getItem('roomId');
  const [isCopyRoomId, setIsCopyRoomId] = useState(false);
  const handleCopyRoomId = (e) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(roomId);
    setIsCopyRoomId(true);
  };
  return (
    <Box
      sx={{
        position: 'absolute',
        top: 10,
        right: 130,
        zIndex: 99,
      }}
    >
      {roomId ? (
        <Tooltip title={isCopyRoomId ? 'Room Id Copied!' : 'Copy Room Id'}>
          <IconButton
            onClick={handleCopyRoomId}
            sx={{
              background: '#00000080 !important',
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="#fff"
              height={16}
              width={16}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z"
              />
            </svg>
          </IconButton>
        </Tooltip>
      ) : (
        <></>
      )}
    </Box>
  );
};

export default InviteFriends;
