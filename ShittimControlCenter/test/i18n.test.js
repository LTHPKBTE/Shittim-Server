'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const en = require('../src/locales/en.json');
const zhCN = require('../src/locales/zh-CN.json');

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : [];
  });
}

test('English and Chinese locale files contain the same non-empty keys', () => {
  assert.deepEqual(Object.keys(zhCN).sort(), Object.keys(en).sort());
  for (const key of Object.keys(en)) {
    assert.equal(typeof en[key], 'string', `English value for ${key} must be a string`);
    assert.equal(typeof zhCN[key], 'string', `Chinese value for ${key} must be a string`);
    assert.ok(en[key].trim(), `English value for ${key} must not be empty`);
    assert.ok(zhCN[key].trim(), `Chinese value for ${key} must not be empty`);
    const placeholders = (value) => [...value.matchAll(/{{\s*([^},\s]+)[^}]*}}/g)].map((match) => match[1]).sort();
    assert.deepEqual(placeholders(zhCN[key]), placeholders(en[key]), `Placeholders for ${key} must match`);
  }
});

test('every static renderer and main-process translation key exists', () => {
  const files = [path.join(ROOT, 'main.js'), ...jsFiles(path.join(ROOT, 'src', 'js'))];
  const missing = [];
  const translationCall = /\b(?:t|mainT)\(\s*(['"])([^'"\r\n]+)\1/g;

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(translationCall)) {
      if (!Object.hasOwn(en, match[2])) {
        missing.push(`${path.relative(ROOT, file)}: ${match[2]}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});
