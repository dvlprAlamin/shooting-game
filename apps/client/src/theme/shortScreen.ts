import { useMediaQuery } from '@mui/material';

// Phones in landscape are only ~300-430px tall, so menus and dialogs switch to a compact layout below
// this height. Use `SHORT_SCREEN_MEDIA` as an sx key, or `useShortScreen()` for props like `size`.
export const SHORT_SCREEN = '(max-height: 500px)';
export const SHORT_SCREEN_MEDIA = `@media ${SHORT_SCREEN}`;
export const useShortScreen = () => useMediaQuery(SHORT_SCREEN);
