'use strict';

// Load the actual file:// entry point with its CSP and production preload.
// Optionally pass an app.asar path to verify the packaged renderer as well.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
let language = 'en';
let found = true;
app.on('window-all-closed', () => {});
ipcMain.handle('settings:read', () => ({ language }));
ipcMain.handle('project:status', () => ({ found, defaultDir: 'C:\\renderer-smoke' }));
ipcMain.handle('config:read', () => ({ data: {} }));
ipcMain.handle('proc:status', () => ({ server: 'stopped', mitm: 'stopped' }));
ipcMain.handle('env:check', () => ({}));
ipcMain.handle('offline:status', () => ({ hosts: false }));
ipcMain.handle('paths:resolve', () => ({}));

app.whenReady().then(async () => {
  for (language of ['en', 'zh-CN']) {
    const locale = require(path.join(root, 'src', 'locales', `${language}.json`));
    for (found of [true, false]) {
      const errors = [];
      const win = new BrowserWindow({
        show: false,
        webPreferences: {
          preload: path.join(root, 'preload.js'),
          contextIsolation: true, nodeIntegration: false, sandbox: false,
        },
      });
      try {
        win.webContents.on('console-message', (_event, level, message) => {
          if (level >= 3) errors.push(message);
        });
        // Keep startup probes away from any real server running on this machine.
        win.webContents.session.protocol.handle('http', () => new Response('{}', { status: 503 }));
        await win.loadFile(path.join(root, 'src', 'index.html'));
        const state = await win.webContents.executeJavaScript(`new Promise(resolve => {
          const deadline = Date.now() + 5000;
          const check = () => {
            const ready = document.querySelector(${JSON.stringify(found ? '.diag-row' : '#app h2')});
            if (!ready && Date.now() < deadline) return setTimeout(check, 50);
            resolve({
              language: document.documentElement.lang,
              title: document.title,
              nav: [...document.querySelectorAll('.nav-item')].map(n => n.textContent),
              heading: document.querySelector('#app h2')?.textContent,
              titlebar: !!document.querySelector('.titlebar'),
              ready: !!ready,
            });
          };
          check();
        })`);
        assert.deepEqual(errors, [], `${language}, project found=${found}: renderer errors`);
        assert.equal(state.ready, true, 'startup must render content');
        assert.equal(state.titlebar, true);
        assert.equal(state.language, language);
        assert.equal(state.title, locale['app.title']);
        if (found) {
          assert.equal(state.nav.length, 11);
          assert.equal(state.nav[0], locale['nav.overview']);
        } else {
          assert.equal(state.heading, locale['projectGate.notFound.title']);
        }
        console.log(`PASS ${language}, ${found ? 'main interface' : 'project setup'}`);
      } finally {
        win.webContents.session.protocol.unhandle('http');
        win.destroy();
      }
    }
  }
  app.exit(0);
}).catch(error => {
  console.error(error);
  app.exit(1);
});
