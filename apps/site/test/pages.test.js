import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deletionPage, landingPage, notFoundPage, privacyPage } from '../src/pages.js';

test('the landing page links the privacy policy and the deletion page, and loads no scripts', () => {
    const html = landingPage();
    assert.match(html, /<h1 class="wordmark">/);
    assert.match(html, /href="\/privacy"/);
    assert.match(html, /href="\/delete-account"/);
    assert.doesNotMatch(html, /<script/);
});

test('the privacy policy gives the steps in the app and loads nothing from elsewhere', () => {
    const html = privacyPage();
    assert.match(html, /RimFire privacy policy/);
    assert.match(html, /open <strong>Settings<\/strong>, then <strong>Account<\/strong>/);
    assert.match(html, /href="\/delete-account"/);
    assert.match(html, /<link rel="canonical" href="https:\/\/rimfire\.anminas\.com\/privacy">/);
    assert.doesNotMatch(html, /<script/);
});

test('the deletion page signs in with Google and deletes through the game server', () => {
    const html = deletionPage('web-client', 'https://api.example/');
    assert.match(html, /const CLIENT_ID = "web-client"/);
    assert.match(html, /const DELETE_URL = "https:\/\/api\.example\/auth\/google\/delete"/);
    assert.match(html, /accounts\.google\.com\/gsi\/client/);
});

test('without sign-in the deletion page gives the steps and an email address', () => {
    const html = deletionPage('');
    assert.doesNotMatch(html, /<script/);
    assert.match(html, /Delete record/);
    assert.match(html, /mailto:/);
});

test('values in the deletion script cannot close it', () => {
    assert.doesNotMatch(deletionPage('</script><b>', 'https://api.example').split('<script>')[1], /<\/script><b>/);
});

test('the 404 page points home', () => {
    assert.match(notFoundPage(), /href="\/"/);
});
