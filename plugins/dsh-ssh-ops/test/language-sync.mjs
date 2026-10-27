import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { syncLanguageWithHost } from "../src/client/language-sync.js";

function fixture(api, active = "zh") {
  const listeners = new Set();
  const applied = [];
  const locale = { active, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  const notify = (next = locale.active) => { locale.active = next; for (const fn of listeners) fn(); };
  const dispose = syncLanguageWithHost(api, locale, value => value.active, value => applied.push(value));
  return { notify, applied, dispose, listeners };
}

test("boot dictionary revisions do not fan out language RPCs or redundant writes", async () => {
  let reads = 0;
  const saves = [];
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const f = fixture({ languageGet: async () => { reads++; await pending; return { language: "zh" }; }, languageSave: async value => saves.push(value) });
  try {
    for (let i = 0; i < 100; i++) f.notify();
    assert.equal(reads, 1);
    release();
    await setImmediate();
    for (let i = 0; i < 100; i++) f.notify();
    await setImmediate();
    assert.equal(reads, 1);
    assert.deepEqual(saves, []);
    assert.deepEqual(f.applied, ["zh"]);
  } finally { release(); f.dispose(); }
  assert.equal(f.listeners.size, 0);
});

test("follow mode persists real language changes once and preserves a stored pin", async () => {
  let stored = { language: null, autoApplySystemLanguage: true };
  const saves = [];
  const f = fixture({ languageGet: async () => stored, languageSave: async language => { saves.push(language); stored = { ...stored, language }; } });
  try {
    await setImmediate();
    f.notify("en");
    await setImmediate();
    f.notify("en");
    await setImmediate();
    assert.deepEqual(saves, ["zh", "en"]);
    stored = { language: "en", autoApplySystemLanguage: false };
    f.notify("zh");
    await setImmediate();
    assert.deepEqual(f.applied, ["zh", "en", "en"]);
    assert.deepEqual(saves, ["zh", "en"]);
  } finally { f.dispose(); }
});

test("in-flight startup reads cannot overwrite a newer selection or write after disposal", async () => {
  const reads = [];
  const saves = [];
  const f = fixture({ languageGet: () => new Promise(resolve => reads.push(resolve)), languageSave: async value => saves.push(value) });
  f.notify("en");
  reads[0]({ language: "zh" });
  await setImmediate();
  assert.deepEqual(f.applied, []);
  assert.equal(reads.length, 2);
  f.dispose();
  reads[1]({ language: "zh" });
  await setImmediate();
  f.notify("zh");
  assert.deepEqual(saves, []);
  assert.deepEqual(f.applied, []);
  assert.equal(reads.length, 2);
});
