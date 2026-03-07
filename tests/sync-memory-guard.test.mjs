import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const htmlPath = new URL('../artist manager.html', import.meta.url);
const html = fs.readFileSync(htmlPath, 'utf8');

function extractConstFunction(name) {
  const startToken = `const ${name} =`;
  const startIndex = html.indexOf(startToken);
  assert.notEqual(startIndex, -1, `Expected to find const ${name} in artist manager.html`);

  const braceStart = html.indexOf('{', startIndex);
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
  assert.notEqual(startIndex, -1, `Expected to find window.${name} in artist manager.html`);

  const braceStart = html.indexOf('{', startIndex);
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
    Blob,
    Error,
    navigator: {},
    confirm: () => true,
    URL: {
      createObjectURL: () => 'blob:test'
    },
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
  return vm.runInContext(`(() => { ${source}\n return ${returnExpression}; })()`, context);
}

test('ensureImportByteSizeSafe rejects oversized sync payloads on iOS WebKit earlier than desktop browsers', () => {
  const { ensureImportByteSizeSafe } = loadConstFunctions([
    'isMemoryConstrainedAppleMobileBrowser',
    'getImportSizeSafetyBudget',
    'ensureImportByteSizeSafe'
  ], {
    IMPORT_WARN_SIZE_BYTES: 180 * 1024 * 1024,
    IMPORT_HARD_SIZE_BYTES: 1024 * 1024 * 1024,
    IOS_WEBKIT_IMPORT_WARN_SIZE_BYTES: 32 * 1024 * 1024,
    IOS_WEBKIT_IMPORT_HARD_SIZE_BYTES: 64 * 1024 * 1024,
    navigator: {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5
    }
  });

  assert.throws(
    () => ensureImportByteSizeSafe(70 * 1024 * 1024, 'S3 备份'),
    /iOS|苹果|拆分/
  );
});

test('ensureImportByteSizeSafe keeps desktop browsers on the normal threshold', () => {
  const { ensureImportByteSizeSafe } = loadConstFunctions([
    'isMemoryConstrainedAppleMobileBrowser',
    'getImportSizeSafetyBudget',
    'ensureImportByteSizeSafe'
  ], {
    IMPORT_WARN_SIZE_BYTES: 180 * 1024 * 1024,
    IMPORT_HARD_SIZE_BYTES: 1024 * 1024 * 1024,
    IOS_WEBKIT_IMPORT_WARN_SIZE_BYTES: 32 * 1024 * 1024,
    IOS_WEBKIT_IMPORT_HARD_SIZE_BYTES: 64 * 1024 * 1024,
    navigator: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      platform: 'Win32',
      maxTouchPoints: 0
    }
  });

  assert.doesNotThrow(() => ensureImportByteSizeSafe(70 * 1024 * 1024, '桌面备份'));
});

test('persistEmbeddedImageForState stores embedded images and switches runtime state to a blob URL', async () => {
  const calls = [];
  const blob = new Blob(['image-bytes'], { type: 'image/png' });
  const { persistEmbeddedImageForState } = loadConstFunctions(['persistEmbeddedImageForState'], {
    async dataUrlToBlob(dataUrl) {
      calls.push(['dataUrlToBlob', dataUrl]);
      return blob;
    },
    async saveImageToIDB(id, value) {
      calls.push(['saveImageToIDB', id, value]);
    },
    registerObjectUrl(url) {
      calls.push(['registerObjectUrl', url]);
      return `registered:${url}`;
    },
    URL: {
      createObjectURL(value) {
        calls.push(['createObjectURL', value]);
        return 'blob:gallery-image';
      }
    }
  });

  const result = await persistEmbeddedImageForState('artist-1', 'data:image/png;base64,abc');

  assert.equal(result, 'registered:blob:gallery-image');
  assert.deepEqual(calls, [
    ['dataUrlToBlob', 'data:image/png;base64,abc'],
    ['saveImageToIDB', 'artist-1', blob],
    ['createObjectURL', blob],
    ['registerObjectUrl', 'blob:gallery-image']
  ]);
});

test('persistEmbeddedImageForState leaves remote image URLs untouched', async () => {
  const { persistEmbeddedImageForState } = loadConstFunctions(['persistEmbeddedImageForState'], {
    async dataUrlToBlob() {
      throw new Error('should not convert external URLs');
    },
    async saveImageToIDB() {
      throw new Error('should not persist external URLs');
    }
  });

  const result = await persistEmbeddedImageForState('artist-2', 'https://example.com/image.jpg');
  assert.equal(result, 'https://example.com/image.jpg');
});

test('handleImport validates file size before starting FileReader work', () => {
  const calls = [];
  class FileReaderStub {
    readAsText() {
      calls.push('readAsText');
    }
  }

  const handleImport = loadWindowFunction('handleImport', {
    FileReader: FileReaderStub,
    ensureImportFileSizeSafe() {
      calls.push('ensureImportFileSizeSafe');
      throw new Error('too large');
    },
    toastFailure(label, error) {
      calls.push(['toastFailure', label, error.message]);
    }
  });

  const event = {
    target: {
      files: [{ size: 999 }],
      value: 'occupied'
    }
  };

  handleImport(event);

  assert.deepEqual(calls, [
    'ensureImportFileSizeSafe',
    ['toastFailure', '导入失败', 'too large']
  ]);
  assert.equal(event.target.value, '');
});

test('executeXhrRequest aborts oversized downloads after reading Content-Length', async () => {
  let xhrInstance;
  class XMLHttpRequestStub {
    constructor() {
      xhrInstance = this;
      this.readyState = 0;
      this.responseType = '';
      this.status = 200;
      this.response = new Blob(['ignored']);
      this.aborted = false;
    }

    open(method, url, asyncFlag) {
      this.openArgs = [method, url, asyncFlag];
    }

    setRequestHeader() {}

    getResponseHeader(name) {
      return /content-length/i.test(name) ? String(80 * 1024 * 1024) : '';
    }

    abort() {
      this.aborted = true;
      if (typeof this.onabort === 'function') this.onabort();
    }

    send() {
      this.readyState = 2;
      if (typeof this.onreadystatechange === 'function') this.onreadystatechange();
    }
  }

  const startToken = 'const executeXhrRequest =';
  const endToken = 'const shouldRetryR2WithUsEast1 =';
  const startIndex = html.indexOf(startToken);
  const endIndex = html.indexOf(endToken, startIndex);
  assert.notEqual(startIndex, -1, 'Expected executeXhrRequest source');
  assert.notEqual(endIndex, -1, 'Expected shouldRetryR2WithUsEast1 marker');

  const executeXhrRequest = loadSnippet(html.slice(startIndex, endIndex), 'executeXhrRequest', {
    XMLHttpRequest: XMLHttpRequestStub,
    XHR_TIMEOUT_MS: 180000,
    rejectOversizedDownload(sourceLabel, bytes) {
      throw new Error(`${sourceLabel}:${bytes}`);
    }
  });

  await assert.rejects(
    () => executeXhrRequest({
      method: 'GET',
      url: 'https://example.com/backup.json',
      responseType: 'blob',
      maxDownloadBytes: 64 * 1024 * 1024,
      responseLabel: 'S3 备份'
    }),
    /S3 备份:83886080/
  );

  assert.equal(xhrInstance.aborted, true);
});
