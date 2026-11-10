import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import React from 'react';
import { SHORT_SCREEN_MEDIA, useShortScreen } from '../../theme/shortScreen';

// Fills the rest of its flex-column parent; only the table scrolls when there are more players than fit.
const LeaderBoard = ({ leaderboard }) => {
  const isShortScreen = useShortScreen();

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Typography
        sx={{
          fontSize: 24,
          fontWeight: 600,
          color: '#fff',
          textAlign: 'center',
          mb: 2,
          flexShrink: 0,
          [SHORT_SCREEN_MEDIA]: { fontSize: 18, mb: 1 },
        }}
      >
        Leaderboard
      </Typography>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgb(255 255 255 / 30%) transparent',
        }}
      >
        <Table
          size={isShortScreen ? 'small' : 'medium'}
          sx={{
            '& td': {
              borderBottom: '1px solid rgb(255 255 255 / 15%)',
            },
            '& th': {
              borderBlock: '1px solid rgb(255 255 255 / 15%)',
            },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell>Player Name</TableCell>
              <TableCell align="center">Kills</TableCell>
              <TableCell align="center">Respawn</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {Object.values(leaderboard)
              ?.sort((a, b) => b.kills - a.kills)
              ?.map(({ kills, deaths, id, playerName }) => (
                <TableRow key={id}>
                  <TableCell>{playerName}</TableCell>
                  <TableCell align="center">{kills}</TableCell>
                  <TableCell align="center">{deaths}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
};

export default LeaderBoard;
