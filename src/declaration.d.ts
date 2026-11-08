declare module '*.scss';
declare module '*.jsx';

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  readonly VITE_SHOOT_BUTTON?: string;
  readonly VITE_AIM_BUTTON?: string;
  readonly VITE_RELOAD_BUTTON_CODE?: string;
  readonly VITE_RELOAD_BUTTON_NAME?: string;
}
