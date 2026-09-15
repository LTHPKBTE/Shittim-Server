import { el, frag, clear, button, input, select, toggle, field, toast, confirmDialog, escapeHtml, emptyState, shortDate, notifyRestart, modal, num } from '../ui.js';
import { api, targetAccount } from '../api.js';
import { t } from '../i18n.js';
import { gate, loadInto } from './_util.js';

// EventContentType values that are their own minigame rather than a stage/shop/mission attached to one.
const MINIGAME_TYPE_KEYS = {
  MiniGameRhythm: 'schedule.minigame.rhythm',
  MinigameRhythmEvent: 'schedule.minigame.rhythm',
  MiniGameShooting: 'schedule.minigame.shooting',
  MiniGameTBG: 'schedule.minigame.boardGame',
  MiniGameDefense: 'schedule.minigame.towerDefense',
  MinigameDreamMaker: 'schedule.minigame.dreamMaker',
  MiniGameRoad: 'schedule.minigame.roadPuzzle',
  MiniGameCCG: 'schedule.minigame.cardBattle',
  DiceRace: 'schedule.minigame.diceRace',
  Treasure: 'schedule.minigame.treasureHunt',
  Conquest: 'schedule.minigame.conquest',
  Field: 'schedule.minigame.field',
  EventLocation: 'schedule.minigame.location',
  CardShop: 'schedule.minigame.cardShop',
  BoxGacha: 'schedule.minigame.boxGacha',
  FortuneGachaShop: 'schedule.minigame.fortuneGacha',
};

const FILTERS = [
  { value: 'all', labelKey: 'schedule.filter.everything' },
  { value: 'minigame', labelKey: 'schedule.filter.hasMinigame' },
  { value: 'on', labelKey: 'schedule.filter.currentlyForcedOpen' },
  { value: 'rerun', labelKey: 'schedule.filter.reruns' },
  { value: 'rail', labelKey: 'schedule.filter.showsLobbyIcon' },
  { value: 'unnamed', labelKey: 'schedule.filter.neverLocalized' },
];

const SORTS = [
  { value: 'new', labelKey: 'schedule.sort.newestFirst' },
  { value: 'old', labelKey: 'schedule.sort.oldestFirst' },
  { value: 'name', labelKey: 'schedule.sort.name' },
];

// Past this many lobby icons the dot bar under the rail keeps growing at a fixed pixel per dot and walks off the edge of the screen.
const RAIL_COMFORTABLE = 8;

// The event's own item names already read well enough ("Baddie's Apology Letter"), so the type is only there to say which of the three token slots it is.
const ITEM_TYPE_KEYS = {
  EventPoint: 'schedule.itemType.points',
  EventToken1: 'schedule.itemType.token1',
  EventToken2: 'schedule.itemType.token2',
  EventToken3: 'schedule.itemType.token3',
  EventToken4: 'schedule.itemType.token4',
  EventToken5: 'schedule.itemType.token5',
  EventMeetUpTicket: 'schedule.itemType.outingPass',
  EventEtcItem: 'schedule.itemType.item',
  Concentration: 'schedule.itemType.concentration',
};

export default {
  id: 'schedule',
  get title() { return t('schedule.title'); },  icon: 'play',
  needsTarget: false,

  mount(root) {
    return gate(root, { needServer: true }, (root) => {
      const body = el('div', {});
      root.appendChild(body);

      loadInto(body, () => api.eventSchedule(), (body, data) => {
        const events = data.events || [];
        const on = new Set(data.enabled || []);
        const byId = new Map(events.map((e) => [e.id, e]));

        // A rerun and the run it repeats are the same event to a player and only differ by which dates they carry, so they belong on adjacent rows under one heading rather than 89 ids apart in an id-sorted list.
        const families = new Map();
        for (const e of events) {
          const head = byId.has(e.original) ? e.original : e.id;
          if (!families.has(head)) families.set(head, []);
          families.get(head).push(e);
        }
        for (const members of families.values()) members.sort((a, b) => a.iconOrder - b.iconOrder || a.id - b.id);

        const search = input({ placeholder: t('schedule.search.placeholder') });
        const filter = select(FILTERS.map((option) => ({ value: option.value, label: t(option.labelKey) })));
        const sort = select(SORTS.map((option) => ({ value: option.value, label: t(option.labelKey) })));
        const count = el('span', {});
        const tb = el('tbody', {});
        // ticking a box must not re-run the filter under the cursor, so the only thing a toggle repaints is the count and the both-halves-on warnings
        const warns = [];

        const tbl = el('table.tbl', { style: { tableLayout: 'fixed' } }, el('thead', {}, el('tr', {},
          el('th', { text: t('schedule.table.event') }),
          el('th', { text: t('schedule.table.featured'), style: { width: '200px' } }),
          el('th', { text: t('schedule.table.contents'), style: { width: '170px' } }),
          el('th', { text: t('schedule.table.ran'), style: { width: '118px' } }),
          el('th', { text: t('schedule.table.lobby'), style: { width: '58px' } }),
          el('th', { text: t('schedule.table.open'), style: { width: '64px' } }))));
        tbl.appendChild(tb);

        const list = el('div.list-scroll', { style: { maxHeight: '52vh' } }, tbl);
        const applyBtn = button(t('schedule.action.apply'), { variant: 'primary', iconName: 'save', sm: true, onClick: apply });
        const clearBtn = button(t('schedule.action.closeEverything'), { variant: 'ghost', iconName: 'refresh', sm: true, onClick: closeAll });
        const card = el('div.card', {},
          el('div.card-head', { style: { flexWrap: 'wrap', rowGap: '8px' } }, el('span.tab-mark', {}), el('h3', { text: t('schedule.card.title') }),
            el('span.sub', { text: t('schedule.card.clientVersionCount', { count: events.length }) }), el('div.spacer', {}), count, applyBtn, clearBtn),
          el('div.card-body', { style: { paddingBottom: '8px' } },
            el('div.row.wrap', { style: { gap: '10px' } },
              el('div', { style: { flex: '1', minWidth: '220px' } }, field(t('schedule.search.label'), search)),
              el('div', { style: { width: '190px' } }, field(t('schedule.filter.label'), filter)),
              el('div', { style: { width: '160px' } }, field(t('schedule.sort.label'), sort)))),
          list);

        body.appendChild(card);
        body.appendChild(el('p.muted', { text: t('schedule.description'), style: { fontSize: '12px', margin: '14px 2px 0', lineHeight: '1.6' } }));

        search.addEventListener('input', paint);
        filter.addEventListener('change', paint);
        sort.addEventListener('change', paint);
        paint();

        function matches(e) {
          const q = search.value.trim().toLowerCase();
          const f = filter.value;
          if (f === 'minigame' && !minigames(e).length) return false;
          if (f === 'on' && !on.has(e.id)) return false;
          if (f === 'rerun' && !e.isReturn) return false;
          if (f === 'rail' && !e.rail) return false;
          if (f === 'unnamed' && !e.name.startsWith('Event #')) return false;
          if (!q) return true;
          return String(e.id).includes(q)
            || String(e.original || '').includes(q)
            || (e.name || '').toLowerCase().includes(q)
            || (e.key || '').toLowerCase().includes(q)
            || (e.students || []).some((s) => s.toLowerCase().includes(q))
            || (e.currency || []).some((c) => c.toLowerCase().includes(q))
            || e.types.some((type) => type.toLowerCase().includes(q) || minigameTypeLabel(type).toLowerCase().includes(q));
        }

        function paint() {
          clear(tb);
          warns.length = 0;

          const shown = [];
          for (const [rootId, members] of families) {
            const hit = members.filter(matches);
            if (hit.length) shown.push([rootId, hit]);
          }

          const dir = sort.value;
          shown.sort(([, a], [, b]) => {
            if (dir === 'name') return (a[0].name || '').localeCompare(b[0].name || '');
            // IconOrder counts down as events get newer, so ascending is newest-first.
            const key = (m) => Math.min(...m.map((x) => x.iconOrder));
            return dir === 'old' ? key(b) - key(a) : key(a) - key(b);
          });

          paintCount();

          if (!shown.length) { tb.appendChild(el('tr', {}, el('td', { colSpan: 6 }, emptyState(t('schedule.empty.noMatches'))))); return; }

          for (const [, members] of shown) {
            members.forEach((e, i) => tb.appendChild(row(e, i > 0, members)));
          }
        }

        function row(e, indented, family) {
          const mg = minigames(e);
          const contents = mg.length ? mg : (e.stages ? [t('schedule.event.stageCount', { count: e.stages })] : []);
          const featured = (e.students || []).length ? e.students.join(', ') : (e.currency || []).join(', ');
          const tag = e.isReturn ? t('schedule.event.rerun') : e.releaseType !== 'None' ? t('schedule.event.permanent') : '';

          const tr = frag(`<tr>
            <td style="max-width:0;${indented ? 'padding-left:26px' : ''}"><b style="font-family:var(--font-round);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block">${escapeHtml(e.name)}</b><div class="muted" data-sub style="font-size:11px"><span data-selectable>#${e.id}</span>${tag ? ` - ${escapeHtml(tag)}` : ''}</div></td>
            <td class="muted" style="font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(featured || '-')}</td>
            <td class="muted" style="font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(contents.length ? [...new Set(contents)].join(', ') : t('schedule.event.storyOnly'))}</td>
            <td class="muted" style="font-size:11.5px;white-space:nowrap">${fmt(e.open)}<br>→ ${fmt(e.close)}</td>
            <td style="font-size:11px">${e.rail ? `<span class="pill">${escapeHtml(t('schedule.event.icon'))}</span>` : `<span class="muted">${escapeHtml(t('schedule.event.menuOnly'))}</span>`}</td>
            <td style="text-align:right"></td></tr>`);

          if (!indented && family.length > 1) {
            const warn = el('span', {});
            tr.querySelector('[data-sub]').appendChild(warn);
            const refresh = () => {
              clear(warn);
              if (family.filter((m) => on.has(m.id)).length > 1)
                warn.appendChild(el('span.pill.warn', { text: t('schedule.warning.twoRuns'), style: { marginLeft: '6px' } }));
            };
            refresh();
            warns.push(refresh);
          }

          const sw = toggle(on.has(e.id), (isOn) => {
            if (isOn) on.add(e.id); else on.delete(e.id);
            warns.forEach((f) => f());
            paintCount();
          });
          sw.addEventListener('click', (ev) => ev.stopPropagation());
          tr.lastElementChild.appendChild(sw);

          tr.style.cursor = 'pointer';
          tr.addEventListener('click', () => openUnlock(e, on.has(e.id)));
          return tr;
        }

        function railCount() {
          let n = 0;
          for (const id of on) { const e = byId.get(id); if (e && e.rail) n++; }
          return n;
        }

        function paintCount() {
          clear(count);
          const rail = railCount();
          const crowded = rail > RAIL_COMFORTABLE;
          const status = on.size
            ? rail
              ? t('schedule.count.forcedOpenOnRail', { count: on.size, rail })
              : t('schedule.count.forcedOpen', { count: on.size })
            : t('schedule.count.shippedDates');
          count.appendChild(el(`span.pill${crowded ? '.warn' : on.size ? '.good' : ''}`,
            { title: crowded ? t('schedule.count.crowdedHint') : '' }, el('span.dot', {}), status));
        }

        async function apply() {
          try {
            const out = await api.setEventSchedule({ enabled: [...on] });
            toast(on.size ? t('schedule.toast.eventsForcedOpen', { count: on.size, rows: out.rows }) : t('schedule.toast.shippedDates'), 'good', t('schedule.toast.clientTableRewritten'));
            notifyRestart();
          } catch (e) { toast(e.message, 'bad'); }
        }

        async function closeAll() {
          const ok = await confirmDialog({ title: t('schedule.close.title'), confirmLabel: t('schedule.close.confirm'),
            message: t('schedule.close.message') });
          if (!ok) return;
          on.clear();
          try {
            await api.setEventSchedule({ enabled: [] });
            toast(t('schedule.toast.shippedDates'), 'good');
            notifyRestart();
            paint();
          } catch (e) { toast(e.message, 'bad'); }
        }
      });
    });
  },
};

// Everything in here is written straight into one account's save, so it is the only part of this page that needs a target - the schedule itself is client-side and account-independent.
function openUnlock(e, isOn) {
  const acc = targetAccount();
  const body = el('div', {});
  const go = button(t('schedule.unlock.action'), { variant: 'primary', iconName: 'check' });
  const cancel = button(t('schedule.unlock.cancel'), { variant: 'ghost' });
  const ref = modal({ title: e.name, body, footer: [cancel, go] });
  cancel.addEventListener('click', ref.close);

  if (!acc) {
    body.appendChild(el('p.muted', { text: t('schedule.unlock.pickAccount'), style: { fontSize: '13.5px', lineHeight: '1.6', margin: '0' } }));
    go.disabled = true;
    return;
  }

  go.disabled = true;
  const amounts = new Map();
  const picks = { stages: false, missions: false, shop: false, collections: false, minigame: false, minigameStages: false };

  loadInto(body, () => api.eventUnlocks(e.id, acc.serverId), (body, d) => {
    go.disabled = false;

    body.appendChild(el('p.muted', {
      text: t(isOn ? 'schedule.unlock.writingTo' : 'schedule.unlock.writingToClosed', { name: acc.nickname, id: acc.serverId }),
      style: { fontSize: '12px', lineHeight: '1.6', margin: '0 0 14px' },
    }));

    if (d.currency.length) {
      const grid = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' } });
      for (const c of d.currency) {
        const box = input({ type: 'number', min: '0', placeholder: '0' });
        amounts.set(c.itemId, box);
        const cost = c.costMax
          ? c.costMin === c.costMax
            ? t('schedule.currency.runCost', { cost: num(c.costMin) })
            : t('schedule.currency.runCostRange', { min: num(c.costMin), max: num(c.costMax) })
          : '';
        grid.appendChild(field(c.name || t('schedule.currency.item', { id: c.itemId }), box,
          t('schedule.currency.hint', { type: itemTypeLabel(c.type), held: num(c.held), cost })));
      }
      body.appendChild(el('div', { style: { marginBottom: '16px' } },
        el('h4', { text: t('schedule.currency.title'), style: { margin: '0 0 8px', fontSize: '13px' } }), grid));
    }

    const rows = [
      d.stages.total && ['stages', t('schedule.unlock.clearStages'), t('schedule.unlock.clearStagesHint', { total: d.stages.total, cleared: d.stages.cleared })],
      d.missions.total && ['missions', t('schedule.unlock.completeMissions'), t('schedule.unlock.completeMissionsHint', { total: d.missions.total, done: d.missions.done })],
      d.shop.total && ['shop', t('schedule.unlock.resetShop'), t('schedule.unlock.resetShopHint', { total: d.shop.total, bought: d.shop.bought })],
      d.collections.total && ['collections', t('schedule.unlock.collection'), t('schedule.unlock.collectionHint', { total: d.collections.total, owned: d.collections.owned })],
      d.minigame.total && ['minigame', t('schedule.unlock.minigame'), t('schedule.unlock.minigameHint', {
        names: d.minigame.names.map(minigameTypeLabel).join(', '), cleared: d.minigame.cleared, total: d.minigame.total,
      })],
      d.minigameStages.total && ['minigameStages', t('schedule.unlock.clearMinigameStages'), t('schedule.unlock.clearMinigameStagesHint', {
        kinds: d.minigameStages.kinds.join(t('schedule.list.and')), total: d.minigameStages.total, cleared: d.minigameStages.cleared,
      })],
    ].filter(Boolean);

    if (!rows.length && !d.currency.length) {
      body.appendChild(emptyState(t('schedule.unlock.emptyTitle'), t('schedule.unlock.emptyDescription')));
      go.disabled = true;
      return;
    }

    for (const [key, label, hint] of rows) {
      const sw = toggle(false, (v) => { picks[key] = v; });
      body.appendChild(el('div.row', { style: { alignItems: 'flex-start', gap: '12px', padding: '10px 0', borderTop: '1px solid var(--line)' } },
        el('div', { style: { flex: '1', minWidth: '0' } },
          el('b', { text: label, style: { fontSize: '13.5px' } }),
          el('div', { text: hint, style: { color: 'var(--ink-2)', fontSize: '11.5px', lineHeight: '1.55', marginTop: '2px' } })),
        sw));
    }
  });

  go.addEventListener('click', async () => {
    const currency = {};
    for (const [id, box] of amounts) {
      const v = Number(box.value) || 0;
      if (v > 0) currency[id] = v;
    }
    if (!Object.keys(currency).length && !Object.values(picks).some(Boolean)) { toast(t('schedule.unlock.nothingSelected'), 'warn'); return; }

    go.disabled = true;
    try {
      const r = await api.eventUnlock({
        accountServerId: acc.serverId, eventContentId: e.id,
        clearStages: picks.stages, completeMissions: picks.missions,
        resetShop: picks.shop, unlockCollections: picks.collections, unlockMinigame: picks.minigame,
        clearMinigames: picks.minigameStages, currency,
      });
      ref.close();
      const done = [
        r.stages && t('schedule.unlock.doneStages', { count: r.stages }),
        r.missions && t('schedule.unlock.doneMissions', { count: r.missions }),
        r.shop && t('schedule.unlock.doneShop', { count: r.shop }),
        r.collections && t('schedule.unlock.doneCollections', { count: r.collections }),
        r.items && t('schedule.unlock.doneItems', { count: r.items }),
        r.minigame && t('schedule.unlock.doneMinigame'),
        r.minigameStages && t('schedule.unlock.doneMinigameStages', { count: r.minigameStages }),
      ].filter(Boolean);
      toast(done.length ? done.join(t('schedule.list.separator')) : t('schedule.unlock.nothingChanged'), done.length ? 'good' : 'warn', e.name);
    } catch (err) { go.disabled = false; toast(err.message, 'bad'); }
  });
}

// The server's minigames list is derived from the type name, which misses the ones whose type reads as a mode rather than a minigame (Conquest, Treasure, Field), so the label falls back to the full type list.
function minigames(e) {
  const named = (e.minigames || []).map(minigameTypeLabel);
  return named.length ? named : e.types.filter((type) => MINIGAME_TYPE_KEYS[type]).map(minigameTypeLabel);
}

function minigameTypeLabel(type) {
  const key = MINIGAME_TYPE_KEYS[type];
  return key ? t(key) : type;
}

function itemTypeLabel(type) {
  const key = ITEM_TYPE_KEYS[type];
  return key ? t(key) : type;
}

function fmt(s) {
  if (!s) return '-';
  // season excel dates may be ISO or "yyyy-MM-dd HH:mm:ss"
  return shortDate(String(s).replace(' ', 'T'));
}
