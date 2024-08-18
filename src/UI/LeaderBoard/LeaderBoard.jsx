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

const LeaderBoard = ({ leaderboard }) => {
  return (
    <Box sx={{ maxHeight: '80vh', overflowY: 'auto' }}>
      <Typography
        sx={{
          fontSize: 24,
          fontWeight: 600,
          color: '#fff',
          textAlign: 'center',
          mb: 2,
        }}
      >
        Leaderboard
      </Typography>
      <Table
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
  );
};

export default LeaderBoard;
