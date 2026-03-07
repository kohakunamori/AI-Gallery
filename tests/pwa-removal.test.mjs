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

test('repository no longer ships PWA runtime files', () => {
  assert.equal(fs.existsSync(new URL('../manifest.webmanifest', import.meta.url)), false);
  assert.equal(fs.existsSync(new URL('../service-worker.js', import.meta.url)), false);
  assert.equal(fs.existsSync(new URL('../pwa-192.png', import.meta.url)), false);
  assert.equal(fs.existsSync(new URL('../pwa-512.png', import.meta.url)), false);
});

test('main page uses local generated Tailwind CSS instead of the Play CDN runtime', () => {
  assert.doesNotMatch(html, /<script\s+src="https?:\/\/[^\"]*tailwind[^\"]*"/i);
  assert.match(html, /<link\s+rel="stylesheet"\s+href="\.\/tailwind\.generated\.css"/i);
});

test('main page uses a local Lucide bundle instead of the unpkg CDN', () => {
  assert.doesNotMatch(html, /<script\s+src="https?:\/\/[^\"]*lucide[^\"]*"/i);
  assert.match(html, /<script\s+src="\.\/vendor\/lucide\.min\.js"/i);
  assert.equal(fs.existsSync(new URL('../vendor/lucide.min.js', import.meta.url)), true);
});
