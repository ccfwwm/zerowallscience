import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { observePluginUpdate } from '../src/zerowall-update-ui.ts';

test('archive updates open Extension Center without network or profile mutation', async () => {
  const dom = new JSDOM('<html lang="zh"><body><div class="title"></div></body></html>', { url: 'http://localhost' });
  const original = Object.fromEntries(['window', 'document', 'MutationObserver', 'CustomEvent'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of Object.keys(original)) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  try {
    let calls = 0;
    dom.window.fetch = () => { calls++; throw Error('No network operation permitted'); };
    let section;
    dom.window.addEventListener('zerowall:open-settings', event => { section = event.detail; });
    const dispose = observePluginUpdate({ titleRowSelector: '.title' });
    const button = dom.window.document.querySelector('button');
    assert.equal(button.textContent, '扩展中心');
    button.click();
    assert.equal(section, 'zerowall-extension-center');
    assert.equal(calls, 0);
    dom.window.document.documentElement.lang = 'en';
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(button.textContent, 'Extension center');
    dom.window.document.body.insertAdjacentHTML('beforeend', '<div class="title"></div>');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(dom.window.document.querySelectorAll('button').length, 2);
    dispose();
    assert.equal(dom.window.document.querySelectorAll('button').length, 0);
  } finally {
    dom.window.close();
    for (const [key, descriptor] of Object.entries(original)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});

test('published archive Host cannot register upstream npm update routes', async () => {
  const host = await readFile(new URL('../lib/index.js', import.meta.url), 'utf8');
  const client = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
  assert.doesNotMatch(host, /plugin-updater|registerPluginUpdater/);
  assert.doesNotMatch(client, /registry\.npmjs\.org|michengai\/dsh-archive-manager\/update/);
  assert.match(client, /zerowall:open-settings/);
});
