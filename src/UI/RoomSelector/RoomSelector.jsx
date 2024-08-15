import {
  Box,
  Button,
  Container,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import React, { useState } from 'react';
import RoomSelectorPopup from './RoomSelectorPopup';
import CreateRoomForm from './CreateRoomForm';
import JoinRoomForm from './JoinRoomForm';
import { nanoid } from 'nanoid';

const RoomSelector = ({ joinRoom }) => {
  const [roomId, setRoomId] = useState('');
  const [isCopyRoomId, setIsCopyRoomId] = useState(false);
  const handleCopyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setIsCopyRoomId(true);
  };
  const startGameHandler = (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const playerName = data.get('playerName');
    if (!roomId && !playerName) return;
    // const duration = data.get('duration');
    if (!isCopyRoomId) {
      alert('Please copy room id and share with your friends');
      return;
    }
    joinRoom(roomId, playerName);
  };
  const joinRoomHandler = (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const playerName = data.get('playerName');
    const roomId = data.get('roomId');
    if (!roomId && !playerName) return;
    if (playerName && roomId) {
      joinRoom(roomId, playerName);
    }
  };

  const createRoomIdHandler = () => {
    setRoomId(nanoid(6));
  };
  return (
    <Container maxWidth="md">
      <Typography
        variant="h2"
        sx={{ fontFamily: 'inherit', my: 5, textAlign: 'center' }}
      >
        Shooter Free
      </Typography>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          gap: 5,
        }}
      >
        <Box
          sx={{
            flex: 1,
            aspectRatio: '1/1',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 0 5px rgba(0,0,0,0.2)',
          }}
        >
          <RoomSelectorPopup
            action={
              <Button variant="contained" onClick={createRoomIdHandler}>
                Create Room
              </Button>
            }
          >
            {roomId ? (
              <Box mb={2}>
                Room Id: {roomId}
                <Tooltip
                  title={isCopyRoomId ? 'Room Id Copied!' : 'Copy Room Id'}
                >
                  <IconButton onClick={handleCopyRoomId}>
                    <svg
                      height={18}
                      width={18}
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
                      />
                    </svg>
                  </IconButton>
                </Tooltip>
              </Box>
            ) : (
              <></>
            )}
            <CreateRoomForm
              roomId={roomId}
              setRoomId={setRoomId}
              handleSubmit={startGameHandler}
            />
          </RoomSelectorPopup>
        </Box>
        <Box
          sx={{
            flex: 1,
            aspectRatio: '1/1',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 0 5px rgba(0,0,0,0.2)',
          }}
        >
          <RoomSelectorPopup
            action={<Button variant="contained">Join Room</Button>}
          >
            <JoinRoomForm handleSubmit={joinRoomHandler} />
          </RoomSelectorPopup>
        </Box>
      </Box>
    </Container>
    // <div style={{ zIndex: 999, position: 'absolute' }}>
    //   <input
    //     type="text"
    //     value={playerName}
    //     onChange={(e) => setPlayerName(e.target.value)}
    //     placeholder="Enter your name"
    //   />
    //   <input
    //     type="text"
    //     value={roomId}
    //     onChange={(e) => setRoomId(e.target.value)}
    //     placeholder="Enter Room ID"
    //   />
    //   <button onClick={handleJoinRoom}>Join Room</button>
    // </div>
  );
};

export default RoomSelector;
