import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const htmlPath = new URL('../artist manager.html', import.meta.url);
const html = fs.readFileSync(htmlPath, 'utf8');

function extractWindowFunction(name) {
  const pattern = new RegExp(`window\\.${name}\\s*=\\s*(?:async\\s*)?\\(\\)\\s*=>\\s*\\{[\\s\\S]*?\\n\\s*\\};`);
  const match = html.match(pattern);
  assert.ok(match, `Expected to find window.${name} in artist manager.html`);
  return match[0];
}

function loadWindowFunction(name, overrides = {}) {
  const context = {
    window: {},
    state: {},
    showToast: () => {},
    document: {
      createElement: () => ({ click() {} }),
      body: {
        appendChild() {},
        removeChild() {}
      }
    },
    URL: {
      createObjectURL: () => 'blob:test',
      revokeObjectURL() {}
    },
    Blob,
    ...overrides
  };

  vm.createContext(context);
  vm.runInContext(extractWindowFunction(name), context);
  return context.window[name];
}

test('ComfyUI workflow viewer renders a download JSON button next to copy JSON', () => {
  assert.match(html, /onclick="copyComfyWorkflowJson\(\)"/);
  assert.match(html, /onclick="downloadComfyWorkflowJson\(\)"/);
  assert.match(html, /下载 JSON/);
});

test('downloadComfyWorkflowJson downloads the current workflow JSON', async () => {
  const workflowData = { id: 12, prompt: { text: 'hello world' } };
  const toasts = [];
  const events = [];
  let blobInstance;
  let revokedUrl;

  class BlobStub {
    constructor(parts, options) {
      this.parts = parts;
      this.options = options;
    }
  }

  const anchor = {
    href: '',
    download: '',
    clickCalled: false,
    click() {
      this.clickCalled = true;
      events.push('click');
    }
  };

  const downloadComfyWorkflowJson = loadWindowFunction('downloadComfyWorkflowJson', {
    state: { comfyWorkflowData: workflowData },
    showToast(message, options) {
      toasts.push({ message, options });
    },
    document: {
      createElement(tagName) {
        assert.equal(tagName, 'a');
        return anchor;
      },
      body: {
        appendChild(node) {
          events.push(`append:${node === anchor}`);
        },
        removeChild(node) {
          events.push(`remove:${node === anchor}`);
        }
      }
    },
    URL: {
      createObjectURL(blob) {
        blobInstance = blob;
        return 'blob:workflow';
      },
      revokeObjectURL(url) {
        revokedUrl = url;
      }
    },
    Blob: BlobStub
  });

  await downloadComfyWorkflowJson();

  assert.ok(blobInstance, 'Expected a Blob to be created');
  assert.equal(blobInstance.parts.length, 1);
  assert.equal(blobInstance.parts[0], JSON.stringify(workflowData, null, 2));
  assert.equal(blobInstance.options.type, 'application/json;charset=utf-8');
  assert.equal(anchor.href, 'blob:workflow');
  assert.equal(anchor.download, 'comfyui-workflow.json');
  assert.deepEqual(events, ['append:true', 'click', 'remove:true']);
  assert.equal(revokedUrl, 'blob:workflow');
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].message, '工作流 JSON 已下载');
  assert.equal(toasts[0].options.scope, 'overlay');
});

test('downloadComfyWorkflowJson warns when no workflow is available', async () => {
  const toasts = [];
  let createObjectUrlCalled = false;

  const downloadComfyWorkflowJson = loadWindowFunction('downloadComfyWorkflowJson', {
    state: { comfyWorkflowData: null },
    showToast(message, options) {
      toasts.push({ message, options });
    },
    URL: {
      createObjectURL() {
        createObjectUrlCalled = true;
        return 'blob:unexpected';
      },
      revokeObjectURL() {}
    }
  });

  await downloadComfyWorkflowJson();

  assert.equal(createObjectUrlCalled, false);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].message, '当前没有可下载的工作流');
  assert.equal(toasts[0].options.scope, 'overlay');
});
