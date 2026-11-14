declare module '*.scss';
declare module '*.jsx';

/** The commit the web build was made from (vite.config.js). */
declare const __APP_BUILD__: string;

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  readonly VITE_GOOGLE_WEB_CLIENT_ID?: string;
  readonly VITE_SHOOT_BUTTON?: string;
  readonly VITE_AIM_BUTTON?: string;
  readonly VITE_RELOAD_BUTTON_CODE?: string;
  readonly VITE_RELOAD_BUTTON_NAME?: string;
}
