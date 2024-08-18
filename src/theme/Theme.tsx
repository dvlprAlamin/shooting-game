import { createTheme, ThemeProvider } from '@mui/material/styles';
import { ReactNode } from 'react';

const theme = createTheme({
  typography: {
    fontFamily: 'Juvanze',
    allVariants: {
      letterSpacing: 2,
    },
  },
  palette: {
    mode: 'dark',
    primary: {
      main: '#008000',
    },
  },
  components: {
    MuiSnackbarContent: {
      styleOverrides: {
        root: {
          backgroundColor: '#333',
          color: '#fff',
          fontSize: '18px',
          padding: '16px',
        },
      },
    },
  },
});

function MUIThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

export default MUIThemeProvider;
