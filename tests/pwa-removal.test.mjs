import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const htmlPath = new URL('../artist manager.html', import.meta.url);
const html = fs.readFileSync(htmlPath, 'utf8');

test('main page no longer includes PWA manifest or install metadata', () => {
  assert.doesNotMatch(html, /<link\s+rel="manifest"/i);
  assert.doesNotMatch(html, /apple-mobile-web-app-capable/i);
  assert.doesNotMatch(html, /apple-mobile-web-app-status-bar-style/i);
  assert.doesNotMatch(html, /apple-touch-icon/i);
  assert.doesNotMatch(html, /navigator\.serviceWorker\.register/i);
});

test('main page includes the modern mobile web app capable meta tag', () => {
  assert.match(html, /<meta\s+name="mobile-web-app-capable"\s+content="yes"\s*\/?>/i);
});

test('repository no longer ships PWA runtime files', () => {
  assert.equal(fs.existsSync(new URL('../manifest.webmanifest', import.meta.url)), false);
  assert.equal(fs.existsSync(new URL('../service-worker.js', import.meta.url)), false);
  assert.equal(fs.existsSync(new URL('../pwa-192.png', import.meta.url)), false);
  assert.equal(fs.existsSync(new URL('../pwa-512.png', import.meta.url)), false);
});
