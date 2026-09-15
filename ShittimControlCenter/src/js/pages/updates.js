import { el, frag, clear, button, toast, escapeHtml } from '../ui.js';
import { t } from '../i18n.js';

// Git-free updater. "Check" compares the locally recorded commit (a download marker, or - for a real git checkout - HEAD) against origin/<branch> through the GitHub API and lists the incoming changelog.
export default {
  id: 'updates',
  get title() { return t('nav.updates'); },  icon: 'download',
  needsTarget: false,

  mount(root) {
    let last = null;
    let progUnsub = null;

    const headInfo = el('div', { style: { minWidth: '0' } });
    const resultBody = el('div', { style: { minWidth: '0', marginTop: '14px' } });

    const checkBtn = button(t('updates.checkForUpdates'), { variant: 'primary', sm: true, iconName: 'refresh', onClick: doCheck });

    const versionCard = el('div.card', {},
      el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: t('updates.version') }),
        el('span.sub', { text: 'LTHPKBTE/Shittim-Server - main' }), el('div.spacer', {}), checkBtn),
      el('div.card-body', {}, headInfo, resultBody));

    const rebuildBtn = button(t('updates.rebuildServer'), { variant: 'ghost', iconName: 'bolt', onClick: doRebuild });
    const selfBtn = button(t('updates.checkForAppUpdate'), { variant: 'ghost', iconName: 'refresh', onClick: doSelfCheck });
    const maintCard = el('div.card', { style: { marginTop: '18px' } },
      el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: t('updates.maintenance') })),
      el('div.card-body', {},
        el('p', {
          text: t('updates.maintenanceDescription'),
          style: { fontSize: '13px', color: 'var(--ink-2)', margin: '0 0 14px', lineHeight: '1.6' },
        }),
        el('div.row.wrap', { style: { gap: '10px' } }, rebuildBtn, selfBtn)));

    root.appendChild(versionCard);
    root.appendChild(maintCard);

    paintHead(null);
    clear(resultBody);
    resultBody.appendChild(spinnerRow(t('updates.checkingOrigin')));
    doCheck();

    function sourceTag(info) {
      if (!info || !info.localSource) return null;
      const label = info.localSource === 'git' ? t('updates.source.gitCheckout') : t('updates.source.downloaded');
      return el('span.tag.grey', { text: label });
    }

    function paintHead(info) {
      clear(headInfo);
      const row = el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', minWidth: '0' } });
      if (!info || !info.ok) {
        row.appendChild(el('span', { text: t('updates.currentProject'), style: { fontSize: '13px', color: 'var(--ink-2)' } }));
      } else if (info.versionKnown === false) {
        row.appendChild(el('span', { text: t('updates.installedCopy'), style: { fontSize: '12.5px', color: 'var(--ink-3)' } }));
        if (info.branch) row.appendChild(el('span.tag', { text: info.branch }));
        row.appendChild(el('span.tag.gold', { text: t('updates.versionUnknown') }));
        const st = sourceTag(info); if (st) row.appendChild(st);
      } else {
        row.appendChild(el('span', { text: t('updates.onBranch'), style: { fontSize: '12.5px', color: 'var(--ink-3)' } }));
        row.appendChild(el('span.tag', { text: info.branch || 'main' }));
        if (info.head) row.appendChild(el('span.mono', { text: info.head, 'data-selectable': true, style: { fontSize: '12.5px', color: 'var(--blue-ink)' } }));
        const st = sourceTag(info); if (st) row.appendChild(st);
        if (info.headSubject) {
          row.appendChild(el('span', {
            text: info.headSubject,
            style: { fontSize: '12.5px', color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: '0' },
          }));
        }
      }
      headInfo.appendChild(row);
    }

    function spinnerRow(text) {
      const label = el('span', { text, style: { color: 'var(--ink-3)', fontSize: '13px' } });
      const row = el('div.row', { style: { gap: '10px', padding: '6px 0' } }, el('div.spinner', {}), label);
      row._label = label;
      return row;
    }

    function remoteLine(r) {
      return frag(`<div style="display:flex;gap:11px;padding:10px 13px;margin-top:12px;border:1px solid var(--line);border-radius:var(--r-sm);min-width:0">
        <span class="mono" data-selectable style="font-size:11px;color:var(--ink-3);flex:none;width:58px">${escapeHtml(r.remoteShort || '')}</span>
        <div style="min-width:0;flex:1">
          <div style="font-size:13px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.remoteSubject || '')}</div>
          <div style="font-size:11px;color:var(--ink-3)">origin/${escapeHtml(r.branch || 'main')}${r.remoteWhen ? ` - ${escapeHtml(r.remoteWhen)}` : ''}</div>
        </div>
      </div>`);
    }

    function updateNote(r) {
      const text = r.localSource === 'git'
        ? t('updates.note.git')
        : t('updates.note.download');
      return el('p', {
        html: text,
        style: { fontSize: '12px', color: 'var(--ink-3)', margin: '12px 0 0', lineHeight: '1.6' },
      });
    }

    function renderResult(r) {
      clear(resultBody);
      if (!r || !r.ok) {
        resultBody.appendChild(statusRow('bad', t('updates.checkFailed'), (r && r.error) || t('common.unknownError')));
        return;
      }
      paintHead(r);

      // Can't quantify the gap (no marker, or a commit GitHub can't diff). Offer a clean re-download of the latest source.
      if (r.versionKnown === false || r.compareFailed) {
        const why = r.versionKnown === false
          ? t('updates.compare.noVersionMarker')
          : t('updates.compare.cannotDiffCommit');
        resultBody.appendChild(statusRow('warn', t('updates.cannotCompareVersions'),
          t('updates.compare.latestOnOrigin', { why, branch: r.branch, commit: r.remoteShort, when: r.remoteWhen ? ` - ${r.remoteWhen}` : '' })));
        if (r.remoteSubject) resultBody.appendChild(remoteLine(r));
        resultBody.appendChild(updateNote(r));
        const btn = button(t('updates.downloadLatest'), { variant: 'primary', iconName: 'download', onClick: () => doInstall(r) });
        resultBody.appendChild(el('div', { style: { marginTop: '16px' } }, btn));
        return;
      }

      if ((r.behind || 0) <= 0) {
        resultBody.appendChild(statusRow('good', t('updates.upToDate'),
          r.ahead > 0
            ? (r.ahead === 1
              ? t('updates.aheadOne', { count: r.ahead, branch: r.branch })
              : t('updates.aheadOther', { count: r.ahead, branch: r.branch }))
            : ''));
        return;
      }

      resultBody.appendChild(statusRow('warn', r.behind === 1
        ? t('updates.availableOne', { count: r.behind })
        : t('updates.availableOther', { count: r.behind })));
      resultBody.appendChild(updateNote(r));

      if (r.commits && r.commits.length) {
        const list = el('div', { style: { marginTop: '14px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', overflow: 'hidden', maxHeight: '40vh', overflowY: 'auto' } });
        for (const c of r.commits) {
          list.appendChild(frag(`<div style="display:flex;gap:11px;padding:10px 13px;border-bottom:1px solid var(--line-2);min-width:0">
            <span class="mono" data-selectable style="font-size:11px;color:var(--ink-3);flex:none;width:58px">${escapeHtml(c.hash || '')}</span>
            <div style="min-width:0;flex:1">
              <div style="font-size:13px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(c.subject || '')}</div>
              <div style="font-size:11px;color:var(--ink-3)">${escapeHtml(c.author || '')}${c.when ? ` - ${escapeHtml(c.when)}` : ''}</div>
            </div>
          </div>`));
        }
        if (list.lastElementChild) list.lastElementChild.style.borderBottom = 'none';
        resultBody.appendChild(list);
      }

      const installBtn = button(r.behind === 1
        ? t('updates.installOne', { count: r.behind })
        : t('updates.installOther', { count: r.behind }), { variant: 'primary', iconName: 'download', onClick: () => doInstall(r) });
      resultBody.appendChild(el('div', { style: { marginTop: '16px' } }, installBtn));
    }

    function statusRow(kind, title, detail) {
      const wrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
      wrap.appendChild(frag(`<span class="pill ${kind}" style="align-self:flex-start"><span class="dot"></span>${escapeHtml(title)}</span>`));
      if (detail) wrap.appendChild(el('p', { text: detail, style: { fontSize: '13px', color: 'var(--ink-2)', margin: '0', lineHeight: '1.6' } }));
      return wrap;
    }

    async function doCheck() {
      checkBtn.disabled = true;
      clear(resultBody);
      resultBody.appendChild(spinnerRow(t('updates.checkingOrigin')));
      try {
        last = await window.host.updatesCheck();
        renderResult(last);
      } catch (e) {
        clear(resultBody);
        resultBody.appendChild(statusRow('bad', t('updates.checkFailed'), String(e.message || e)));
      } finally {
        checkBtn.disabled = false;
      }
    }

    function fmtBytes(n) {
      if (!n) return '0 MB';
      const mb = n / (1024 * 1024);
      return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
    }

    async function doInstall(r) {
      clear(resultBody);
      const prog = spinnerRow(r.localSource === 'git' ? t('updates.pullingOrigin') : t('updates.updatingFromGitHub'));
      resultBody.appendChild(prog);

      if (r.localSource !== 'git') {
        progUnsub = window.host.onProjectProgress((d) => {
          if (d.phase === 'download') prog._label.textContent = d.total
            ? t('updates.progress.downloadingTotal', { received: fmtBytes(d.recv), total: fmtBytes(d.total) })
            : t('updates.progress.downloading', { received: fmtBytes(d.recv) });
          else if (d.phase === 'resolve') prog._label.textContent = t('updates.progress.resolving');
          else if (d.phase === 'extract') prog._label.textContent = t('updates.progress.extracting');
          else if (d.phase === 'install') prog._label.textContent = t('updates.progress.installing');
          else if (d.phase === 'done') prog._label.textContent = t('updates.progress.finishing');
        });
      }

      try {
        const res = await window.host.updatesApply();
        if (progUnsub) { progUnsub(); progUnsub = null; }
        clear(resultBody);
        if (res.ok) {
          toast(t('updates.toast.updatedRebuilding', { version: res.head || t('updates.latest') }), 'good', t('updates.updateInstalled'));
          // The update only writes source. Without the build the server keeps launching the old bin/Debug exe and the update looks like it did nothing.
          resultBody.appendChild(spinnerRow(t('updates.rebuildingWithConsole')));
          const built = await window.host.updatesRebuild();
          clear(resultBody);
          if (built.ok) {
            toast(t('updates.serverRebuiltSuccessfully'), 'good');
            resultBody.appendChild(statusRow('good', t('updates.updateInstalled'), built.restarted
              ? t('updates.installedDetailRestarted', { version: res.head || t('updates.latest') })
              : t('updates.installedDetail', { version: res.head || t('updates.latest') })));
          } else {
            toast(built.error || t('updates.buildFailedCode', { code: built.code }), 'bad', t('updates.rebuildFailed'));
            resultBody.appendChild(statusRow('warn', t('updates.updatedRebuildFailed'),
              t('updates.rebuildFailedDetail', {
                version: res.head || t('updates.latest'),
                reason: built.error || t('updates.dotnetExitedCode', { code: built.code }),
              })));
            const rb = button(t('updates.tryRebuildAgain'), { variant: 'ghost', iconName: 'bolt', onClick: doRebuild });
            resultBody.appendChild(el('div', { style: { marginTop: '14px' } }, rb));
          }
        } else {
          toast(t('updates.couldNotApply'), 'bad');
          const detail = res.method === 'git'
            ? t('updates.fastForwardBlocked')
            : (res.error || t('updates.downloadIncomplete'));
          resultBody.appendChild(statusRow('bad', res.method === 'git' ? t('updates.couldNotFastForward') : t('updates.updateFailed'), detail));
          if (res.output) resultBody.appendChild(el('pre.mono', { text: res.output, 'data-selectable': true, style: { marginTop: '12px', padding: '12px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontSize: '11.5px', color: 'var(--ink-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '30vh', overflow: 'auto' } }));
          const retry = button(t('updates.checkAgain'), { variant: 'ghost', iconName: 'refresh', onClick: doCheck });
          resultBody.appendChild(el('div', { style: { marginTop: '14px' } }, retry));
        }
      } catch (e) {
        if (progUnsub) { progUnsub(); progUnsub = null; }
        toast(String(e.message || e), 'bad');
        clear(resultBody);
        resultBody.appendChild(statusRow('bad', t('updates.updateFailed'), String(e.message || e)));
      }
    }

    async function doSelfCheck() {
      selfBtn.disabled = true;
      try {
        const r = await window.host.updatesCheckSelf();
        if (r.dev) { toast(t('updates.self.runningFromSource'), 'warn', t('updates.self.devBuild')); return; }
        if (!r.ok) { toast(r.error || t('updates.self.checkFailed'), 'bad', t('updates.self.appUpdate')); return; }
        if (r.portable) {
          if (r.available) toast(t('updates.self.portableAvailable', { version: r.version }), 'good', t('updates.self.updateAvailable'));
          else toast(t('updates.self.upToDate', { version: r.current }), 'good', t('updates.self.appUpdate'));
          return;
        }
        if (r.available) toast(t('updates.self.available', { version: r.version }), 'good', t('updates.self.updateAvailable'));
        else toast(t('updates.self.upToDate', { version: r.current }), 'good', t('updates.self.appUpdate'));
      } catch (e) {
        toast(String(e.message || e), 'bad', t('updates.self.appUpdate'));
      } finally {
        selfBtn.disabled = false;
      }
    }

    async function doRebuild() {
      rebuildBtn.disabled = true;
      toast(t('updates.rebuildingWithConsole'), 'good', 'dotnet build');
      try {
        const res = await window.host.updatesRebuild();
        toast(res.ok ? t('updates.serverRebuiltSuccessfully') : (res.error || t('updates.buildFailedCode', { code: res.code })), res.ok ? 'good' : 'bad');
      } catch (e) {
        toast(String(e.message || e), 'bad');
      } finally {
        rebuildBtn.disabled = false;
      }
    }

    // detach the progress listener if the user navigates away mid-install
    return () => { if (progUnsub) { progUnsub(); progUnsub = null; } };
  },
};
