// Renders signboard.html to signboard.png (1024x1024). Optimize the PNG if you like (e.g. palette
// quantizing), then run embed.mjs to put it in the GLB.
//
//   PLAYWRIGHT=<path to a playwright package> node apps/client/resources/signboard/render.mjs
//
// Playwright is not a dependency of the app; any installed copy with its Chromium works
// (e.g. one cached by npx under ~/.npm/_npx/*/node_modules/playwright).
import fs from 'fs';
import path from 'path';
import http from 'http';
import { createRequire } from 'module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');
const CLIENT = path.resolve(import.meta.dirname, '../..');
const TYPES = { '.html': 'text/html', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

function serve() {
    const server = http.createServer((req, res) => {
        const file = path.join(CLIENT, decodeURIComponent(req.url.split('?')[0]));
        fs.readFile(file, (err, data) => {
            if (err) return res.writeHead(404).end();
            res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(data);
        });
    });
    return new Promise(resolve => server.listen(0, () => resolve(server)));
}

const server = await serve();
const browser = await chromium.launch();
try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
    await page.goto(`http://localhost:${server.address().port}/resources/signboard/signboard.html`);
    await page.waitForFunction(() => globalThis.done);
    await page.locator('#atlas').screenshot({ path: path.join(import.meta.dirname, 'signboard.png') });
    console.log('wrote signboard.png');
} finally {
    await browser.close();
    server.close();
}
