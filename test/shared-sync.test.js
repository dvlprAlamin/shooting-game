import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The client keeps a copy of shared/ (see shared/gameplay.js). Checked when both repos sit side by side.
const serverCopy = fileURLToPath(new URL('../shared/', import.meta.url));
const clientCopy = fileURLToPath(new URL('../../shooting-game/src/shared/', import.meta.url));

test('the client copy of shared/ matches', { skip: !existsSync(clientCopy) && 'client repo not found next to the server' }, () => {
    const files = readdirSync(serverCopy).sort();
    assert.deepEqual(readdirSync(clientCopy).sort(), files, 'different files: run `npm run sync:shared` in shooting-game/');
    for (const file of files) {
        assert.equal(
            readFileSync(clientCopy + file, 'utf8'),
            readFileSync(serverCopy + file, 'utf8'),
            `${file} differs: run \`npm run sync:shared\` in shooting-game/`
        );
    }
});
