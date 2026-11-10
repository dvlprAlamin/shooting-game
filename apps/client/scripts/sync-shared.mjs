/* eslint-env node */
/**
 * Copies the gameplay files shared with the server into src/shared/.
 * The server repo is the source of truth (see shared/gameplay.js there); run this after editing them.
 *
 * Usage:
 *   npm run sync:shared                  # expects ../shooting-game-server next to this repo
 *   npm run sync:shared -- <serverRepo>  # or point it at the server repo
 */
import { cpSync, existsSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverRepo = path.resolve(root, process.argv[2] ?? '../shooting-game-server');
const from = path.join(serverRepo, 'shared');
const to = path.join(root, 'src/shared');

if (!existsSync(from)) {
  console.error(`Not found: ${from}\nPass the server repo path: npm run sync:shared -- <path>`);
  process.exit(1);
}
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`Copied ${from} -> ${to}`);
