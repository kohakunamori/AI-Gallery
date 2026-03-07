import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const htmlPath = new URL('../artist manager.html', import.meta.url);
const html = fs.readFileSync(htmlPath, 'utf8');

function extractConstFunction(name) {
  const startToken = `const ${name} =`;
  const startIndex = html.indexOf(startToken);
  assert.notEqual(startIndex, -1, `Expected to find const ${name}`);

  const arrowIndex = html.indexOf('=>', startIndex);
  assert.notEqual(arrowIndex, -1, `Expected ${name} to be an arrow function`);

  const braceStart = html.indexOf('{', arrowIndex);
  assert.notEqual(braceStart, -1, `Expected ${name} to have a function body`);

  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;

  for (let i = braceStart; i < html.length; i += 1) {
    const char = html[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (!inDouble && !inTemplate && char === "'") {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inTemplate && char === '"') {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && char === '`') {
      inTemplate = !inTemplate;
      continue;
    }
    if (inSingle || inDouble || inTemplate) continue;

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        const endIndex = html.indexOf(';', i);
        assert.notEqual(endIndex, -1, `Expected const ${name} to end with a semicolon`);
        return html.slice(startIndex, endIndex + 1);
      }
    }
  }

  assert.fail(`Failed to extract const ${name}`);
}

function extractWindowFunction(name) {
  const startToken = `window.${name} =`;
  const startIndex = html.indexOf(startToken);
  assert.notEqual(startIndex, -1, `Expected to find window.${name}`);

  const braceStart = html.indexOf('{', startIndex);
  assert.notEqual(braceStart, -1, `Expected window.${name} to have a function body`);

  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;

  for (let i = braceStart; i < html.length; i += 1) {
    const char = html[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (!inDouble && !inTemplate && char === "'") {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inTemplate && char === '"') {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && char === '`') {
      inTemplate = !inTemplate;
      continue;
    }
    if (inSingle || inDouble || inTemplate) continue;

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        const endIndex = html.indexOf(';', i);
        assert.notEqual(endIndex, -1, `Expected window.${name} to end with a semicolon`);
        return html.slice(startIndex, endIndex + 1);
      }
    }
  }

  assert.fail(`Failed to extract window.${name}`);
}

function loadConstFunctions(names, extraContext = {}) {
  const source = names.map((name) => extractConstFunction(name)).join('\n');
  const context = {
    String,
    Number,
    Math,
    Array,
    Object,
    JSON,
    Blob,
    URL,
    ...extraContext
  };

  vm.createContext(context);
  return vm.runInContext(`(() => { ${source}\n return { ${names.join(', ')} }; })()`, context);
}

function loadWindowFunction(name, extraContext = {}) {
  const context = {
    window: {},
    FileReader: class {},
    ...extraContext
  };

  vm.createContext(context);
  vm.runInContext(extractWindowFunction(name), context);
  return context.window[name];
}

function loadSnippet(source, returnExpression, extraContext = {}) {
  const context = {
    ...extraContext
  };
  vm.createContext(context);
  return vm.runInContext(`(() => { ${source}
 return ${returnExpression}; })()`, context);
}

test('buildSplitSyncTargetLayout derives metadata and asset paths from sync targets', () => {
  const { buildSplitSyncTargetLayout } = loadConstFunctions(['buildSplitSyncTargetLayout']);

  assert.deepEqual(
    JSON.parse(JSON.stringify(buildSplitSyncTargetLayout('folder/gallery.json'))),
    {
      metadataPath: 'folder/gallery.sync-meta.json',
      assetPrefix: 'folder/gallery.sync-assets/'
    }
  );

  assert.deepEqual(
    JSON.parse(JSON.stringify(buildSplitSyncTargetLayout('gallery.json'))),
    {
      metadataPath: 'gallery.sync-meta.json',
      assetPrefix: 'gallery.sync-assets/'
    }
  );
});

test('buildSplitSyncMetadata keeps remote image URLs inline and moves local images into asset references', () => {
  const { buildSplitSyncMetadata } = loadConstFunctions(['buildSplitSyncMetadata'], {
    EXPORT_VERSION: 5,
    normalizeArtistList(artists) {
      return Array.isArray(artists) ? artists.map((artist) => ({ ...artist })) : [];
    },
    normalizeArtistRecord(artist) {
      return { ...artist };
    },
    normalizeCategoryList(categories) {
      return Array.isArray(categories) ? [...categories] : [];
    }
  });

  const result = buildSplitSyncMetadata({
    exportVersion: 5,
    artists: [
      { id: 'a1', tag: 'one', imageUrl: 'blob:https://gallery.local/1' },
      { id: 'a2', tag: 'two', imageUrl: 'https://example.com/cover.jpg' }
    ],
    categories: ['A'],
    settings: { theme: 'light' },
    syncConfig: { syncMethod: 'webdav' },
    imageAssetMap: {
      a1: { assetPath: 'gallery.sync-assets/images/a1.webp', contentHash: 'hash-a1', mimeType: 'image/webp', size: 123 }
    },
    backgroundAsset: { assetPath: 'gallery.sync-assets/backgrounds/bg.webp', contentHash: 'hash-bg', mimeType: 'image/webp', size: 456 }
  });

  assert.equal(result.app, 'ai-gallery');
  assert.equal(result.format, 'split-sync-assets');
  assert.equal(result.version, 5);
  assert.equal(result.artists[0].imageUrl, '');
  assert.deepEqual(JSON.parse(JSON.stringify(result.artists[0].imageAsset)), {
    assetPath: 'gallery.sync-assets/images/a1.webp',
    contentHash: 'hash-a1',
    mimeType: 'image/webp',
    size: 123
  });
  assert.equal(result.artists[1].imageUrl, 'https://example.com/cover.jpg');
  assert.equal(result.artists[1].imageAsset, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(result.settings.backgroundImageAsset)), {
    assetPath: 'gallery.sync-assets/backgrounds/bg.webp',
    contentHash: 'hash-bg',
    mimeType: 'image/webp',
    size: 456
  });
});

test('handleImport rejects sync-only split manifests for local file import', async () => {
  const toasts = [];
  class FileReaderStub {
    readAsText() {
      this.onload({
        target: {
          result: JSON.stringify({
            app: 'ai-gallery',
            version: 5,
            format: 'split-sync-assets',
            artists: []
          })
        }
      });
    }
  }

  const handleImport = loadWindowFunction('handleImport', {
    FileReader: FileReaderStub,
    ensureImportFileSizeSafe() {},
    parseJsonOrThrow(text) {
      return JSON.parse(text);
    },
    ensureImportMetadataSafe() {},
    resolveImportPayload(rawJson) {
      return rawJson;
    },
    ensureImportPayloadSafe() {},
    overwriteImportResolvedPayload() {
      throw new Error('local import should not reach overwrite for split sync manifests');
    },
    toastFailure(label, error) {
      toasts.push(`${label}:${error.message}`);
    },
    showToast() {},
    buildMergeSummary() {
      return 'unused';
    }
  });

  handleImport({
    target: {
      files: [{ size: 128 }],
      value: 'occupied'
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], /导入失败:.*split|导入失败:.*同步|导入失败:.*manifest/i);
});

test('resolveImportPayload preserves split image/background asset manifests', () => {
  const { resolveImportPayload } = loadConstFunctions(['isSplitSyncMetadataPayload', 'resolveImportPayload'], {
    themes: { light: {}, dark: {} },
    normalizeCategoryList(categories) {
      return Array.isArray(categories) ? [...categories] : [];
    },
    normalizeNodeTagPresetList(list) {
      return Array.isArray(list) ? [...list] : [];
    },
    normalizeCategoryName(value) {
      return String(value || '').trim();
    },
    normalizeGeneratorType(value) {
      return String(value || '').trim();
    },
    mapLegacyArtists(list) {
      return list;
    }
  });

  const result = resolveImportPayload({
    app: 'ai-gallery',
    format: 'split-sync-assets',
    version: 5,
    categories: ['A'],
    artists: [
      {
        id: 'artist-1',
        tag: 'one',
        imageUrl: '',
        imageAsset: { assetPath: 'gallery.sync-assets/images/artist-1.webp', mimeType: 'image/webp', size: 123 }
      }
    ],
    settings: {
      theme: 'light',
      displayConfig: { backgroundImage: '' },
      backgroundImageAsset: { assetPath: 'gallery.sync-assets/backgrounds/bg.webp', contentHash: 'hash-bg', mimeType: 'image/webp', size: 456 }
    },
    syncConfig: { syncMethod: 'webdav' }
  });

  assert.equal(result.artists.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.artists[0].imageAsset)), {
    assetPath: 'gallery.sync-assets/images/artist-1.webp',
    mimeType: 'image/webp',
    size: 123
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result.settingsPatch.backgroundImageAsset)), {
    assetPath: 'gallery.sync-assets/backgrounds/bg.webp',
    contentHash: 'hash-bg',
    mimeType: 'image/webp',
    size: 456
  });
  assert.equal(result.syncConfigPatch.syncMethod, 'webdav');
});

test('resolveImportPayload keeps versioned full backups on the modern import path', () => {
  let legacyCallCount = 0;
  const { resolveImportPayload } = loadConstFunctions(['isSplitSyncMetadataPayload', 'resolveImportPayload'], {
    themes: { light: {}, dark: {} },
    normalizeCategoryList(categories) {
      return Array.isArray(categories) ? [...categories] : [];
    },
    normalizeNodeTagPresetList(list) {
      return Array.isArray(list) ? [...list] : [];
    },
    normalizeCategoryName(value) {
      return String(value || '').trim();
    },
    normalizeGeneratorType(value) {
      return String(value || '').trim();
    },
    mapLegacyArtists(list) {
      legacyCallCount += 1;
      return list;
    }
  });

  const artists = [{ id: 'artist-1', tag: 'one', imageUrl: 'data:image/png;base64,abc' }];
  const result = resolveImportPayload({
    app: 'ai-gallery',
    version: 5,
    categories: ['A'],
    artists,
    settings: { theme: 'light' },
    syncConfig: { syncMethod: 's3', s3Config: { bucket: 'gallery' } }
  });

  assert.equal(legacyCallCount, 0);
  assert.deepEqual(result.artists, artists);
  assert.deepEqual(result.categories, ['A']);
  assert.equal(result.settingsPatch.theme, 'light');
  assert.equal(result.syncConfigPatch.syncMethod, 's3');
  assert.deepEqual(result.syncConfigPatch.s3Config, { bucket: 'gallery' });
});

test('resolveImportPayload still maps legacy arrays and legacy artist objects', () => {
  const legacyCalls = [];
  const { resolveImportPayload } = loadConstFunctions(['isSplitSyncMetadataPayload', 'resolveImportPayload'], {
    themes: { light: {}, dark: {} },
    normalizeCategoryList(categories) {
      return Array.isArray(categories) ? [...categories] : [];
    },
    normalizeNodeTagPresetList(list) {
      return Array.isArray(list) ? [...list] : [];
    },
    normalizeCategoryName(value) {
      return String(value || '').trim();
    },
    normalizeGeneratorType(value) {
      return String(value || '').trim();
    },
    mapLegacyArtists(list) {
      legacyCalls.push(JSON.parse(JSON.stringify(list)));
      return list.map((item, index) => ({ id: `mapped-${index + 1}`, tag: String(item.tag || item.name || 'legacy') }));
    }
  });

  const legacyArtists = [{ name: 'Legacy Artist', tag: 'legacy', image: 'data:image/png;base64,abc', count: 7, time: 123 }];
  const fromArray = resolveImportPayload(legacyArtists);
  const fromLegacyObject = resolveImportPayload({ version: 1, categories: ['A'], artists: legacyArtists });

  assert.equal(legacyCalls.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(fromArray.artists)), [{ id: 'mapped-1', tag: 'legacy' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(fromArray.categories)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(fromLegacyObject.artists)), [{ id: 'mapped-1', tag: 'legacy' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(fromLegacyObject.categories)), ['A']);
});

test('buildSplitSyncUploadBundle produces metadata plus separate image/background assets', async () => {
  const imageBlob = new Blob(['artist-image'], { type: 'image/webp' });
  const backgroundBlob = new Blob(['background-image'], { type: 'image/png' });
  const { buildSplitSyncUploadBundle } = loadConstFunctions([
    'isEmbeddedLocalImageUrl',
    'buildSplitSyncTargetLayout',
    'buildSplitSyncArtistAssetBaseName',
    'buildSplitSyncMetadata',
    'computeSplitSyncMetadataHash',
    'buildSplitSyncUploadBundle'
  ], {
    EXPORT_VERSION: 5,
    normalizeArtistList(artists) {
      return Array.isArray(artists) ? artists.map((artist) => ({ ...artist })) : [];
    },
    normalizeArtistRecord(artist) {
      return { ...artist };
    },
    normalizeCategoryList(categories) {
      return Array.isArray(categories) ? [...categories] : [];
    },
    getImageBlobFromIDB: async (id) => (id === 'artist-1' ? imageBlob : null),
    dataUrlToBlob: async () => backgroundBlob,
    async sha256Hex(value) {
      if (value === imageBlob) return 'hash-image';
      if (value === backgroundBlob) return 'hash-background';
      return 'hash-metadata';
    }
  });

  const result = await buildSplitSyncUploadBundle({
    targetPath: 'sync/gallery.json',
    artists: [
      { id: 'artist-1', tag: 'one', imageUrl: 'blob:https://gallery.local/1' },
      { id: 'artist-2', tag: 'two', imageUrl: 'https://example.com/cover.jpg' }
    ],
    categories: ['A'],
    settings: {
      displayConfig: {
        backgroundImage: 'data:image/png;base64,abc'
      }
    },
    syncConfig: { syncMethod: 'webdav' }
  });

  assert.equal(result.metadataPath, 'sync/gallery.sync-meta.json');
  assert.equal(result.assetEntries.length, 2);
  assert.equal(result.assetEntries[0].assetPath, 'sync/gallery.sync-assets/images/one-hash-image.webp');
  assert.equal(result.assetEntries[0].blob, imageBlob);
  assert.equal(result.assetEntries[0].contentHash, 'hash-image');
  assert.equal(result.assetEntries[1].assetPath, 'sync/gallery.sync-assets/backgrounds/gallery-background.png');
  assert.equal(result.assetEntries[1].blob, backgroundBlob);
  assert.equal(result.assetEntries[1].contentHash, 'hash-background');
  assert.equal(result.metadata.artists[0].imageUrl, '');
  assert.equal(result.metadata.artists[0].imageAsset.assetPath, 'sync/gallery.sync-assets/images/one-hash-image.webp');
  assert.equal(result.metadata.artists[0].imageAsset.contentHash, 'hash-image');
  assert.equal(result.metadata.artists[1].imageUrl, 'https://example.com/cover.jpg');
  assert.equal(result.metadata.assetManifestVersion, 1);
  assert.equal(result.metadata.contentHash, 'hash-metadata');
});

test('buildSplitSyncUploadBundle rejects local blob images that are missing from IDB', async () => {
  const { buildSplitSyncUploadBundle } = loadConstFunctions([
    'isEmbeddedLocalImageUrl',
    'buildSplitSyncTargetLayout',
    'buildSplitSyncArtistAssetBaseName',
    'buildSplitSyncMetadata',
    'computeSplitSyncMetadataHash',
    'buildSplitSyncUploadBundle'
  ], {
    EXPORT_VERSION: 5,
    normalizeArtistList(artists) {
      return Array.isArray(artists) ? artists.map((artist) => ({ ...artist })) : [];
    },
    normalizeArtistRecord(artist) {
      return { ...artist };
    },
    normalizeCategoryList(categories) {
      return Array.isArray(categories) ? [...categories] : [];
    },
    getImageBlobFromIDB: async () => null,
    dataUrlToBlob: async () => null,
    async sha256Hex() {
      return 'hash-metadata';
    }
  });

  await assert.rejects(
    buildSplitSyncUploadBundle({
      targetPath: 'sync/gallery.json',
      artists: [
        { id: 'artist-1', tag: 'one', imageUrl: 'blob:https://gallery.local/1' }
      ],
      categories: [],
      settings: { displayConfig: {} },
      syncConfig: { syncMethod: 's3' }
    }),
    /本地图片资源缺失|无法从当前浏览器读取/i
  );
});

test('buildSplitSyncUploadBundle makes artist asset paths collision-safe across tag variants', async () => {
  const fooBlob = new Blob(['foo-image'], { type: 'image/webp' });
  const fooLowerBlob = new Blob(['foo-lower-image'], { type: 'image/webp' });
  const { buildSplitSyncUploadBundle } = loadConstFunctions([
    'isEmbeddedLocalImageUrl',
    'buildSplitSyncTargetLayout',
    'buildSplitSyncArtistAssetBaseName',
    'buildSplitSyncMetadata',
    'computeSplitSyncMetadataHash',
    'buildSplitSyncUploadBundle'
  ], {
    EXPORT_VERSION: 5,
    normalizeArtistList(artists) {
      return Array.isArray(artists) ? artists.map((artist) => ({ ...artist })) : [];
    },
    normalizeArtistRecord(artist) {
      return { ...artist };
    },
    normalizeCategoryList(categories) {
      return Array.isArray(categories) ? [...categories] : [];
    },
    getImageBlobFromIDB: async (id) => (id === 'artist-upper' ? fooBlob : fooLowerBlob),
    dataUrlToBlob: async () => null,
    async sha256Hex(value) {
      if (value === fooBlob) return 'hash-upper-12345678';
      if (value === fooLowerBlob) return 'hash-lower-87654321';
      return 'hash-metadata';
    }
  });

  const result = await buildSplitSyncUploadBundle({
    targetPath: 'sync/gallery.json',
    artists: [
      { id: 'artist-upper', tag: 'Foo', imageUrl: 'blob:https://gallery.local/upper' },
      { id: 'artist-lower', tag: 'foo', imageUrl: 'blob:https://gallery.local/lower' }
    ],
    categories: [],
    settings: { displayConfig: {} },
    syncConfig: { syncMethod: 'webdav' }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result.assetEntries.map((entry) => entry.assetPath))), [
    'sync/gallery.sync-assets/images/Foo-hash-upper-1.webp',
    'sync/gallery.sync-assets/images/foo-hash-lower-8.webp'
  ]);
  assert.equal(result.metadata.artists[0].imageAsset.assetPath, 'sync/gallery.sync-assets/images/Foo-hash-upper-1.webp');
  assert.equal(result.metadata.artists[1].imageAsset.assetPath, 'sync/gallery.sync-assets/images/foo-hash-lower-8.webp');
});

test('buildSplitSyncUploadBundle keeps artist asset paths compact for very long tags', async () => {
  const imageBlob = new Blob(['artist-image'], { type: 'image/png' });
  const veryLongTag = 'masterpiece, best quality, tokai teio, cinematic lighting, god rays, long hair, brown hair, portrait, sunlight, smile, close-up, horse girl, umamusume, highres, detailed face, detailed eyes, depth of field, solo, white jacket, red cape, pink ascot, lens flare'.repeat(4);
  const { buildSplitSyncUploadBundle } = loadConstFunctions([
    'isEmbeddedLocalImageUrl',
    'buildSplitSyncTargetLayout',
    'buildSplitSyncArtistAssetBaseName',
    'buildSplitSyncMetadata',
    'computeSplitSyncMetadataHash',
    'buildSplitSyncUploadBundle'
  ], {
    EXPORT_VERSION: 5,
    normalizeArtistList(artists) {
      return Array.isArray(artists) ? artists.map((artist) => ({ ...artist })) : [];
    },
    normalizeArtistRecord(artist) {
      return { ...artist };
    },
    normalizeCategoryList(categories) {
      return Array.isArray(categories) ? [...categories] : [];
    },
    getImageBlobFromIDB: async () => imageBlob,
    dataUrlToBlob: async () => null,
    async sha256Hex(value) {
      if (value === imageBlob) return 'hash-image';
      return 'hash-metadata';
    }
  });

  const result = await buildSplitSyncUploadBundle({
    targetPath: 'sync/gallery.json',
    artists: [
      { id: 'artist-long', tag: veryLongTag, imageUrl: 'blob:https://gallery.local/long' }
    ],
    categories: [],
    settings: { displayConfig: {} },
    syncConfig: { syncMethod: 's3' }
  });

  const assetPath = String(result.assetEntries[0].assetPath || '');
  assert.ok(assetPath.startsWith('sync/gallery.sync-assets/images/'));
  assert.ok(assetPath.endsWith('-hash-image.png'));
  assert.ok(assetPath.length < 180);
});

test('buildSplitSyncUploadBundle extends hash suffix when compact slugs and hash prefixes collide', async () => {
  const blobA = new Blob(['artist-a'], { type: 'image/webp' });
  const blobB = new Blob(['artist-b'], { type: 'image/webp' });
  const { buildSplitSyncUploadBundle } = loadConstFunctions([
    'isEmbeddedLocalImageUrl',
    'buildSplitSyncTargetLayout',
    'buildSplitSyncArtistAssetBaseName',
    'buildSplitSyncMetadata',
    'computeSplitSyncMetadataHash',
    'buildSplitSyncUploadBundle'
  ], {
    EXPORT_VERSION: 5,
    normalizeArtistList(artists) {
      return Array.isArray(artists) ? artists.map((artist) => ({ ...artist })) : [];
    },
    normalizeArtistRecord(artist) {
      return { ...artist };
    },
    normalizeCategoryList(categories) {
      return Array.isArray(categories) ? [...categories] : [];
    },
    getImageBlobFromIDB: async (id) => (id === 'artist-a' ? blobA : blobB),
    dataUrlToBlob: async () => null,
    async sha256Hex(value) {
      if (value === blobA) return 'sameprefix1234aaaa';
      if (value === blobB) return 'sameprefix1234bbbb';
      return 'hash-metadata';
    }
  });

  const result = await buildSplitSyncUploadBundle({
    targetPath: 'sync/gallery.json',
    artists: [
      { id: 'artist-a', tag: '!!!same slug!!!', imageUrl: 'blob:https://gallery.local/a' },
      { id: 'artist-b', tag: 'same   slug', imageUrl: 'blob:https://gallery.local/b' }
    ],
    categories: [],
    settings: { displayConfig: {} },
    syncConfig: { syncMethod: 's3' }
  });

  const paths = JSON.parse(JSON.stringify(result.assetEntries.map((entry) => entry.assetPath)));
  assert.equal(new Set(paths).size, 2);
  assert.equal(paths[0], 'sync/gallery.sync-assets/images/same_slug-sameprefix12.webp');
  assert.equal(paths[1], 'sync/gallery.sync-assets/images/same_slug-sameprefix1234.webp');
  assert.equal(result.metadata.artists[0].imageAsset.assetPath, paths[0]);
  assert.equal(result.metadata.artists[1].imageAsset.assetPath, paths[1]);
});

test('hydrateSplitResolvedPayloadAssets fetches asset blobs without changing legacy fields', async () => {
  const imageBlob = new Blob(['artist-image'], { type: 'image/webp' });
  const backgroundBlob = new Blob(['background-image'], { type: 'image/png' });
  const { hydrateSplitResolvedPayloadAssets } = loadConstFunctions(['hydrateSplitResolvedPayloadAssets']);

  const result = await hydrateSplitResolvedPayloadAssets({
    artists: [
      {
        id: 'artist-1',
        tag: 'one',
        imageUrl: '',
        imageAsset: { assetPath: 'sync/gallery.sync-assets/images/artist-1.webp' }
      },
      {
        id: 'artist-2',
        tag: 'two',
        imageUrl: 'https://example.com/cover.jpg'
      }
    ],
    settingsPatch: {
      theme: 'light',
      backgroundImageAsset: { assetPath: 'sync/gallery.sync-assets/backgrounds/gallery-background.png' }
    }
  }, async (asset) => {
    if (asset.assetPath.includes('/images/')) return imageBlob;
    if (asset.assetPath.includes('/backgrounds/')) return backgroundBlob;
    return null;
  });

  assert.equal(result.artists[0].imageBlob, imageBlob);
  assert.equal(result.artists[1].imageUrl, 'https://example.com/cover.jpg');
  assert.equal(result.settingsPatch.backgroundImageBlob, backgroundBlob);
});

test('planIncrementalSyncUpload skips unchanged assets when remote split metadata already has same hashes', async () => {
  const { planIncrementalSyncUpload } = loadConstFunctions([
    'isSplitSyncMetadataPayload',
    'buildSplitAssetIndexFromMetadata',
    'planIncrementalSyncUpload'
  ]);

  const result = await planIncrementalSyncUpload({
    metadata: {
      app: 'ai-gallery',
      format: 'split-sync-assets',
      contentHash: 'meta-local',
      artists: [
        { imageAsset: { assetPath: 'sync/gallery.sync-assets/images/a1.webp', contentHash: 'same-hash' } },
        { imageAsset: { assetPath: 'sync/gallery.sync-assets/images/a2.webp', contentHash: 'new-hash' } }
      ],
      settings: {
        backgroundImageAsset: { assetPath: 'sync/gallery.sync-assets/backgrounds/bg.webp', contentHash: 'same-bg' }
      }
    },
    assetEntries: [
      { assetPath: 'sync/gallery.sync-assets/images/a1.webp', contentHash: 'same-hash' },
      { assetPath: 'sync/gallery.sync-assets/images/a2.webp', contentHash: 'new-hash' },
      { assetPath: 'sync/gallery.sync-assets/backgrounds/bg.webp', contentHash: 'same-bg' }
    ]
  }, {
    app: 'ai-gallery',
    format: 'split-sync-assets',
    contentHash: 'meta-remote',
    artists: [
      { imageAsset: { assetPath: 'sync/gallery.sync-assets/images/a1.webp', contentHash: 'same-hash' } }
    ],
    settings: {
      backgroundImageAsset: { assetPath: 'sync/gallery.sync-assets/backgrounds/bg.webp', contentHash: 'same-bg' }
    }
  });

  assert.equal(result.shouldUploadMetadata, true);
  assert.deepEqual(result.assetEntries.map((entry) => entry.assetPath), ['sync/gallery.sync-assets/images/a2.webp']);
});

test('buildCurrentSplitSyncUploadBundleForDraft records the effective draft sync config', async () => {
  let receivedArgs = null;
  const { buildCurrentSplitSyncUploadBundleForDraft } = loadConstFunctions(['buildSyncConfigSnapshotFromDraft', 'buildCurrentSplitSyncUploadBundleForDraft'], {
    state: {
      liveArtists: [{ id: 'artist-1', tag: 'one' }],
      categories: ['A'],
      syncMethod: 'webdav',
      webdavConfig: { endpoint: 'https://old.example.com', filePath: 'old/gallery.json' },
      s3Config: { endpoint: 'https://old-s3.example.com', bucket: 'old-bucket', objectKey: 'old/gallery.json' }
    },
    normalizeWebdavConfig(value) {
      return { ...(value || {}) };
    },
    normalizeS3Config(value) {
      return { ...(value || {}) };
    },
    buildSettingsSnapshot() {
      return { theme: 'light', displayConfig: {} };
    },
    buildSyncConfigSnapshot() {
      return {
        syncMethod: 'webdav',
        webdavConfig: { endpoint: 'https://old.example.com', filePath: 'old/gallery.json' },
        s3Config: { endpoint: 'https://old-s3.example.com', bucket: 'old-bucket', objectKey: 'old/gallery.json' }
      };
    },
    buildSplitSyncUploadBundle: async (args) => {
      receivedArgs = args;
      return { metadataPath: 'sync/gallery.sync-meta.json', metadata: {}, assetEntries: [] };
    }
  });

  await buildCurrentSplitSyncUploadBundleForDraft({
    syncMethod: 's3',
    webdavConfig: { endpoint: 'https://dav.example.com', filePath: 'dav/gallery.json' },
    s3Config: { endpoint: 'https://r2.example.com', region: 'auto', bucket: 'new-bucket', objectKey: 'new/gallery.json' }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(receivedArgs.syncConfig)), {
    syncMethod: 's3',
    webdavConfig: { endpoint: 'https://dav.example.com', filePath: 'dav/gallery.json' },
    s3Config: { endpoint: 'https://r2.example.com', region: 'auto', bucket: 'new-bucket', objectKey: 'new/gallery.json' }
  });
  assert.equal(receivedArgs.targetPath, 'new/gallery.json');
});

test('hydrateSplitResolvedPayloadAssets can preserve local assets when loader marks them unchanged', async () => {
  const { hydrateSplitResolvedPayloadAssets } = loadConstFunctions(['hydrateSplitResolvedPayloadAssets']);

  const result = await hydrateSplitResolvedPayloadAssets({
    artists: [
      {
        id: 'artist-1',
        imageAsset: { assetPath: 'sync/gallery.sync-assets/images/artist-1.webp', contentHash: 'same-hash' }
      }
    ],
    settingsPatch: {
      backgroundImageAsset: { assetPath: 'sync/gallery.sync-assets/backgrounds/bg.webp', contentHash: 'same-bg' }
    }
  }, async (asset) => {
    if (asset.assetPath.includes('/images/')) return { preserveLocal: true };
    return { preserveLocal: true };
  });

  assert.equal(result.artists[0].preserveLocalImageAsset, true);
  assert.equal(result.settingsPatch.preserveLocalBackgroundAsset, true);
});

test('fetchSplitAssetBlobForSyncDraft applies asset download size budgets for S3 and WebDAV', async () => {
  const calls = [];
  const blob = new Blob(['image'], { type: 'image/webp' });
  const { fetchSplitAssetBlobForSyncDraft } = loadConstFunctions(['fetchSplitAssetBlobForSyncDraft'], {
    getImportSizeSafetyBudget() {
      return { hardBytes: 1234 };
    },
    downloadBlobFromS3: async (_cfg, assetPath, _progress, options) => {
      calls.push(['s3', assetPath, options.maxDownloadBytes, options.responseLabel]);
      return { ok: true, responseBlob: blob };
    },
    downloadBlobFromWebdav: async (_cfg, assetPath, _progress, options) => {
      calls.push(['webdav', assetPath, options.maxDownloadBytes, options.responseLabel]);
      return { ok: true, responseBlob: blob };
    },
    buildStorageTextError(prefix, status) {
      return new Error(`${prefix}:${status}`);
    },
    readBlobAsText: async () => ''
  });

  const s3Blob = await fetchSplitAssetBlobForSyncDraft({ syncMethod: 's3', s3Config: {} }, { assetPath: 'sync/gallery.sync-assets/images/a1.webp' });
  const webdavBlob = await fetchSplitAssetBlobForSyncDraft({ syncMethod: 'webdav', webdavConfig: {} }, { assetPath: 'sync/gallery.sync-assets/images/a2.webp' });

  assert.equal(s3Blob, blob);
  assert.equal(webdavBlob, blob);
  assert.deepEqual(calls, [
    ['s3', 'sync/gallery.sync-assets/images/a1.webp', 1234, 'S3 同步资源'],
    ['webdav', 'sync/gallery.sync-assets/images/a2.webp', 1234, 'WebDAV 同步资源']
  ]);
});

test('manualSyncDownload hydrates split sync assets before overwrite merge', async () => {
  const events = [];
  const rawBlob = new Blob([JSON.stringify({ app: 'ai-gallery', format: 'split-sync-assets', version: 5, artists: [] })], {
    type: 'application/json'
  });

  const manualSyncDownload = loadWindowFunction('manualSyncDownload', {
    state: {
      isSyncModalOpen: false
    },
    getEffectiveSyncDraft() {
      return { syncMethod: 'webdav', webdavConfig: { filePath: 'sync/gallery.json' }, s3Config: {} };
    },
    isSyncDraftDirty() {
      return false;
    },
    beginSyncProgress(label) {
      events.push(['begin', label]);
    },
    updateSyncProgress(percent, label) {
      events.push(['progress', percent, label]);
    },
    finishSyncProgress(label) {
      events.push(['finish', label]);
    },
    failSyncProgress(label) {
      events.push(['fail', label]);
    },
    showToast(message) {
      events.push(['toast', message]);
    },
    normalizeErrorMessage(error) {
      return error.message;
    },
    isUserCancelledError() {
      return false;
    },
    webdavDownload: async () => rawBlob,
    ensureImportByteSizeSafe() {},
    readBlobAsText: async () => await rawBlob.text(),
    parseJsonOrThrow(text) {
      return JSON.parse(text);
    },
    ensureImportMetadataSafe() {},
    resolveImportPayload() {
      events.push(['resolve']);
      return { artists: [], settingsPatch: {} };
    },
    isSplitSyncMetadataPayload() {
      return true;
    },
    buildCurrentSplitSyncUploadBundleForDraft: async () => ({ metadata: { contentHash: 'local-other' } }),
    buildSplitAssetIndexFromMetadata() {
      return {};
    },
    hydrateSplitResolvedPayloadAssets: async (resolved, fetcher) => {
      events.push(['hydrate-start']);
      await fetcher({ assetPath: 'sync/gallery.sync-assets/images/a1.webp' });
      events.push(['hydrate-done']);
      return { ...resolved, hydrated: true };
    },
    fetchSplitAssetBlobForSyncDraft: async () => {
      events.push(['fetch-asset']);
      return new Blob(['image'], { type: 'image/webp' });
    },
    ensureImportPayloadSafe() {},
    overwriteImportResolvedPayload: async (resolved) => {
      events.push(['overwrite', resolved.hydrated === true]);
      return { addedCount: 0 };
    },
    buildMergeSummary() {
      return 'done';
    },
    console
  });

  await manualSyncDownload();

  const eventNames = events.map((entry) => entry[0]);
  assert.deepEqual(eventNames, ['begin', 'progress', 'resolve', 'progress', 'hydrate-start', 'fetch-asset', 'hydrate-done', 'progress', 'overwrite', 'toast', 'progress', 'finish']);
  assert.deepEqual(events.find((entry) => entry[0] === 'overwrite'), ['overwrite', true]);
});

test('manualSyncDownload still recovers from split metadata when local bundle cannot be built', async () => {
  const events = [];
  const rawBlob = new Blob([JSON.stringify({ app: 'ai-gallery', format: 'split-sync-assets', version: 5, artists: [] })], {
    type: 'application/json'
  });

  const manualSyncDownload = loadWindowFunction('manualSyncDownload', {
    state: { isSyncModalOpen: false },
    getEffectiveSyncDraft() {
      return { syncMethod: 'webdav', webdavConfig: { filePath: 'sync/gallery.json' }, s3Config: {} };
    },
    isSyncDraftDirty() {
      return false;
    },
    beginSyncProgress(label) {
      events.push(['begin', label]);
    },
    updateSyncProgress(percent, label) {
      events.push(['progress', percent, label]);
    },
    finishSyncProgress(label) {
      events.push(['finish', label]);
    },
    failSyncProgress(label) {
      events.push(['fail', label]);
    },
    showToast(message) {
      events.push(['toast', message]);
    },
    normalizeErrorMessage(error) {
      return error.message;
    },
    isUserCancelledError() {
      return false;
    },
    webdavDownload: async () => rawBlob,
    ensureImportByteSizeSafe() {},
    readBlobAsText: async () => await rawBlob.text(),
    parseJsonOrThrow(text) {
      return JSON.parse(text);
    },
    ensureImportMetadataSafe() {},
    resolveImportPayload() {
      events.push(['resolve']);
      return { artists: [], settingsPatch: {} };
    },
    isSplitSyncMetadataPayload() {
      return true;
    },
    buildCurrentSplitSyncUploadBundleForDraft: async () => {
      throw new Error('检测到 1 张本地图片资源缺失，无法从当前浏览器读取后再同步：one');
    },
    buildSplitAssetIndexFromMetadata() {
      return {};
    },
    hydrateSplitResolvedPayloadAssets: async (resolved, fetcher) => {
      events.push(['hydrate-start']);
      await fetcher({ assetPath: 'sync/gallery.sync-assets/images/a1.webp', contentHash: 'remote-hash' });
      events.push(['hydrate-done']);
      return { ...resolved, hydrated: true };
    },
    fetchSplitAssetBlobForSyncDraft: async () => {
      events.push(['fetch-asset']);
      return new Blob(['image'], { type: 'image/webp' });
    },
    ensureImportPayloadSafe() {},
    overwriteImportResolvedPayload: async (resolved) => {
      events.push(['overwrite', resolved.hydrated === true]);
      return { addedCount: 0 };
    },
    buildMergeSummary() {
      return 'done';
    },
    console
  });

  await manualSyncDownload();

  const eventNames = events.map((entry) => entry[0]);
  assert.deepEqual(eventNames, ['begin', 'progress', 'resolve', 'progress', 'hydrate-start', 'fetch-asset', 'hydrate-done', 'progress', 'overwrite', 'toast', 'progress', 'finish']);
  assert.deepEqual(events.find((entry) => entry[0] === 'overwrite'), ['overwrite', true]);
});

test('webdavUpload uploads changed asset entries before metadata during incremental sync', async () => {
  const uploads = [];
  const { webdavUpload } = loadConstFunctions(['webdavUpload'], {
    state: { webdavConfig: {} },
    Blob,
    normalizeWebdavConfig(value) {
      return value;
    },
    resolveWebdavTargetUrl() {
      return 'https://example.com/sync/gallery.json';
    },
    buildCurrentSplitSyncUploadBundleForDraft: async () => ({
      metadataPath: 'sync/gallery.sync-meta.json',
      metadata: { contentHash: 'meta-local' },
      assetEntries: [
        { assetPath: 'sync/gallery.sync-assets/images/a1.webp', blob: new Blob(['a1']), mimeType: 'image/webp', contentHash: 'same-hash' },
        { assetPath: 'sync/gallery.sync-assets/images/a2.webp', blob: new Blob(['a2']), mimeType: 'image/webp', contentHash: 'new-hash' }
      ]
    }),
    tryLoadRemoteSplitMetadataForWebdav: async () => ({ app: 'ai-gallery', format: 'split-sync-assets', contentHash: 'meta-remote' }),
    planIncrementalSyncUpload: async () => ({
      shouldUploadMetadata: true,
      assetEntries: [
        { assetPath: 'sync/gallery.sync-assets/images/a2.webp', blob: new Blob(['a2']), mimeType: 'image/webp', contentHash: 'new-hash' }
      ]
    }),
    uploadBlobToWebdav: async (_cfg, path) => {
      uploads.push(path);
    }
  });

  await webdavUpload({ endpoint: 'https://example.com', filePath: 'sync/gallery.json' });

  assert.deepEqual(uploads, [
    'sync/gallery.sync-assets/images/a2.webp',
    'sync/gallery.sync-meta.json'
  ]);
});

test('s3Upload uploads changed asset entries before metadata during incremental sync', async () => {
  const uploads = [];
  const { s3Upload } = loadConstFunctions(['s3Upload'], {
    state: { s3Config: {} },
    Blob,
    normalizeS3Config(value) {
      return value;
    },
    buildS3RequestInfo() {
      return { ok: true };
    },
    buildCurrentSplitSyncUploadBundleForDraft: async () => ({
      metadataPath: 'sync/gallery.sync-meta.json',
      metadata: { contentHash: 'meta-local' },
      assetEntries: [
        { assetPath: 'sync/gallery.sync-assets/images/a1.webp', blob: new Blob(['a1']), mimeType: 'image/webp', contentHash: 'same-hash' },
        { assetPath: 'sync/gallery.sync-assets/images/a2.webp', blob: new Blob(['a2']), mimeType: 'image/webp', contentHash: 'new-hash' }
      ]
    }),
    tryLoadRemoteSplitMetadataForS3: async () => ({ app: 'ai-gallery', format: 'split-sync-assets', contentHash: 'meta-remote' }),
    planIncrementalSyncUpload: async () => ({
      shouldUploadMetadata: true,
      assetEntries: [
        { assetPath: 'sync/gallery.sync-assets/images/a2.webp', blob: new Blob(['a2']), mimeType: 'image/webp', contentHash: 'new-hash' }
      ]
    }),
    uploadBlobToS3: async (_cfg, path) => {
      uploads.push(path);
    }
  });

  await s3Upload({ endpoint: 'https://example.com', bucket: 'bucket', objectKey: 'sync/gallery.json' });

  assert.deepEqual(uploads, [
    'sync/gallery.sync-assets/images/a2.webp',
    'sync/gallery.sync-meta.json'
  ]);
});

test('webdavDownload falls back to the legacy JSON path when split metadata is missing', async () => {
  const calls = [];
  const legacyBlob = new Blob(['{"legacy":true}'], { type: 'application/json' });
  const { webdavDownload } = loadConstFunctions(['webdavDownload'], {
    state: { webdavConfig: {} },
    normalizeWebdavConfig(value) {
      return value;
    },
    resolveWebdavTargetUrl() {
      return 'https://dav.example.com/sync/gallery.json';
    },
    buildSplitSyncTargetLayout() {
      return { metadataPath: 'sync/gallery.sync-meta.json', assetPrefix: 'sync/gallery.sync-assets/' };
    },
    getImportSizeSafetyBudget() {
      return { hardBytes: 4321 };
    },
    downloadBlobFromWebdav: async (_cfg, path, _progress, options) => {
      calls.push([path, options.maxDownloadBytes, options.responseLabel]);
      if (calls.length === 1) {
        return {
          ok: false,
          status: 404,
          responseBlob: new Blob(['Not Found'], { type: 'text/plain' })
        };
      }
      return { ok: true, status: 200, responseBlob: legacyBlob };
    },
    buildStorageTextError(prefix, status, text) {
      return new Error(`${prefix}:${status}:${text}`);
    },
    readBlobAsText: async (blob) => (blob ? await blob.text() : '')
  });

  const result = await webdavDownload({ endpoint: 'https://dav.example.com', filePath: 'sync/gallery.json' });

  assert.equal(result, legacyBlob);
  assert.deepEqual(calls, [
    ['sync/gallery.sync-meta.json', 4321, 'WebDAV 同步元数据'],
    ['sync/gallery.json', 4321, 'WebDAV 备份']
  ]);
});

test('s3Download falls back to the legacy object key when split metadata is missing', async () => {
  const calls = [];
  const legacyBlob = new Blob(['{"legacy":true}'], { type: 'application/json' });
  const { s3Download } = loadConstFunctions(['s3Download'], {
    state: { s3Config: {} },
    normalizeS3Config(value) {
      return value;
    },
    buildS3RequestInfo() {
      return { ok: true };
    },
    buildSplitSyncTargetLayout() {
      return { metadataPath: 'sync/gallery.sync-meta.json', assetPrefix: 'sync/gallery.sync-assets/' };
    },
    getImportSizeSafetyBudget() {
      return { hardBytes: 5678 };
    },
    downloadBlobFromS3: async (_cfg, path, _progress, options) => {
      calls.push([path, options.maxDownloadBytes, options.responseLabel]);
      if (calls.length === 1) {
        return {
          ok: false,
          status: 403,
          responseBlob: new Blob(['<Error><Code>NoSuchKey</Code></Error>'], { type: 'application/xml' })
        };
      }
      return { ok: true, status: 200, responseBlob: legacyBlob };
    },
    buildStorageTextError(prefix, status, text) {
      return new Error(`${prefix}:${status}:${text}`);
    },
    readBlobAsText: async (blob) => (blob ? await blob.text() : '')
  });

  const result = await s3Download({ endpoint: 'https://r2.example.com', bucket: 'gallery', objectKey: 'sync/gallery.json' });

  assert.equal(result, legacyBlob);
  assert.deepEqual(calls, [
    ['sync/gallery.sync-meta.json', 5678, 'S3 同步元数据'],
    ['sync/gallery.json', 5678, 'S3 备份']
  ]);
});

test('s3Download reports both split and legacy keys when no remote backup exists', async () => {
  const calls = [];
  const { s3Download } = loadConstFunctions(['s3Download'], {
    state: { s3Config: {} },
    normalizeS3Config(value) {
      return value;
    },
    buildS3RequestInfo() {
      return { ok: true };
    },
    buildSplitSyncTargetLayout() {
      return { metadataPath: 'sync/gallery.sync-meta.json', assetPrefix: 'sync/gallery.sync-assets/' };
    },
    getImportSizeSafetyBudget() {
      return { hardBytes: 5678 };
    },
    downloadBlobFromS3: async (_cfg, path, _progress, options) => {
      calls.push([path, options.maxDownloadBytes, options.responseLabel]);
      if (calls.length === 1) {
        return {
          ok: false,
          status: 404,
          responseBlob: new Blob(['<Error><Code>NoSuchKey</Code><RequestId>meta-1</RequestId></Error>'], { type: 'application/xml' })
        };
      }
      return {
        ok: false,
        status: 404,
        responseBlob: new Blob(['<Error><Code>NoSuchKey</Code><RequestId>legacy-2</RequestId></Error>'], { type: 'application/xml' })
      };
    },
    buildStorageTextError(prefix, status, text) {
      return new Error(`${prefix}:${status}:${text}`);
    },
    readBlobAsText: async (blob) => (blob ? await blob.text() : '')
  });

  await assert.rejects(
    s3Download({ endpoint: 'https://r2.example.com', bucket: 'gallery', objectKey: 'sync/gallery.json' }),
    /sync\/gallery\.sync-meta\.json[\s\S]*sync\/gallery\.json|sync\/gallery\.json[\s\S]*sync\/gallery\.sync-meta\.json/i
  );
  assert.deepEqual(calls, [
    ['sync/gallery.sync-meta.json', 5678, 'S3 同步元数据'],
    ['sync/gallery.json', 5678, 'S3 备份']
  ]);
});

test('manualSyncDownload exits early when remote split metadata hash matches local bundle', async () => {
  const events = [];
  const rawBlob = new Blob([JSON.stringify({ app: 'ai-gallery', format: 'split-sync-assets', version: 5, contentHash: 'same-meta', artists: [] })], {
    type: 'application/json'
  });

  const manualSyncDownload = loadWindowFunction('manualSyncDownload', {
    state: { isSyncModalOpen: false },
    getEffectiveSyncDraft() {
      return { syncMethod: 'webdav', webdavConfig: { filePath: 'sync/gallery.json' }, s3Config: {} };
    },
    isSyncDraftDirty() {
      return false;
    },
    beginSyncProgress(label) {
      events.push(['begin', label]);
    },
    updateSyncProgress(percent, label) {
      events.push(['progress', percent, label]);
    },
    finishSyncProgress(label) {
      events.push(['finish', label]);
    },
    failSyncProgress(label) {
      events.push(['fail', label]);
    },
    showToast(message) {
      events.push(['toast', message]);
    },
    normalizeErrorMessage(error) {
      return error.message;
    },
    isUserCancelledError() {
      return false;
    },
    webdavDownload: async () => rawBlob,
    ensureImportByteSizeSafe() {},
    readBlobAsText: async () => await rawBlob.text(),
    parseJsonOrThrow(text) {
      return JSON.parse(text);
    },
    ensureImportMetadataSafe() {},
    resolveImportPayload() {
      events.push(['resolve']);
      return { artists: [], settingsPatch: {} };
    },
    isSplitSyncMetadataPayload() {
      return true;
    },
    buildCurrentSplitSyncUploadBundleForDraft: async () => ({ metadata: { contentHash: 'same-meta' } }),
    hydrateSplitResolvedPayloadAssets: async () => {
      throw new Error('should not hydrate when metadata hash is unchanged');
    },
    ensureImportPayloadSafe() {},
    overwriteImportResolvedPayload: async () => {
      throw new Error('should not overwrite when metadata hash is unchanged');
    },
    buildMergeSummary() {
      return 'unused';
    },
    console
  });

  await manualSyncDownload();

  assert.deepEqual(events.map((entry) => entry[0]), ['begin', 'progress', 'resolve', 'progress', 'toast', 'finish']);
  assert.deepEqual(events.find((entry) => entry[0] === 'toast'), ['toast', '从 WebDAV 拉取：远端已是最新']);
});
