import { el, frag, clear, button, input, field, toast, confirmDialog, notifyRestart, shortDate, escapeHtml, emptyState } from '../ui.js';
import { api, targetAccount } from '../api.js';
import { t } from '../i18n.js';
import { gate, loadInto } from './_util.js';

const TYPES = [
  { key: 'total', titleKey: 'raids.type.totalAssault', icon: 'shield' },
  { key: 'grand', titleKey: 'raids.type.grandAssault', icon: 'bolt' },
  { key: 'drill', titleKey: 'raids.type.jointFiringDrill', icon: 'clock' },
  { key: 'final', titleKey: 'raids.type.finalRestriction', icon: 'flask' },
];

export default {
  id: 'events',
  get title() { return t('raids.title'); },  icon: 'events',
  needsTarget: true,

  mount(root) {
    return gate(root, { needServer: true, needTarget: true }, (root) => {
      const acc = targetAccount();
      const uid = acc.serverId;

      root.appendChild(el('div.row.wrap', { style: { margin: '-2px 0 16px', gap: '8px' } },
        el('span.pill.blue', {}, el('span.dot', {}), t('raids.applyingTo', { name: acc.nickname, id: uid }))));

      // 199 seasons across four scrollers, so the boss name is the only way anyone finds the one they want.
      const search = input({ placeholder: t('raids.search.placeholder') });
      root.appendChild(el('div', { style: { maxWidth: '320px', margin: '0 0 14px' } }, field(t('raids.search.label'), search)));

      const grid = el('div.grid-2', { style: { alignItems: 'start' } });
      root.appendChild(grid);

      loadInto(grid, () => api.eventSeasons(uid), (grid, data) => {
        const filters = [];
        search.addEventListener('input', () => filters.forEach((f) => f()));

        for (const type of TYPES) {
          const typeTitle = t(type.titleKey);
          const seasons = data[type.key] || [];
          const live = data.current ? data.current[type.key] : null;
          const body = el('div.list-scroll', { style: { maxHeight: '40vh' } });
          const card = el('div.card', { style: { minWidth: '0' } },
            el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: typeTitle }),
              el('div.spacer', {}), live ? el('span.pill.good', {}, el('span.dot', {}), t('raids.season.live', { season: live })) : null),
            body);

          if (!seasons.length) {
            body.appendChild(emptyState(t('raids.empty.noSeasons')));
          } else {
            // Window 132px fits the nowrap date lines; 94px fits the Apply button (box-sizing includes the 28px cell padding) - anything narrower paints the button over the date column and past the card edge.
            const tb = el('tbody', {});
            const tbl = el('table.tbl', { style: { tableLayout: 'fixed' } },
              el('thead', {}, el('tr', {},
                el('th', { text: t('raids.table.season') }),
                el('th', { text: t('raids.table.window'), style: { width: '132px' } }),
                el('th', { style: { width: '94px' } }))), tb);
            for (const s of seasons) {
              const tr = frag(`<tr>
                <td style="max-width:0"><b style="font-family:var(--font-round)" data-selectable>#${escapeHtml(String(s.seasonId))}</b><div class="muted" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(s.boss || '')}</div></td>
                <td class="muted" style="font-size:11.5px;white-space:nowrap">${fmt(s.start)}<br>→ ${fmt(s.end)}</td>
                <td style="text-align:right;white-space:nowrap"></td></tr>`);
              const apply = button(t('raids.action.apply'), { variant: 'primary', sm: true });
              apply.style.height = '28px'; apply.style.padding = '0 12px';
              apply.addEventListener('click', async (e) => {
                e.stopPropagation();
                const ok = await confirmDialog({ title: t('raids.confirm.title', { type: typeTitle, season: s.seasonId }), confirmLabel: t('raids.confirm.applySeason'),
                  message: t('raids.confirm.message', { name: acc.nickname, type: typeTitle, season: s.seasonId }) });
                if (!ok) return;
                try {
                  // the bridge answers 200 even when the command bailed ("Season ID does not exist", "Invalid type!"), so trust the command's own confirmation line rather than the status code
                  const out = String((await api.command(uid, `setseason ${type.key} ${s.seasonId}`))?.output || '');
                  if (!out.includes(`set to ${s.seasonId}`)) { toast(out.trim().split('\n').pop() || t('raids.toast.seasonUnchanged'), 'bad'); return; }
                  toast(t('raids.toast.seasonSet', { type: typeTitle, season: s.seasonId }), 'good'); notifyRestart();
                }
                catch (err) { toast(err.message, 'bad'); }
              });
              tr.lastElementChild.appendChild(apply);
              if (s.seasonId === live) tr.firstElementChild.querySelector('b').appendChild(el('span.pill.good', { text: t('raids.season.current'), style: { marginLeft: '6px' } }));
              tb.appendChild(tr);
            }
            body.appendChild(tbl);

            const empty = emptyState(t('raids.empty.noMatches'));
            empty.style.display = 'none';
            body.appendChild(empty);
            filters.push(() => {
              const q = search.value.trim().toLowerCase();
              let hits = 0;
              for (let i = 0; i < seasons.length; i++) {
                const show = !q || String(seasons[i].seasonId).includes(q) || (seasons[i].boss || '').toLowerCase().includes(q);
                tb.children[i].style.display = show ? '' : 'none';
                if (show) hits++;
              }
              tbl.style.display = hits ? '' : 'none';
              empty.style.display = hits ? 'none' : '';
            });
          }
          grid.appendChild(card);
        }
      });
    });
  },
};

function fmt(s) {
  if (!s) return '-';
  // season excel dates may be ISO or "yyyy-MM-dd HH:mm:ss"
  return shortDate(String(s).replace(' ', 'T'));
}
