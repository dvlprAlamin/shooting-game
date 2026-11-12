import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/dist/',
    '**/.wrangler/',
    'apps/client/public/',
    'apps/client/android/',
    'apps/client/ios/',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['apps/client/src/**/*.{js,jsx,ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Node: build scripts, config files, tests
    files: ['*.js', 'apps/client/*.{js,ts}', 'apps/client/scripts/**', 'apps/client/resources/**/*.mjs', 'apps/server/test/**', 'apps/site/**/*.js', 'packages/*/test/**'],
    languageOptions: { globals: globals.node },
  },
  {
    // The game's rules and room host: run by the Worker, by the phone hosting a nearby game, and by the tests
    files: ['packages/game/src/**'],
    languageOptions: { globals: { ...globals['shared-node-browser'], crypto: 'readonly' } },
  },
  {
    // Cloudflare Workers runtime
    files: ['apps/server/src/**'],
    languageOptions: { globals: { ...globals.serviceworker, WebSocketPair: 'readonly' } },
  },
]);
