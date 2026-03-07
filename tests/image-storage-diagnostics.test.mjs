import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const htmlPath = new URL('../artist manager.html', import.meta.url);
const html = fs.readFileSync(htmlPath, 'utf8');

function extractConstFunction(name) {
  const pattern = new RegExp(`const\\s+${name}\\s*=\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>\\s*\\{[\\s\\S]*?\\n\\s*\\};`);
  const match = html.match(pattern);
  assert.ok(match, `Expected to find const ${name} in artist manager.html`);
  return match[0];
}

function loadConstFunction(name, extraContext = {}) {
  const context = {
    Object,
    Array,
    Math,
    String,
    navigator: {},
    ...extraContext
  };
  vm.createContext(context);
  return vm.runInContext(`(() => { ${extractConstFunction(name)} return ${name}; })()`, context);
}

test('shouldWarnAboutMissingImageLibrary flags likely lost local image library', () => {
  const fn = loadConstFunction('shouldWarnAboutMissingImageLibrary');
  const artists = [
    { id: '1', imageUrl: '' },
    { id: '2', imageUrl: '' },
    { id: '3', imageUrl: '' },
    { id: '4', imageUrl: 'https://example.com/cover.jpg' }
  ];

  assert.equal(fn(artists, {}), true);
});

test('shouldWarnAboutMissingImageLibrary stays quiet when image map already has blobs', () => {
  const fn = loadConstFunction('shouldWarnAboutMissingImageLibrary');
  const artists = [
    { id: '1', imageUrl: '' },
    { id: '2', imageUrl: '' },
    { id: '3', imageUrl: '' }
  ];

  assert.equal(fn(artists, { '1': 'blob:https://gallery.nyaneko.cn/a' }), false);
});

test('shouldWarnAboutMissingImageLibrary warns immediately when tracked local images are expected', () => {
  const fn = loadConstFunction('shouldWarnAboutMissingImageLibrary');

  assert.equal(fn([{ id: '1', imageUrl: '' }], {}, ['1']), true);
});

test('shouldRemoveTrackedLocalImage flags switching from local image to remote URL', () => {
  const helperSource = `${extractConstFunction('isEmbeddedLocalImageUrl')}\n${extractConstFunction('shouldRemoveTrackedLocalImage')}`;
  const fn = vm.runInNewContext(`(() => { ${helperSource}\n return shouldRemoveTrackedLocalImage; })()`, { String, Set });

  assert.equal(fn({ id: 'artist-1', imageUrl: 'blob:https://gallery.nyaneko.cn/abc' }, 'https://example.com/cover.jpg', ['artist-1']), true);
  assert.equal(fn({ id: 'artist-1', imageUrl: 'blob:https://gallery.nyaneko.cn/abc' }, '', ['artist-1']), true);
  assert.equal(fn({ id: 'artist-1', imageUrl: 'blob:https://gallery.nyaneko.cn/abc' }, 'data:image/png;base64,abc', ['artist-1']), false);
});

test('requestPersistentImageStorage asks browser to persist when not already persisted', async () => {
  let persistCalled = 0;
  const fn = loadConstFunction('requestPersistentImageStorage', {
    navigator: {
      storage: {
        async persisted() {
          return false;
        },
        async persist() {
          persistCalled += 1;
          return true;
        }
      }
    }
  });

  assert.equal(await fn(), true);
  assert.equal(persistCalled, 1);
});

test('requestPersistentImageStorage skips persist when already granted', async () => {
  let persistCalled = 0;
  const fn = loadConstFunction('requestPersistentImageStorage', {
    navigator: {
      storage: {
        async persisted() {
          return true;
        },
        async persist() {
          persistCalled += 1;
          return true;
        }
      }
    }
  });

  assert.equal(await fn(), true);
  assert.equal(persistCalled, 0);
});
