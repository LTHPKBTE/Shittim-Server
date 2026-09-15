import { el, frag, clear, button, toast, escapeHtml } from '../ui.js';
import { t } from '../i18n.js';

function diagRow(name, info, fixBtn) {
  const status = info?.status || 'missing';
  const row = frag(`<div class="diag-row">
    <span class="d-led ${status}"></span>
    <span class="d-name">${escapeHtml(name)}</span>
    <span class="d-detail">${escapeHtml(info?.detail || '')}</span>
  </div>`);
  if (fixBtn) row.appendChild(fixBtn);
  return row;
}

export default {
  id: 'overview',
  get title() { return t('nav.overview'); },
  icon: 'dashboard',
  needsTarget: false,

  mount(root) {
    const diagBody = el('div.diag', { style: { minWidth: '0' } });

    let busy = false;
    const refreshBtn = button(t('overview.recheck'), { variant: 'ghost', sm: true, iconName: 'refresh', onClick: () => loadDiag() });
    const setupBtn = button(t('overview.installMissing'), { variant: 'primary', sm: true, iconName: 'download', onClick: () => runSetup('all') });
    const readiness = cardWith(t('overview.environmentReadiness'), null, [setupBtn, refreshBtn], diagBody);

    const shortcutBody = el('div.row.wrap', { style: { gap: '10px', minWidth: '0' } });
    const shortcuts = [
      [t('overview.shortcuts.serverFolder'), 'folder', (p) => p.serverDir],
      [t('overview.shortcuts.proxyScripts'), 'folder', (p) => p.scriptsDir],
      [t('overview.shortcuts.configFile'), 'config', (p) => p.configPath],
      [t('overview.shortcuts.database'), 'inventory', (p) => p.dbPath],
    ];
    for (const [label, ic, pick] of shortcuts) {
      shortcutBody.appendChild(button(label, { variant: 'ghost', sm: true, iconName: ic, onClick: async () => {
        const p = await window.host.paths();
        window.host.openPath(pick(p));
      }}));
    }
    const shortcutsCard = cardWith(t('overview.shortcuts.title'), null, [], shortcutBody);

    const hostsLine = el('p', { style: { fontSize: '12.5px', color: 'var(--ink-3)', margin: '12px 0 0', lineHeight: '1.6' } });
    const offlineBtn = button(t('overview.offline.start'), { variant: 'primary', iconName: 'play', onClick: () => startOffline() });
    const hostsBtn = button(t('overview.offline.restoreHosts'), { variant: 'ghost', sm: true, iconName: 'x', onClick: () => clearHosts() });
    const offlineCard = cardWith(t('overview.offline.title'), t('overview.offline.subtitle'), [],
      el('div', {},
        el('div.row.wrap', { style: { gap: '10px', minWidth: '0' } }, offlineBtn, hostsBtn),
        el('p', { text: t('overview.offline.description'), style: { fontSize: '12.5px', color: 'var(--ink-3)', margin: '12px 0 0', lineHeight: '1.6' } }),
        hostsLine));

    const exportBtn = button(t('overview.logs.export'), { variant: 'ghost', iconName: 'save', onClick: async () => {
      exportBtn.disabled = true;
      try {
        const r = await window.host.exportLogs();
        if (!r || r.canceled) return;
        if (r.ok) {
          toast(t(r.count === 1 ? 'overview.logs.bundledOne' : 'overview.logs.bundledMany', { count: r.count, name: r.name }), 'good', t('overview.logs.exported'));
          window.host.revealPath(r.path);
        } else {
          toast(r.error || t('overview.logs.couldNotExport'), 'bad', t('overview.logs.exportFailed'));
        }
      } catch (e) {
        toast(String(e.message || e), 'bad', t('overview.logs.exportFailed'));
      } finally {
        exportBtn.disabled = false;
      }
    }});
    const diagnostics = cardWith(t('overview.diagnostics.title'), null, [],
      el('div', {}, exportBtn,
        el('p', { text: t('overview.diagnostics.description'), style: { fontSize: '12.5px', color: 'var(--ink-3)', margin: '12px 0 0', lineHeight: '1.6' } })));

    const right = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '18px', minWidth: '0' } }, offlineCard, shortcutsCard, diagnostics);
    root.appendChild(el('div.grid-2', { style: { gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', alignItems: 'start' } }, readiness, right));

    function fixBtn(step, info) {
      if (busy) return null;
      const ready = (info?.status || 'missing') === 'ready';
      if (ready) return null;
      const label = step === 'certificate' ? t('overview.setup.trustCertificate') : t('overview.setup.install');
      return button(label, { variant: 'ghost', sm: true, iconName: 'download', onClick: () => runSetup(step) });
    }

    async function loadDiag() {
      diagBody.innerHTML = `<div class="empty"><div class="spinner"></div></div>`;
      try {
        const env = await window.host.envCheck();
        clear(diagBody);
        diagBody.appendChild(diagRow(t('overview.environment.dotnetSdk'), env.dotnet, fixBtn('dotnet', env.dotnet)));
        diagBody.appendChild(diagRow(t('overview.environment.serverBuild'), env.server));
        diagBody.appendChild(diagRow(t('overview.environment.gameDatabase'), env.database));
        diagBody.appendChild(diagRow('mitmproxy', env.mitmproxy, fixBtn('mitmproxy', env.mitmproxy)));
        diagBody.appendChild(diagRow(t('overview.environment.caCertificate'), env.certificate, fixBtn('certificate', env.certificate)));
        diagBody.appendChild(diagRow(t('overview.environment.gatewayKeys'), env.gateway));
        diagBody.appendChild(diagRow(t('overview.environment.redirectScript'), env.redirect));
        const anyMissing = ['dotnet', 'mitmproxy', 'certificate'].some((k) => (env[k]?.status || 'missing') !== 'ready');
        setupBtn.disabled = busy || !anyMissing;
      } catch (e) {
        diagBody.innerHTML = `<div class="empty"><b>${escapeHtml(t('overview.environment.checkFailed'))}</b><span>${escapeHtml(String(e.message || e))}</span></div>`;
      }
    }

    async function loadOffline() {
      try {
        const s = await window.host.offlineStatus();
        hostsBtn.style.display = s.hosts ? '' : 'none';
        hostsLine.textContent = s.hosts
          ? t('overview.offline.hostsActive', { count: s.hostnames.length })
          : t('overview.offline.hostsUntouched');
      } catch (e) {
        hostsLine.textContent = String(e.message || e);
      }
    }

    async function startOffline() {
      offlineBtn.disabled = true;
      try {
        const r = await window.host.systemStartOffline();
        if (r.ok) toast(t('overview.offline.starting'), 'good', t('overview.offline.title'));
        else toast(r.error || t('overview.offline.couldNotStart'), 'bad', t('overview.offline.title'));
      } catch (e) {
        toast(String(e.message || e), 'bad', t('overview.offline.title'));
      } finally {
        offlineBtn.disabled = false;
        loadOffline();
      }
    }

    async function clearHosts() {
      hostsBtn.disabled = true;
      try {
        const r = await window.host.offlineHosts(false);
        if (!r.ok) toast(r.error || t('overview.offline.couldNotEditHosts'), 'bad', t('overview.offline.title'));
      } catch (e) {
        toast(String(e.message || e), 'bad', t('overview.offline.title'));
      } finally {
        hostsBtn.disabled = false;
        loadOffline();
      }
    }

    // The .NET SDK download (~250 MB) is silent for minutes, so a spinner plus an always-ticking elapsed counter is what stops it reading as "hung".
    function setupPanel() {
      const titleEl = el('div', { style: { fontWeight: '700', fontSize: '13.5px' } });
      const subEl = el('div', { style: { fontSize: '12px', color: 'var(--ink-3)', marginTop: '3px' } });
      const logEl = el('div.mono', { style: { fontSize: '11px', color: 'var(--ink-3)', marginTop: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: '0' } });
      const wrap = el('div', { style: { display: 'flex', gap: '13px', alignItems: 'flex-start', padding: '16px 4px' } },
        frag('<div class="spinner"></div>'),
        el('div', { style: { minWidth: '0', flex: '1' } }, titleEl, subEl, logEl));
      return { wrap, titleEl, subEl, logEl };
    }

    function fmtMB(n) { return `${(n / (1024 * 1024)).toFixed(0)} MB`; }

    // mitmproxy/.NET install per-user (silent); trusting the CA raises one Windows elevation prompt.
    async function runSetup(which) {
      if (busy) return;
      busy = true;
      setupBtn.disabled = true; refreshBtn.disabled = true;
      const labels = { dotnet: '.NET 10 SDK', mitmproxy: 'mitmproxy', certificate: t('overview.environment.caCertificate') };

      clear(diagBody);
      const panel = setupPanel();
      diagBody.appendChild(panel.wrap);

      let curStep = which === 'all' ? 'dotnet' : which;
      let msg = t('overview.setup.starting');
      const t0 = Date.now();
      const elapsed = () => {
        const seconds = Math.floor((Date.now() - t0) / 1000);
        const minutes = Math.floor(seconds / 60);
        return minutes
          ? t('overview.setup.elapsedMinutes', { minutes, seconds: seconds % 60 })
          : t('overview.setup.elapsedSeconds', { seconds });
      };
      const render = () => {
        panel.titleEl.textContent = t('overview.setup.installing', { name: labels[curStep] || curStep });
        panel.subEl.textContent = t('overview.setup.progressElapsed', { message: msg, elapsed: elapsed() });
      };
      render();
      // tick every second so the elapsed time always moves, even while a step is mid-download and emitting nothing
      const timer = setInterval(render, 1000);

      const unsub = window.host.onSetupProgress((d) => {
        if (d.step && labels[d.step]) curStep = d.step;
        if (typeof d.recv === 'number' && d.total) msg = t('overview.setup.downloading', { received: fmtMB(d.recv), total: fmtMB(d.total) });
        else if (d.status === 'running' && d.message) msg = d.message;
        if (d.line) panel.logEl.textContent = d.line;
        if (d.status === 'done') { msg = d.message || t('overview.setup.stepReady', { name: labels[d.step] || d.step }); toast(msg, 'good'); }
        if (d.status === 'failed') { msg = d.message || t('overview.setup.stepFailed', { name: labels[d.step] || d.step }); toast(msg, 'bad'); }
        render();
      });

      try {
        const res = await window.host.setupInstall(which);
        if (res.ok) toast(t('overview.setup.allReady'), 'good', t('overview.setup.complete'));
        else {
          const failed = Object.entries(res.results || {}).filter(([, r]) => r && !r.ok).map(([k]) => labels[k] || k);
          toast(failed.length ? t('overview.setup.couldNotComplete', { steps: failed.join(', ') }) : (res.error || t('overview.setup.didNotFinish')), 'bad', t('overview.setup.incomplete'));
        }
      } catch (e) {
        toast(String(e.message || e), 'bad', t('overview.setup.failed'));
      } finally {
        clearInterval(timer);
        unsub();
        busy = false;
        refreshBtn.disabled = false;
        await loadDiag();
      }
    }

    loadDiag();
    loadOffline();
  },
};

function cardWith(title, sub, actions, body) {
  const head = el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: title }),
    sub ? el('span.sub', { text: sub }) : null, el('div.spacer', {}), ...actions);
  return el('div.card', {}, head, el('div.card-body', {}, body));
}
