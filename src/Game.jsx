import App from '@/App';
import React from 'react';
import MUIThemeProvider from './theme/Theme';
import { SnackbarProvider } from 'notistack';
import { StyledMaterialDesignContent } from './hooks/CustomSnackbar';

const Game = () => {
  return (
    <MUIThemeProvider>
      <SnackbarProvider
        // hideIconVariant
        Components={{
          success: StyledMaterialDesignContent,
          info: StyledMaterialDesignContent,
          error: StyledMaterialDesignContent,
          default: StyledMaterialDesignContent,
          // warning: StyledMaterialDesignContent,
        }}
        maxSnack={8}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
      >
        <App />
      </SnackbarProvider>
    </MUIThemeProvider>
  );
};

export default Game;
