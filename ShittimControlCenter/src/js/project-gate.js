import { el, frag, clear, button, toast, escapeHtml } from './ui.js';
import { t } from './i18n.js';

const BRAND_IMG = '../Sprite/Common_Icon_Setting_Account.png';

function fmtBytes(n) {
  if (!n) return '0 MB';
  const mb = n / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

// First-run / recovery screen shown when no server project is present. Offers two routes: download a fresh copy of the repo from GitHub, or point at an existing folder.
// On success the whole app reloads so every module re-resolves its paths against the newly-set project.
export function renderProjectGate(appRoot, status, { titlebar }) {
  clear(appRoot);
  appRoot.appendChild(titlebar);

  // target folder for a download (a parent + /Shittim-Server); user can change.
  const sep = (status.defaultDir || '').includes('\\') ? '\\' : '/';
  let targetDir = status.defaultDir || '';
  let busy = false;

  const wrap = el('div', {
    style: {
      gridColumn: '1 / -1', gridRow: '2 / -1', minHeight: '0', overflow: 'auto',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '34px 26px',
    },
  });
  const col = el('div', { style: { width: '100%', maxWidth: '600px', minWidth: '0' } });
  wrap.appendChild(col);
  appRoot.appendChild(wrap);

  // A folder that was set and has since gone - unplugged drive, renamed, network share down - reads as "not found" unless it says so, and downloading a second copy over the top strands the database in the folder that is still there.
  const gone = status.configuredMissing && status.configured;
  const heading = gone ? t('projectGate.missing.title') : t('projectGate.notFound.title');
  const blurb = gone
    ? t('projectGate.missing.description', { path: `<span class="mono">${escapeHtml(status.configured)}</span>` })
    : t('projectGate.notFound.description');

  col.appendChild(frag(`
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:6px">
      <img class="brand-img" src="${BRAND_IMG}" alt="" style="height:46px;width:auto">
      <div style="min-width:0">
        <h2 style="font-size:20px;font-weight:800;color:var(--ink);line-height:1.15;margin:0">${heading}</h2>
        <p style="font-size:13px;color:var(--ink-2);margin:4px 0 0;line-height:1.5">
          ${blurb}
        </p>
      </div>
    </div>`));
  col.appendChild(frag(`<div class="hazard" style="margin:18px 0"></div>`));

  const targetLabel = el('span.mono', {
    text: targetDir,
    'data-selectable': true,
    style: { fontSize: '12px', color: 'var(--blue-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: '0' },
  });
  const changeBtn = button(t('projectGate.change'), { variant: 'ghost', sm: true, iconName: 'folder', onClick: async () => {
    if (busy) return;
    const picked = await window.host.pickFolder();
    if (!picked) return;
    targetDir = picked.replace(/[\\/]+$/, '') + sep + 'Shittim-Server';
    targetLabel.textContent = targetDir;
  }});

  const dlBtn = button(t('projectGate.downloadProject'), { variant: 'primary', iconName: 'download', onClick: doDownload });

  const progressWrap = el('div', { style: { display: 'none', marginTop: '14px' } });
  const progressBar = el('div', { style: { height: '100%', width: '0%', background: 'var(--blue)', borderRadius: '999px', transition: 'width .15s ease' } });
  const progressTrack = el('div', { style: { height: '8px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: '999px', overflow: 'hidden' } }, progressBar);
  const progressText = el('div', { style: { fontSize: '12px', color: 'var(--ink-2)', marginTop: '8px', display: 'flex', justifyContent: 'space-between', gap: '12px' } });
  progressWrap.appendChild(progressTrack);
  progressWrap.appendChild(progressText);

  const downloadCard = el('div.card', {},
    el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: t('projectGate.downloadLatest') }),
      el('span.sub', { text: 'LTHPKBTE/Shittim-Server - main' }), el('div.spacer', {})),
    el('div.card-body', {},
      el('p', {
        text: t('projectGate.downloadDescription'),
        style: { fontSize: '13px', color: 'var(--ink-2)', margin: '0 0 14px', lineHeight: '1.6' },
      }),
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', minWidth: '0', padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)' } },
        el('span', { text: t('projectGate.installTo'), style: { fontSize: '11.5px', fontWeight: '700', color: 'var(--ink-3)', flex: 'none' } }),
        targetLabel, el('div.spacer', { style: { flex: '1' } }), changeBtn),
      el('div', { style: { marginTop: '16px' } }, dlBtn),
      progressWrap));

  col.appendChild(downloadCard);

  const locateBtn = button(t('projectGate.locateFolder'), { variant: 'ghost', iconName: 'folder', onClick: doLocate });
  const locateCard = el('div.card', { style: { marginTop: '16px' } },
    el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: t('projectGate.useExistingFolder') })),
    el('div.card-body', {},
      el('p', {
        html: t('projectGate.locateDescription'),
        style: { fontSize: '13px', color: 'var(--ink-2)', margin: '0 0 14px', lineHeight: '1.6' },
      }),
      locateBtn));
  col.appendChild(locateCard);

  function setBusy(on) {
    busy = on;
    dlBtn.disabled = on;
    locateBtn.disabled = on;
    changeBtn.disabled = on;
  }

  function showProgress(pct, label) {
    progressWrap.style.display = 'block';
    progressBar.style.width = `${Math.max(2, Math.min(100, pct))}%`;
    clear(progressText);
    progressText.appendChild(el('span', { text: label }));
  }

  let unsub = null;
  async function doDownload() {
    if (busy) return;
    setBusy(true);
    showProgress(2, t('projectGate.progress.starting'));
    unsub = window.host.onProjectProgress((d) => {
      if (d.phase === 'download') {
        const pct = d.total ? (d.recv / d.total) * 100 : 0;
        showProgress(d.total ? pct : 8, d.total
          ? t('projectGate.progress.downloadingTotal', { received: fmtBytes(d.recv), total: fmtBytes(d.total) })
          : t('projectGate.progress.downloading', { received: fmtBytes(d.recv) }));
      } else if (d.phase === 'resolve') {
        showProgress(4, t('projectGate.progress.resolving'));
      } else if (d.phase === 'extract') {
        showProgress(92, t('projectGate.progress.extracting'));
      } else if (d.phase === 'install') {
        showProgress(97, t('projectGate.progress.installing'));
      } else if (d.phase === 'done') {
        showProgress(100, t('projectGate.progress.done'));
      } else if (d.phase === 'error') {
        showProgress(100, d.message || t('projectGate.progress.failed'));
      }
    });
    try {
      const res = await window.host.projectDownload({ targetDir });
      if (unsub) { unsub(); unsub = null; }
      if (res && res.ok) {
        showProgress(100, t('projectGate.progress.installedStarting', { sha: res.sha || '' }));
        toast(t('projectGate.toast.downloaded'), 'good', t('common.ready'));
        setTimeout(() => location.reload(), 500);
      } else {
        toast((res && res.error) || t('projectGate.downloadFailed'), 'bad');
        showProgress(100, (res && res.error) || t('projectGate.downloadFailed'));
        setBusy(false);
      }
    } catch (e) {
      if (unsub) { unsub(); unsub = null; }
      toast(String(e.message || e), 'bad', t('projectGate.downloadFailed'));
      setBusy(false);
    }
  }

  async function doLocate() {
    if (busy) return;
    const picked = await window.host.pickFolder();
    if (!picked) return;
    setBusy(true);
    try {
      const res = await window.host.projectSetPath(picked);
      if (res && res.ok) {
        toast(t('projectGate.toast.located'), 'good', t('common.ready'));
        setTimeout(() => location.reload(), 350);
      } else {
        toast((res && res.error) || t('projectGate.noProjectInFolder'), 'bad', t('projectGate.notFound.short'));
        setBusy(false);
      }
    } catch (e) {
      toast(String(e.message || e), 'bad');
      setBusy(false);
    }
  }
}
