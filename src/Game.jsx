import App from '@/App';
import React from 'react';
import MUIThemeProvider from './theme/Theme';
import { SnackbarProvider } from 'notistack';
import { StyledMaterialDesignContent } from './hooks/CustomSnackbar';
import { IS_TOUCH } from './config';

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
        // On touch screens the bottom corners hold the controls, so the kill feed goes top centre.
        maxSnack={IS_TOUCH ? 4 : 8}
        dense={IS_TOUCH}
        anchorOrigin={{
          vertical: IS_TOUCH ? 'top' : 'bottom',
          horizontal: IS_TOUCH ? 'center' : 'left',
        }}
      >
        <App />
      </SnackbarProvider>
    </MUIThemeProvider>
  );
};

export default Game;
