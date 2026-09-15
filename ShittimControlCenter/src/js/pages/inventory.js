import { el, frag, clear, button, input, field, toast, modal, confirmDialog, notifyRestart, openPicker, promptAmount, num, escapeHtml, emptyState } from '../ui.js';
import { api, targetAccount } from '../api.js';
import { t } from '../i18n.js';
import { gate, loadInto } from './_util.js';

export default {
  id: 'inventory',
  get title() { return t('nav.inventory'); },  icon: 'inventory',
  needsTarget: true,

  mount(root) {
    return gate(root, { needServer: true, needTarget: true }, (root) => {
      const acc = targetAccount();
      const uid = acc.serverId;
      const maxCharsBtn = button(t('inventory.bulk.maxCharacters'), {
        variant: 'ghost', sm: true, iconName: 'star', onClick: maxAllCharacters,
      });

      const bulk = el('div.card', { style: { marginBottom: '18px' } },
        el('div.card-head', { style: { flexWrap: 'wrap', rowGap: '4px' } }, el('span.tab-mark', {}), el('h3', { text: t('inventory.bulk.title') }),
          el('span.sub', { style: { minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            `${t('inventory.bulk.forAccount', { nickname: acc.nickname })} - `,
            el('span.mono', { text: `#${uid}`, 'data-selectable': '' }))),
        el('div.card-body', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', minWidth: '0' } },
          cmdBtn(uid, t('inventory.bulk.allItems'), 'box', 'inventory add items', 'ghost', () => reloadItems()),
          cmdBtn(uid, t('inventory.bulk.allEquipment'), 'shield', 'giveallequip', 'ghost'),
          cmdBtn(uid, t('inventory.bulk.allCharacters'), 'users', 'giveall', 'ghost', () => reloadChars()),
          maxCharsBtn,
          dangerCmd(uid, t('inventory.bulk.clearInventory'), 'trash', 'clearinventory', () => reloadItems())));
      root.appendChild(bulk);

      const grid = el('div.grid-2', { style: { alignItems: 'start' } });
      root.appendChild(grid);

      const itemSearch = input({ placeholder: t('inventory.filterPlaceholder'), className: 'input btn-sm', style: { height: '32px', width: '120px', minWidth: '0', flex: '0 1 120px' } });
      const giveItemBtn = button(t('inventory.items.give'), { variant: 'primary', sm: true, iconName: 'plus', onClick: giveItem });
      const itemsCard = el('div.card', {},
        el('div.card-head', { style: { flexWrap: 'wrap', rowGap: '8px' } }, el('span.tab-mark', {}), el('h3', { text: t('inventory.items.title') }),
          el('div.spacer', {}), itemSearch, giveItemBtn));
      const itemsBody = el('div.list-scroll', { style: { maxHeight: '58vh' } });
      itemsCard.appendChild(itemsBody);
      grid.appendChild(itemsCard);
      let itemRows = [];
      itemSearch.addEventListener('input', paintItems);

      function paintItems() {
        const q = itemSearch.value.trim().toLowerCase();
        const rows = itemRows.filter((r) => !q || r.name.toLowerCase().includes(q) || String(r.uniqueId).includes(q));
        clear(itemsBody);
        if (!rows.length) { itemsBody.appendChild(emptyState(t('inventory.items.empty'))); return; }
        // 64px = 36px trash button + the 28px of cell padding (border-box) - narrower and the button overflows the fixed column, dragging a horizontal scrollbar into the list
        const tbl = frag(`<table class="tbl" style="table-layout:fixed"><thead><tr><th style="width:74px">${escapeHtml(t('inventory.columns.id'))}</th><th>${escapeHtml(t('inventory.columns.name'))}</th><th style="width:72px">${escapeHtml(t('inventory.columns.quantityShort'))}</th><th style="width:64px"></th></tr></thead><tbody></tbody></table>`);
        const tb = tbl.querySelector('tbody');
        for (const r of rows) {
          const tr = frag(`<tr><td class="num mono" data-selectable>${r.uniqueId}</td><td style="min-width:0;max-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</td><td class="num">${num(r.stackCount)}</td><td></td></tr>`);
          const x = button('', { variant: 'ghost', sm: true, iconName: 'trash' });
          x.style.height = '26px'; x.style.padding = '0 8px';
          x.addEventListener('click', async (e) => { e.stopPropagation(); await api.removeItem({ accountServerId: uid, uniqueId: r.uniqueId }); toast(t('inventory.items.removed'), 'warn'); notifyRestart(); reloadItems(); });
          tr.lastElementChild.appendChild(x);
          tb.appendChild(tr);
        }
        itemsBody.appendChild(tbl);
      }
      async function reloadItems() { await loadInto(itemsBody, () => api.items(uid), (_b, rows) => { itemRows = rows; paintItems(); }); }

      function giveItem() {
        openPicker({ title: t('inventory.items.pick'), loader: (q) => api.staticItems(q).then((r) => r.map((x) => ({ id: x.id, name: x.name, sub: x.icon }))),
          onPick: (it) => promptAmount({ title: t('inventory.items.giveNamed', { name: it.name }), confirmLabel: t('inventory.items.grant'), onConfirm: async (amount) => {
            await api.giveItem({ accountServerId: uid, uniqueId: it.id, amount });
            toast(t('inventory.items.gave', { amount: num(amount), name: it.name }), 'good'); notifyRestart(); reloadItems();
          } }) });
      }

      const charSearch = input({ placeholder: t('inventory.filterPlaceholder'), className: 'input btn-sm', style: { height: '32px', width: '120px', minWidth: '0', flex: '0 1 120px' } });
      const addCharBtn = button(t('inventory.characters.addCharacter'), { variant: 'primary', sm: true, iconName: 'plus', onClick: addChar });
      const charsCard = el('div.card', {},
        el('div.card-head', { style: { flexWrap: 'wrap', rowGap: '8px' } }, el('span.tab-mark', {}), el('h3', { text: t('inventory.characters.title') }),
          el('div.spacer', {}), charSearch, addCharBtn));
      const charsBody = el('div.list-scroll', { style: { maxHeight: '58vh' } });
      charsCard.appendChild(charsBody);
      grid.appendChild(charsCard);
      let charRows = [];
      charSearch.addEventListener('input', paintChars);

      function paintChars() {
        const q = charSearch.value.trim().toLowerCase();
        const rows = charRows.filter((r) => !q || r.name.toLowerCase().includes(q) || String(r.uniqueId).includes(q));
        clear(charsBody);
        if (!rows.length) { charsBody.appendChild(emptyState(t('inventory.characters.empty'))); return; }
        const tbl = frag(`<table class="tbl" style="table-layout:fixed"><thead><tr><th style="width:74px">${escapeHtml(t('inventory.columns.id'))}</th><th>${escapeHtml(t('inventory.columns.name'))}</th><th style="width:84px">${escapeHtml(t('inventory.columns.grade'))}</th><th style="width:54px">${escapeHtml(t('inventory.columns.levelShort'))}</th></tr></thead><tbody></tbody></table>`);
        const tb = tbl.querySelector('tbody');
        for (const r of rows) {
          const tr = frag(`<tr><td class="num mono" data-selectable>${r.uniqueId}</td><td style="min-width:0;max-width:0"><b style="font-family:var(--font-round);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</b></td><td class="stars"></td><td class="num">${r.level}</td></tr>`);
          tr.title = t('inventory.characters.clickToMax');
          const starCell = tr.querySelector('.stars');
          for (let i = 1; i <= 5; i++) {
            const s = el('span', { text: i <= r.starGrade ? '★' : '☆', title: t('inventory.characters.setStars', { stars: i }), style: { cursor: 'pointer' } });
            s.addEventListener('click', async (e) => {
              e.stopPropagation();
              try { await api.command(uid, `character modify ${r.uniqueId} star ${i}`); toast(t('inventory.characters.starsSet', { name: r.name, stars: i }), 'good'); notifyRestart(); reloadChars(); }
              catch (err) { toast(err.message, 'bad'); }
            });
            starCell.appendChild(s);
          }
          let maxPending = false;
          const confirmMax = async () => {
            if (maxPending || maxCharsBtn.disabled) return;
            maxPending = true;
            try {
              const ok = await confirmDialog({ title: t('inventory.characters.maxStudent'), confirmLabel: t('inventory.characters.maxOut'), message: t('inventory.characters.maxConfirm', { name: r.name }) });
              if (!ok) return;
              await maxCharacter(r);
              toast(t('inventory.characters.maxed', { name: r.name }), 'good');
              await reloadChars();
            } catch (err) { toast(err.message, 'bad'); }
            finally { maxPending = false; }
          };
          tr.addEventListener('click', confirmMax);
          tb.appendChild(tr);
        }
        charsBody.appendChild(tbl);
      }
      async function reloadChars() { await loadInto(charsBody, () => api.characters(uid), (_b, rows) => { charRows = rows; paintChars(); }); }

      // Both entry points perform exactly the action confirmed by "Max out".
      async function maxCharacter(character) {
        const target = character.devName || character.name;
        const result = await api.command(uid, `max ${target}`);
        const output = typeof result?.output === 'string' ? result.output.trim() : '';
        // The command API also returns HTTP 200 / success:true when the command
        // reports "not found" or "You don't own ...". Check its actual result.
        if (result?.success !== true || !output.startsWith(`Maxed out ${target}!`)) {
          throw new Error(output || t('inventory.characters.maxNotConfirmed'));
        }
        notifyRestart();
      }

      async function maxAllCharacters() {
        if (maxCharsBtn.disabled) return;
        maxCharsBtn.disabled = true;
        const label = t('inventory.bulk.maxCharacters');
        const labelEl = maxCharsBtn.querySelector('span');
        try {
          // Fetch the complete roster even if the list is loading or filtered.
          const characters = await api.characters(uid);
          if (!characters.length) { toast(t('inventory.characters.empty'), 'warn'); return; }
          let completed = 0;
          for (const character of characters) {
            labelEl.textContent = `${label} (${completed}/${characters.length})`;
            try {
              await maxCharacter(character);
              completed++;
            } catch (e) {
              toast(`${character.name}: ${e.message}`, 'bad');
            }
          }
          toast(`${label} (${completed}/${characters.length})`, completed === characters.length ? 'good' : 'warn');
          await reloadChars();
        } catch (e) {
          toast(e.message, 'bad');
        } finally {
          labelEl.textContent = label;
          maxCharsBtn.disabled = false;
        }
      }

      function addChar() {
        openPicker({ title: t('inventory.characters.pick'), loader: (q) => api.staticCharacters(q).then((r) => r.map((x) => ({ id: x.id, name: x.name, sub: `★${x.maxStar}` }))),
          onPick: (it) => {
            const lvl = input({ value: 'max' });
            const add = button(t('common.add'), { variant: 'primary', iconName: 'plus' });
            const cancel = button(t('common.cancel'), { variant: 'ghost' });
            const ref = modal({ title: t('inventory.characters.addNamed', { name: it.name }), body: el('div', {}, field(t('inventory.characters.preset'), lvl, 'barebone - basic - ue30 - ue50 - max')), footer: [cancel, add] });
            cancel.addEventListener('click', ref.close);
            add.addEventListener('click', async () => {
              const opt = (lvl.value.trim() || 'max').toLowerCase();
              try { await api.command(uid, `character add ${it.id} ${opt}`); ref.close(); toast(t('inventory.characters.added', { name: it.name }), 'good'); notifyRestart(); reloadChars(); }
              catch (e) { toast(e.message, 'bad'); }
            });
          } });
      }

      reloadItems();
      reloadChars();

      function cmdBtn(uid, label, ic, command, variant, after) {
        return button(label, { variant, sm: true, iconName: ic, onClick: async () => {
          try { await api.command(uid, command); toast(label, 'good'); notifyRestart(); after && after(); }
          catch (e) { toast(e.message, 'bad'); }
        }});
      }
      function dangerCmd(uid, label, ic, command, after) {
        return button(label, { variant: 'danger', sm: true, iconName: ic, onClick: async () => {
          const ok = await confirmDialog({ title: label, danger: true, confirmLabel: label, message: t('inventory.clearConfirm') });
          if (!ok) return;
          try { await api.command(uid, command); toast(label, 'warn'); notifyRestart(); after && after(); }
          catch (e) { toast(e.message, 'bad'); }
        }});
      }
    });
  },
};
