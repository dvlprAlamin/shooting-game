import {execSync} from 'node:child_process';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// Which code a build is: the commit, marked -dirty if tracked files had changes. Crash reports carry it, so a stack
// trace can be matched to its source. The Android and iOS apps share one web build, so their own version numbers
// can't be baked in here.
const git = (command) => execSync(`git ${command}`, {stdio: ['ignore', 'pipe', 'ignore']}).toString().trim();
const build = () => {
    try {
        let dirty = false;
        try {
            git('diff --quiet HEAD');
        } catch {
            dirty = true;
        }
        return git('rev-parse --short HEAD') + (dirty ? '-dirty' : '');
    } catch {
        return 'unknown'; // not a git checkout
    }
};

export default defineConfig({
    plugins: [react()],
    define: {
        __APP_BUILD__: JSON.stringify(build())
    },
    resolve: {
        alias: {
            '@': '/src'
        }
    }
});
