import { el, frag, clear, button, input, select, field, toast, modal, confirmDialog, notifyRestart, escapeHtml, emptyState } from '../ui.js';
import { api, store, reloadAccounts, CURRENCY_ID, PRIMARY_CURRENCIES } from '../api.js';
import { t } from '../i18n.js';
import { gate, loadInto } from './_util.js';

const CURRENCY_LABEL_KEYS = {
  1: 'accounts.currencies.gold',
  4: 'accounts.currencies.gem',
  5: 'accounts.currencies.actionPoint',
  7: 'accounts.currencies.arenaTicket',
  8: 'accounts.currencies.raidTicket',
  18: 'accounts.currencies.masterCoin',
};

function normalizeCurrencies(dict) {
  const out = {};
  for (const [k, v] of Object.entries(dict || {})) {
    let id = Number(k);
    if (Number.isNaN(id)) id = CURRENCY_ID[k];
    if (id != null) out[id] = Number(v) || 0;
  }
  return out;
}

export default {
  id: 'accounts',
  get title() { return t('nav.accounts'); },  icon: 'users',
  needsTarget: false,

  mount(root) {
    return gate(root, { needServer: true }, (root) => {
      const gameSel = select([], { style: { minWidth: '220px' } });
      gameSel.addEventListener('change', async () => {
        const id = Number(gameSel.value);
        try {
          await api.selectAccount(id);
          gameAccountId = id || null;
          const picked = allRows.find((a) => a.serverId === id);
          toast(id
            ? t('accounts.game.loginNextLaunch', { account: picked ? picked.nickname : id })
            : t('accounts.game.followSteamAgain'), 'good');
          paintList();
        } catch (e) { toast(e.message, 'bad'); fillGameSel(); }
      });
      root.appendChild(el('div.card', { style: { marginBottom: '18px' } },
        el('div.card-body', { style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
          el('b', { text: t('accounts.game.label'), style: { fontFamily: 'var(--font-round)', fontSize: '13px' } }),
          gameSel,
          el('span.muted', { text: t('accounts.game.appliesNextLaunch'), style: { fontSize: '12px' } }))));

      const layout = el('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.25fr)', gap: '18px', alignItems: 'start' } });
      const listCard = el('div.card', { style: { minWidth: '0' } });
      const detailCard = el('div.card', { style: { minWidth: '0' } });
      layout.appendChild(listCard);
      layout.appendChild(detailCard);
      root.appendChild(layout);

      const searchInput = input({ placeholder: t('accounts.filterPlaceholder'), className: 'input btn-sm', style: { height: '32px', width: '130px', minWidth: '0', flex: '0 1 130px' } });
      const createBtn = button(t('accounts.new'), { variant: 'primary', sm: true, iconName: 'plus', onClick: openCreate });
      const refreshBtn = button('', { variant: 'ghost', sm: true, iconName: 'refresh', onClick: loadList });

      listCard.appendChild(el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: t('accounts.roster') }),
        el('div.spacer', {}), searchInput, refreshBtn, createBtn));
      const listBody = el('div.list-scroll', { style: { maxHeight: '64vh' } });
      listCard.appendChild(listBody);

      let allRows = [];
      let gameAccountId = null;
      searchInput.addEventListener('input', () => paintList());

      function paintList() {
        const q = searchInput.value.trim().toLowerCase();
        const rows = allRows.filter((a) => !q || a.nickname.toLowerCase().includes(q) || String(a.serverId).includes(q));
        clear(listBody);
        if (!rows.length) { listBody.appendChild(emptyState(t(q ? 'accounts.noMatch' : 'accounts.noAccounts'))); return; }
        const tbl = frag(`<table class="tbl" style="table-layout:fixed"><thead><tr><th style="width:74px">${escapeHtml(t('accounts.columns.id'))}</th><th>${escapeHtml(t('accounts.columns.nickname'))}</th><th style="width:54px">${escapeHtml(t('accounts.columns.levelShort'))}</th></tr></thead><tbody></tbody></table>`);
        const tb = tbl.querySelector('tbody');
        for (const a of rows) {
          const inGame = a.serverId === gameAccountId ? `<span class="tag" style="flex:none">${escapeHtml(t('accounts.inGame'))}</span>` : '';
          const tr = frag(`<tr><td class="num" data-selectable>${a.serverId}</td><td style="max-width:0"><div style="display:flex;align-items:center;gap:6px;min-width:0"><b data-selectable style="font-family:var(--font-round);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(a.nickname)}</b>${inGame}</div></td><td class="num">${a.level}</td></tr>`);
          if (a.serverId === store.get().targetId) tr.classList.add('sel');
          tr.addEventListener('click', () => { store.set({ targetId: a.serverId }); paintList(); loadDetail(a.serverId); });
          tb.appendChild(tr);
        }
        listBody.appendChild(tbl);
      }

      function fillGameSel() {
        clear(gameSel);
        for (const o of [{ value: 0, label: t('accounts.game.followSteamAccount') }, ...allRows.map((a) => ({ value: a.serverId, label: `${a.nickname} (#${a.serverId})` }))]) {
          const opt = document.createElement('option');
          opt.value = o.value;
          opt.textContent = o.label;
          gameSel.appendChild(opt);
        }
        gameSel.value = String(gameAccountId || 0);
      }

      async function loadList() {
        listBody.innerHTML = `<div class="empty"><div class="spinner"></div></div>`;
        allRows = await reloadAccounts();
        gameAccountId = await api.selectedAccount().then((r) => r.selectedAccountId || null).catch(() => null);
        fillGameSel();
        paintList();
        const targetId = store.get().targetId;
        if (targetId) loadDetail(targetId); else showDetailPlaceholder();
      }

      function showDetailPlaceholder() {
        clear(detailCard);
        detailCard.appendChild(el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: t('accounts.detail.title') })));
        detailCard.appendChild(emptyState(t('accounts.detail.selectAccount')));
      }

      async function loadDetail(id) {
        clear(detailCard);
        detailCard.appendChild(el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: t('accounts.detail.title') }),
          el('span.sub', { text: `#${id}`, 'data-selectable': '' })));
        const body = el('div.card-body', {});
        detailCard.appendChild(body);
        await loadInto(body, () => api.accountDetail(id), (body, d) => renderDetail(body, d));
      }

      function renderDetail(body, d) {
        const fNick = input({ value: d.nickname || '' });
        const fComment = input({ value: d.comment || '' });
        const fLevel = input({ value: d.level ?? 1, type: 'number' });
        const fExp = input({ value: d.exp ?? 0, type: 'number' });
        const fVip = input({ value: d.vipLevel ?? 0, type: 'number' });

        const idGrid = el('div.grid-2', {},
          field(t('accounts.fields.nickname'), fNick),
          field(t('accounts.fields.comment'), fComment),
          field(t('accounts.fields.level'), fLevel),
          field(t('accounts.fields.experience'), fExp),
          field(t('accounts.fields.vipLevel'), fVip));
        body.appendChild(idGrid);
        const saveId = button(t('accounts.saveIdentity'), { variant: 'primary', iconName: 'save', onClick: async () => {
          const r = await api.accountUpdate({ serverId: d.serverId, nickname: fNick.value, comment: fComment.value, level: Number(fLevel.value), exp: Number(fExp.value), vipLevel: Number(fVip.value) }).then(() => ({ ok: true })).catch((e) => ({ ok: false, error: e.message }));
          toast(r.ok ? t('accounts.updated') : r.error, r.ok ? 'good' : 'bad');
          if (r.ok) { notifyRestart(); reloadAccounts().then((rows) => { allRows = rows; paintList(); }); }
        }});
        body.appendChild(el('div', { style: { marginTop: '4px' } }, saveId));

        body.appendChild(frag('<div class="hazard" style="margin:20px 0 16px"></div>'));
        body.appendChild(el('div', { text: t('accounts.currencies.title'), style: { fontSize: '12px', fontWeight: '600', color: 'var(--ink-2)', margin: '0 0 10px' } }));
        const cur = normalizeCurrencies(d.currencies);
        const curGrid = el('div.grid-2', {});
        const edits = {};
        for (const cid of PRIMARY_CURRENCIES) {
          const i = input({ value: cur[cid] ?? 0, type: 'number' });
          edits[cid] = { input: i, orig: cur[cid] ?? 0 };
          curGrid.appendChild(field(t(CURRENCY_LABEL_KEYS[cid]), i));
        }
        body.appendChild(curGrid);
        const saveCur = button(t('accounts.currencies.apply'), { variant: 'primary', iconName: 'coin', onClick: async () => {
          let n = 0;
          for (const [cid, e] of Object.entries(edits)) {
            const val = Number(e.input.value);
            if (val !== e.orig) { await api.setCurrency({ accountServerId: d.serverId, currencyType: Number(cid), amount: val }); e.orig = val; n++; }
          }
          toast(n
            ? t(n === 1 ? 'accounts.currencies.updatedOne' : 'accounts.currencies.updatedMany', { count: n })
            : t('accounts.noChanges'), n ? 'good' : 'warn');
          if (n) notifyRestart();
        }});
        body.appendChild(el('div.row.wrap', { style: { marginTop: '4px', gap: '10px' } },
          saveCur,
          button(t('accounts.currencies.maxAll'), { variant: 'ghost', onClick: () => maxCurrencies(d.serverId, edits) })));

        body.appendChild(frag('<div class="hazard" style="margin:20px 0 16px"></div>'));
        body.appendChild(el('div', { text: t('accounts.actions.title'), style: { fontSize: '12px', fontWeight: '600', color: 'var(--ink-2)', margin: '0 0 10px' } }));
        const tools = el('div.row.wrap', { style: { gap: '10px' } });
        tools.appendChild(cmdButton(d.serverId, t('accounts.actions.maxAllCharacters'), 'max all'));
        tools.appendChild(cmdButton(d.serverId, t('accounts.actions.unlockAllCharacters'), 'giveall'));
        tools.appendChild(cmdButton(d.serverId, t('accounts.actions.unlockCampaignStory'), ['unlockall campaign', 'unlockall story']));
        tools.appendChild(cmdButton(d.serverId, t('accounts.actions.unlockBattlepass'), 'unlockall battlepass'));
        body.appendChild(tools);

        body.appendChild(frag(`<div class="muted" style="font-size:12px;margin-top:18px">${escapeHtml(t('accounts.summary', { items: d.itemCount, characters: d.characterCount, mails: d.mailCount, state: d.state || '' }))}</div>`));
        const del = button(t('accounts.delete.label'), { variant: 'danger', iconName: 'trash', onClick: async () => {
          const ok = await confirmDialog({ title: t('accounts.delete.label'), danger: true, confirmLabel: t('accounts.delete.permanently'),
            message: t('accounts.delete.message', { nickname: d.nickname, id: d.serverId }) });
          if (!ok) return;
          try { await api.accountDelete(d.serverId); toast(t('accounts.delete.deleted'), 'warn'); store.set({ targetId: null }); loadList(); }
          catch (e) { toast(e.message, 'bad'); }
        }});
        body.appendChild(el('div', { style: { marginTop: '16px' } }, del));
      }

      function cmdButton(uid, label, command) {
        const commands = Array.isArray(command) ? command : [command];
        return button(label, { variant: 'ghost', sm: true, onClick: async () => {
          try { for (const c of commands) await api.command(uid, c); toast(label, 'good'); notifyRestart(); }
          catch (e) { toast(e.message, 'bad'); }
        }});
      }
      async function maxCurrencies(id, edits) {
        const MAX = 999999999;
        for (const [cid, e] of Object.entries(edits)) { await api.setCurrency({ accountServerId: id, currencyType: Number(cid), amount: MAX }); e.input.value = MAX; e.orig = MAX; }
        toast(t('accounts.currencies.maxed'), 'good');
        notifyRestart();
      }

      function openCreate() {
        const nick = input({ value: 'Sensei' });
        const create = button(t('accounts.create.label'), { variant: 'primary', iconName: 'plus' });
        const cancel = button(t('common.cancel'), { variant: 'ghost' });
        const ref = modal({ title: t('accounts.create.title'), body: el('div', {}, field(t('accounts.fields.nickname'), nick)),
          footer: [cancel, create] });
        cancel.addEventListener('click', ref.close);
        create.addEventListener('click', async () => {
          create.disabled = true;
          try {
            const r = await api.accountCreate({ nickname: nick.value.trim() || 'Sensei' });
            ref.close(); toast(t('accounts.create.created', { nickname: nick.value, id: r.serverId }), 'good');
            store.set({ targetId: r.serverId });
            await loadList();
          } catch (e) { toast(e.message, 'bad'); create.disabled = false; }
        });
      }

      loadList();
    });
  },
};
