import {
  Box,
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
import PrimaryButton from '../elements/Primarybutton';
import { SHORT_SCREEN_MEDIA, useShortScreen } from '../../theme/shortScreen';

const RoomSelector = ({ joinRoom }) => {
  const isShortScreen = useShortScreen();
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
    const duration = data.get('duration');
    const playersLimit = data.get('playersLimit');

    joinRoom({ roomId, playerName, isCreate: true, duration, playersLimit });
    localStorage.setItem('playerName', playerName);
    localStorage.setItem('roomId', roomId);
  };
  const joinRoomHandler = (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const playerName = data.get('playerName');
    const roomId = data.get('roomId');
    if (!roomId && !playerName) return;
    joinRoom({ roomId, playerName, isCreate: false });
    localStorage.setItem('roomId', roomId);
    localStorage.setItem('playerName', playerName);
  };

  const createRoomIdHandler = () => {
    setRoomId(nanoid(6));
  };
  return (
    // Exactly one screen tall: the title scales with the viewport height and the cards take what's left,
    // so nothing scrolls on a phone in landscape.
    <Container
      maxWidth="md"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        pt: 'var(--safe-top)',
        pb: 'calc(var(--safe-bottom) + clamp(12px, 5vh, 40px))',
        pl: 'calc(var(--safe-left) + 16px)',
        pr: 'calc(var(--safe-right) + 16px)',
      }}
    >
      <Typography
        variant="h2"
        sx={{
          color: '#fff',
          py: 'clamp(8px, 6vh, 40px)',
          fontSize: 'clamp(2rem, 13vh, 3.75rem)',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        Shooter Free
      </Typography>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          gap: 'clamp(16px, 5vw, 40px)',
          '@media (orientation: portrait)': {
            flexDirection: 'column',
            alignItems: 'center',
          },
        }}
      >
        <Card>
          <RoomSelectorPopup
            action={
              <PrimaryButton variant="contained" onClick={createRoomIdHandler}>
                Create Room
              </PrimaryButton>
            }
          >
            {roomId ? (
              <Box sx={{ mb: 2, [SHORT_SCREEN_MEDIA]: { mb: 1 } }}>
                Room Id: {roomId}
                <Tooltip
                  title={isCopyRoomId ? 'Room Id Copied!' : 'Copy Room Id'}
                >
                  <IconButton onClick={handleCopyRoomId} size={isShortScreen ? 'small' : 'medium'}>
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
        </Card>
        <Card>
          <RoomSelectorPopup
            action={
              <PrimaryButton variant="contained">Join Room</PrimaryButton>
            }
          >
            <JoinRoomForm handleSubmit={joinRoomHandler} />
          </RoomSelectorPopup>
        </Card>
      </Box>
    </Container>
  );
};

export default RoomSelector;

const Card = ({ children }) => {
  return (
    <Box
      sx={{
        // Square, as tall as the space allows (up to 400px).
        height: '100%',
        maxHeight: 400,
        aspectRatio: '1/1',
        minWidth: 0,
        '@media (orientation: portrait)': {
          height: 'auto',
          flex: '1 1 0',
          width: '100%',
          maxWidth: 400,
          aspectRatio: 'auto',
        },
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(255, 255, 255, 0.05)',
        boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
        backdropFilter: 'blur(5px)',
        borderRadius: '10px',
      }}
    >
      {children}
    </Box>
  );
};
