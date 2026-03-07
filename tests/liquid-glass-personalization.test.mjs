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

  const arrowIndex = html.indexOf('=>', startIndex);
  assert.notEqual(arrowIndex, -1, `Expected const ${name} to be an arrow function`);
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
    JSON,
    ...extraContext
  };

  vm.createContext(context);
  return vm.runInContext(`(() => { ${source}\n return { ${names.join(', ')} }; })()`, context);
}

function loadWindowFunction(name, extraContext = {}) {
  const context = {
    window: {},
    ...extraContext
  };
  vm.createContext(context);
  vm.runInContext(extractWindowFunction(name), context);
  return context.window[name];
}

function extractCssBlock(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `Expected to find CSS block for ${selector}`);
  return match[1];
}

function createBodyStub() {
  const classes = new Set();
  const styleValues = new Map();
  return {
    classList: {
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      }
    },
    style: {
      setProperty(name, value) {
        styleValues.set(name, value);
      },
      removeProperty(name) {
        styleValues.delete(name);
      },
      getPropertyValue(name) {
        return styleValues.get(name) || '';
      }
    }
  };
}

test('normalizeDisplayConfig defaults and normalizes Liquid Glass appearance mode', () => {
  const { getDefaultDisplayConfig, normalizeDisplayConfig } = loadConstFunctions([
    'getDefaultDisplayConfig',
    'normalizeDisplayConfig'
  ]);

  const defaults = getDefaultDisplayConfig();
  assert.equal(defaults.liquidGlassAppearance, 'transparent');
  assert.equal(normalizeDisplayConfig({}).liquidGlassAppearance, 'transparent');
  assert.equal(normalizeDisplayConfig({ liquidGlassAppearance: 'contrast' }).liquidGlassAppearance, 'contrast');
  assert.equal(normalizeDisplayConfig({ liquidGlassAppearance: 'unknown' }).liquidGlassAppearance, 'transparent');
});

test('applyDisplayPersonalization toggles Liquid Glass appearance state for contrast mode', () => {
  const body = createBodyStub();
  const backgroundCalls = [];
  const displacementMap = {
    attrs: {},
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    getAttribute(name) {
      return this.attrs[name];
    }
  };
  const { getDefaultDisplayConfig, applyDisplayPersonalization } = loadConstFunctions([
    'getDefaultDisplayConfig',
    'normalizeDisplayConfig',
    'applyDisplayPersonalization'
  ], {
    state: { displayConfig: null },
    document: {
      body,
      getElementById(id) {
        return id === 'liquid-glass-displacement-map' ? displacementMap : null;
      }
    },
    applyBackgroundImage(image) {
      backgroundCalls.push(image);
    }
  });

  applyDisplayPersonalization({
    ...getDefaultDisplayConfig(),
    styleMode: 'liquid-glass',
    liquidGlassAppearance: 'contrast',
    backgroundImage: 'bg-data'
  });

  assert.equal(body.classList.contains('liquid-glass'), true);
  assert.equal(body.classList.contains('style-default'), false);
  assert.equal(body.classList.contains('liquid-glass-contrast'), true);
  assert.equal(body.style.getPropertyValue('--liquid-blur'), '14px');
  assert.equal(body.style.getPropertyValue('--liquid-surface-alpha'), '0.62');
  assert.equal(body.style.getPropertyValue('--liquid-panel-alpha'), '0.56');
  assert.equal(body.style.getPropertyValue('--liquid-button-alpha'), '0.64');
  assert.equal(body.style.getPropertyValue('--liquid-backdrop-saturation'), '1.15');
  assert.equal(body.style.getPropertyValue('--liquid-control-saturation'), '1.08');
  assert.equal(body.style.getPropertyValue('--liquid-overlay-alpha'), '0.68');
  assert.equal(body.style.getPropertyValue('--liquid-atmosphere-primary'), 'rgba(14, 165, 233, 0.14)');
  assert.equal(body.style.getPropertyValue('--liquid-atmosphere-veil'), 'rgba(15, 23, 42, 0.18)');
  assert.equal(body.style.getPropertyValue('--liquid-refraction-scale'), '28');
  assert.equal(displacementMap.getAttribute('scale'), '28');
  assert.equal(backgroundCalls[0], 'bg-data');

  applyDisplayPersonalization({
    ...getDefaultDisplayConfig(),
    styleMode: 'liquid-glass',
    liquidGlassAppearance: 'transparent'
  });

  assert.equal(body.classList.contains('liquid-glass-contrast'), false);
  assert.equal(body.style.getPropertyValue('--liquid-blur'), '20px');
  assert.equal(body.style.getPropertyValue('--liquid-surface-alpha'), '0.18');
  assert.equal(body.style.getPropertyValue('--liquid-panel-alpha'), '0.16');
  assert.equal(body.style.getPropertyValue('--liquid-button-alpha'), '0.22');
  assert.equal(body.style.getPropertyValue('--liquid-backdrop-saturation'), '2.2');
  assert.equal(body.style.getPropertyValue('--liquid-control-saturation'), '1.88');
  assert.equal(body.style.getPropertyValue('--liquid-overlay-alpha'), '0.34');
  assert.equal(body.style.getPropertyValue('--liquid-border-light'), 'rgba(255, 255, 255, 0.28)');
  assert.equal(body.style.getPropertyValue('--liquid-tint-light'), 'rgba(255, 255, 255, 0.02)');
  assert.equal(body.style.getPropertyValue('--liquid-atmosphere-primary'), 'rgba(56, 189, 248, 0.4)');
  assert.equal(body.style.getPropertyValue('--liquid-atmosphere-secondary'), 'rgba(129, 140, 248, 0.32)');
  assert.equal(body.style.getPropertyValue('--liquid-atmosphere-accent'), 'rgba(244, 114, 182, 0.2)');
  assert.equal(body.style.getPropertyValue('--liquid-atmosphere-veil'), 'rgba(255, 255, 255, 0.08)');
  assert.equal(body.style.getPropertyValue('--liquid-refraction-scale'), '52');
  assert.equal(displacementMap.getAttribute('scale'), '52');
});

test('setLiquidGlassAppearancePreview updates hidden input and segmented buttons without persisting state', () => {
  const input = { value: 'transparent' };
  const createButton = () => {
    const classes = new Set();
    const attrs = {};
    return {
      classList: {
        add(name) {
          classes.add(name);
        },
        remove(name) {
          classes.delete(name);
        },
        toggle(name, force) {
          if (force === undefined) {
            if (classes.has(name)) {
              classes.delete(name);
              return false;
            }
            classes.add(name);
            return true;
          }
          if (force) classes.add(name);
          else classes.delete(name);
          return classes.has(name);
        },
        contains(name) {
          return classes.has(name);
        }
      },
      setAttribute(name, value) {
        attrs[name] = value;
      },
      getAttribute(name) {
        return attrs[name];
      }
    };
  };
  const transparentButton = createButton();
  const contrastButton = createButton();

  const setLiquidGlassAppearancePreview = loadWindowFunction('setLiquidGlassAppearancePreview', {
    document: {
      getElementById(id) {
        if (id === 'liquid-glass-appearance-select') return input;
        if (id === 'liquid-glass-appearance-transparent-btn') return transparentButton;
        if (id === 'liquid-glass-appearance-contrast-btn') return contrastButton;
        return null;
      }
    }
  });

  setLiquidGlassAppearancePreview('contrast');

  assert.equal(input.value, 'contrast');
  assert.equal(transparentButton.getAttribute('aria-pressed'), 'false');
  assert.equal(contrastButton.getAttribute('aria-pressed'), 'true');
  assert.equal(transparentButton.classList.contains('is-active'), false);
  assert.equal(contrastButton.classList.contains('is-active'), true);
});

test('saveAISettings persists the Liquid Glass appearance preference', () => {
  const updateCalls = [];
  const storageCalls = [];
  const showToastCalls = [];
  const state = {
    aiConfig: { titleApiHost: 'https://api.openai.com/v1', titleApiKey: '', titleModel: 'gpt-4o', workflowApiHost: 'https://api.openai.com/v1', workflowApiKey: '', workflowModel: 'gpt-4o' },
    displayConfig: { styleMode: 'liquid-glass', liquidGlassAppearance: 'transparent' }
  };
  const elements = {
    'ai-title-host-input': { value: 'https://api.openai.com/v1' },
    'ai-title-key-input': { value: '' },
    'ai-workflow-host-input': { value: 'https://api.openai.com/v1' },
    'ai-workflow-key-input': { value: '' },
    'ai-title-model-input': { value: 'gpt-4o' },
    'ai-workflow-model-input': { value: 'gpt-4o' },
    'show-card-info-toggle': { checked: false },
    'blur-nsfw-toggle': { checked: true },
    'layout-preset-select': { value: 'balanced' },
    'layout-custom-cols': { value: '4' },
    'layout-custom-gap': { value: '24' },
    'layout-custom-aspect': { value: '3/4' },
    'style-mode-select': { value: 'liquid-glass' },
    'liquid-glass-appearance-select': { value: 'contrast' }
  };

  const saveAISettings = loadWindowFunction('saveAISettings', {
    document: {
      getElementById(id) {
        return elements[id];
      }
    },
    normalizeAiConfig(input) {
      return input;
    },
    normalizeDisplayConfig(input) {
      return input;
    },
    updateState(nextState) {
      updateCalls.push(nextState);
    },
    localStorage: {
      setItem(key, value) {
        storageCalls.push([key, value]);
      }
    },
    state,
    AI_CONFIG_KEY: 'nai-ai-config',
    DISPLAY_CONFIG_KEY: 'nai-display-config',
    showToast(message) {
      showToastCalls.push(message);
    }
  });

  saveAISettings();

  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].displayConfig.liquidGlassAppearance, 'contrast');
  const displayStorageWrite = storageCalls.find(([key]) => key === 'nai-display-config');
  assert.ok(displayStorageWrite, 'Expected display config to be persisted');
  assert.match(displayStorageWrite[1], /"liquidGlassAppearance":"contrast"/);
  assert.deepEqual(showToastCalls, ['设置已保存']);
});

test('saveAISettings preserves the previous Liquid Glass appearance when the style is not Liquid Glass', () => {
  const updateCalls = [];
  const storageCalls = [];
  const state = {
    aiConfig: { titleApiHost: 'https://api.openai.com/v1', titleApiKey: '', titleModel: 'gpt-4o', workflowApiHost: 'https://api.openai.com/v1', workflowApiKey: '', workflowModel: 'gpt-4o' },
    displayConfig: { styleMode: 'default', liquidGlassAppearance: 'contrast' }
  };
  const elements = {
    'ai-title-host-input': { value: 'https://api.openai.com/v1' },
    'ai-title-key-input': { value: '' },
    'ai-workflow-host-input': { value: 'https://api.openai.com/v1' },
    'ai-workflow-key-input': { value: '' },
    'ai-title-model-input': { value: 'gpt-4o' },
    'ai-workflow-model-input': { value: 'gpt-4o' },
    'show-card-info-toggle': { checked: false },
    'blur-nsfw-toggle': { checked: true },
    'layout-preset-select': { value: 'balanced' },
    'layout-custom-cols': { value: '4' },
    'layout-custom-gap': { value: '24' },
    'layout-custom-aspect': { value: '3/4' },
    'style-mode-select': { value: 'default' },
    'liquid-glass-appearance-select': { value: 'contrast' }
  };

  const saveAISettings = loadWindowFunction('saveAISettings', {
    document: {
      getElementById(id) {
        return elements[id];
      }
    },
    normalizeAiConfig(input) {
      return input;
    },
    normalizeDisplayConfig(input) {
      return input;
    },
    updateState(nextState) {
      updateCalls.push(nextState);
    },
    localStorage: {
      setItem(key, value) {
        storageCalls.push([key, value]);
      }
    },
    state,
    AI_CONFIG_KEY: 'nai-ai-config',
    DISPLAY_CONFIG_KEY: 'nai-display-config',
    showToast() {}
  });

  saveAISettings();

  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].displayConfig.styleMode, 'default');
  assert.equal(updateCalls[0].displayConfig.liquidGlassAppearance, 'contrast');
  const displayStorageWrite = storageCalls.find(([key]) => key === 'nai-display-config');
  assert.ok(displayStorageWrite, 'Expected display config to be persisted');
  assert.match(displayStorageWrite[1], /"liquidGlassAppearance":"contrast"/);
});

test('saveAISettings ignores unsaved Liquid Glass preview changes when saving a non-Liquid style', () => {
  const updateCalls = [];
  const storageCalls = [];
  const state = {
    aiConfig: { titleApiHost: 'https://api.openai.com/v1', titleApiKey: '', titleModel: 'gpt-4o', workflowApiHost: 'https://api.openai.com/v1', workflowApiKey: '', workflowModel: 'gpt-4o' },
    displayConfig: { styleMode: 'liquid-glass', liquidGlassAppearance: 'contrast' }
  };
  const elements = {
    'ai-title-host-input': { value: 'https://api.openai.com/v1' },
    'ai-title-key-input': { value: '' },
    'ai-workflow-host-input': { value: 'https://api.openai.com/v1' },
    'ai-workflow-key-input': { value: '' },
    'ai-title-model-input': { value: 'gpt-4o' },
    'ai-workflow-model-input': { value: 'gpt-4o' },
    'show-card-info-toggle': { checked: false },
    'blur-nsfw-toggle': { checked: true },
    'layout-preset-select': { value: 'balanced' },
    'layout-custom-cols': { value: '4' },
    'layout-custom-gap': { value: '24' },
    'layout-custom-aspect': { value: '3/4' },
    'style-mode-select': { value: 'default' },
    'liquid-glass-appearance-select': { value: 'transparent' }
  };

  const saveAISettings = loadWindowFunction('saveAISettings', {
    document: {
      getElementById(id) {
        return elements[id];
      }
    },
    normalizeAiConfig(input) {
      return input;
    },
    normalizeDisplayConfig(input) {
      return input;
    },
    updateState(nextState) {
      updateCalls.push(nextState);
    },
    localStorage: {
      setItem(key, value) {
        storageCalls.push([key, value]);
      }
    },
    state,
    AI_CONFIG_KEY: 'nai-ai-config',
    DISPLAY_CONFIG_KEY: 'nai-display-config',
    showToast() {}
  });

  saveAISettings();

  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].displayConfig.styleMode, 'default');
  assert.equal(updateCalls[0].displayConfig.liquidGlassAppearance, 'contrast');
  const displayStorageWrite = storageCalls.find(([key]) => key === 'nai-display-config');
  assert.ok(displayStorageWrite, 'Expected display config to be persisted');
  assert.match(displayStorageWrite[1], /"liquidGlassAppearance":"contrast"/);
});

test('settings modal contains Liquid Glass personalization controls', () => {
  assert.match(html, /Liquid Glass 个性化/);
  assert.match(html, /liquid-glass-appearance-select/);
  assert.match(html, /liquid-segmented-control/);
  assert.match(html, /liquid-glass-appearance-transparent-btn/);
  assert.match(html, /liquid-glass-appearance-contrast-btn/);
  assert.match(html, /type="hidden" id="liquid-glass-appearance-select"/);
  assert.match(html, /仅在液态玻璃风格下生效/);
  assert.match(html, /liquid-glass-mode-badge/);
  assert.match(html, /增强对比/);
  assert.match(html, /body\.liquid-glass \.app-toast \{/);
  assert.match(html, /var\(--liquid-toast-alpha\)/);
  assert.match(html, /var\(--liquid-overlay-alpha\)/);
  assert.match(html, /var\(--liquid-backdrop-saturation\)/);
  assert.match(html, /var\(--liquid-control-saturation\)/);
  assert.match(html, /liquid-filter-chip/);
  assert.match(html, /liquid-filter-chip-active/);
  assert.match(html, /mobile-search-shell/);
  assert.doesNotMatch(html, /<select id="liquid-glass-appearance-select"/);
  assert.doesNotMatch(html, /onchange="setStyleMode\(this.value\)"/);
  assert.doesNotMatch(html, /onchange="setLiquidGlassAppearance\(this.value\)"/);
});

test('Liquid Glass filter chips use the shared material treatment for inactive and active states', () => {
  const inactiveBlock = extractCssBlock('body.liquid-glass .liquid-filter-chip');
  const activeBlock = extractCssBlock('body.liquid-glass .liquid-filter-chip.liquid-filter-chip-active');

  assert.match(inactiveBlock, /background:\s*linear-gradient\(180deg, rgb\(255 255 255 \/ calc\(var\(--liquid-button-alpha\) \+ [^)]+\)\), rgb\(255 255 255 \/ calc\(var\(--liquid-button-alpha\) \+ [^)]+\)\)\) !important;/);
  assert.match(inactiveBlock, /border:\s*1px solid var\(--liquid-border-light\) !important;/);
  assert.match(inactiveBlock, /box-shadow:/);
  assert.match(activeBlock, /background:\s*linear-gradient\(180deg, rgb\(255 255 255 \/ calc\(var\(--liquid-button-alpha\) \+ [^)]+\)\), rgb\(255 255 255 \/ calc\(var\(--liquid-button-alpha\) \+ [^)]+\)\)\) !important;/);
  assert.match(activeBlock, /border-color:\s*var\(--liquid-border-light\) !important;/);
});

test('filter chip render path does not mix in glass-card panel styling', () => {
  assert.match(html, /const inactiveClass = isLiquidGlassStyle/);
  assert.match(html, /const inactiveClass = isLiquidGlassStyle\s*\?\s*''\s*:\s*'glass-card border-transparent/);
  assert.match(html, /const addCategoryClass = isLiquidGlassStyle\s*\?\s*'border-dashed text-indigo-600 dark:text-indigo-300'\s*:\s*'glass-card border-dashed/);
});

test('Liquid Glass defines an atmosphere layer and shared layered material backgrounds', () => {
  assert.match(html, /body\.liquid-glass::after \{[\s\S]*radial-gradient\([\s\S]*var\(--liquid-atmosphere-primary\)[\s\S]*var\(--liquid-atmosphere-veil\)/);
  assert.match(html, /body\.liquid-glass:not\(\.has-custom-bg\):not\(\.liquid-glass-contrast\) \{[\s\S]*radial-gradient\(circle at 18% 16%[\s\S]*linear-gradient\(135deg/);
  assert.match(html, /body\.liquid-glass \.glass-header::after,[\s\S]*background-image:\s*linear-gradient\([\s\S]*radial-gradient\([\s\S]*url\("data:image\/svg\+xml/);
  assert.match(html, /id="liquid-glass-displacement-map"/);
});

test('Liquid Glass secondary surfaces derive blur from the shared runtime token', () => {
  assert.match(html, /body\.liquid-glass \.app-toast \{[\s\S]*blur\(calc\(var\(--liquid-blur\) \* 0\.72\)\)/);
  assert.match(html, /body\.liquid-glass #filters-container \.glass-card,[\s\S]*blur\(calc\(var\(--liquid-blur\) \* 0\.72\)\)/);
  assert.match(html, /body\.liquid-glass \.glass-modal input\[type="text"\],[\s\S]*blur\(calc\(var\(--liquid-blur\) \* 0\.56\)\)/);
  assert.match(html, /body\.liquid-glass \.glass-modal \.liquid-action,[\s\S]*blur\(calc\(var\(--liquid-blur\) \* 0\.46\)\)/);
  assert.match(html, /body\.liquid-glass \.glass-modal label\[for="display-bg-upload"\] \{[\s\S]*blur\(calc\(var\(--liquid-blur\) \* 0\.46\)\)/);
  assert.match(html, /body\.liquid-glass \.glass-modal label\[class\*="bg-slate-50"\] \{[\s\S]*blur\(calc\(var\(--liquid-blur\) \* 0\.46\)\)[\s\S]*var\(--liquid-control-saturation\)/);
  assert.match(html, /body\.liquid-glass \.artist-card \.liquid-action:not\(\[class\*="absolute"\]\)::before \{[\s\S]*blur\(calc\(var\(--liquid-blur\) \* 0\.85\)\)/);
  assert.match(html, /body\.liquid-glass \.artist-card \.liquid-action\[class\*="absolute"\] \{[\s\S]*blur\(calc\(var\(--liquid-blur\) \* 0\.85\)\)/);
});

test('Liquid Glass helper badge has dedicated dark-mode contrast styling', () => {
  const modalBadgeBlock = extractCssBlock('.dark body.liquid-glass .glass-modal .liquid-glass-mode-badge');

  assert.match(html, /\.liquid-glass-mode-badge\s*\{[\s\S]*color:\s*#475569;[\s\S]*border:\s*1px solid rgba\(255, 255, 255, 0\.45\)/);
  assert.match(html, /\.dark body \.liquid-glass-mode-badge\s*\{[\s\S]*background:\s*rgba\(99, 102, 241, 0\.22\);[\s\S]*color:\s*#f8fafc;[\s\S]*border-color:\s*rgba\(191, 219, 254, 0\.28\)/);
  assert.match(html, /\.dark body\.liquid-glass \.glass-modal \.text-\\\[11px\\\]:not\(\.liquid-glass-mode-badge\),[\s\S]*color:\s*#94a3b8 !important;/);
  assert.match(modalBadgeBlock, /color:\s*#f8fafc;/);
  assert.match(modalBadgeBlock, /text-shadow:\s*0 1px 3px rgba\(15, 23, 42, 0\.55\)/);
  assert.doesNotMatch(modalBadgeBlock, /!important/);
});
