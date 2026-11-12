// Builds the site into dist/: the pages from src/pages.js, the stylesheet, everything in public/, and the game's
// fonts from @fontsource. `wrangler deploy` uploads dist/ as it is (wrangler.jsonc).
import { copyFile, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { deletionPage, landingPage, notFoundPage, privacyPage } from '../src/pages.js';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const require = createRequire(import.meta.url);

const FONTS = {
    '@fontsource/big-shoulders-stencil': ['big-shoulders-stencil-latin-800-normal.woff2'],
    '@fontsource/barlow-semi-condensed': [500, 600, 700].map((w) => `barlow-semi-condensed-latin-${w}-normal.woff2`),
};

await rm(dist, { recursive: true, force: true });
await cp(path.join(root, 'public'), dist, { recursive: true });
await copyFile(path.join(root, 'src/site.css'), path.join(dist, 'site.css'));

await mkdir(path.join(dist, 'fonts'));
for (const [pkg, files] of Object.entries(FONTS)) {
    const dir = path.dirname(require.resolve(`${pkg}/package.json`));
    for (const file of files) await copyFile(path.join(dir, 'files', file), path.join(dist, 'fonts', file));
    // Their license (SIL Open Font License) goes with them.
    await copyFile(path.join(dir, 'LICENSE'), path.join(dist, 'fonts', `LICENSE-${path.basename(pkg)}.txt`));
}

const pages = {
    'index.html': landingPage(),
    'privacy.html': privacyPage(),
    'delete-account.html': deletionPage(),
    '404.html': notFoundPage(),
};
for (const [file, html] of Object.entries(pages)) await writeFile(path.join(dist, file), html);

console.log(`Built ${Object.keys(pages).length} pages into ${path.relative(process.cwd(), dist) || '.'}`);
