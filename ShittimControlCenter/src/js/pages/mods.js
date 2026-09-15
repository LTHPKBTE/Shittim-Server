import { el, frag, clear, button, input, field, toast, confirmDialog, modal, openPicker, escapeHtml } from '../ui.js';
import { api } from '../api.js';
import { gate } from './_util.js';
import { t } from '../i18n.js';

const SECTIONS = [
  { id: 'characters', name: () => t('mods.customCharacters'), desc: () => t('mods.customCharactersDescription') },
];

export default {
  id: 'mods',
  get title() { return t('nav.mods'); },  icon: 'flask',
  needsTarget: false,

  mount(root) {
    let view = 'menu';
    let openId = null;
    let host = null;

    return gate(root, { needServer: true }, (r) => { host = r; paint(); });

    function paint() {
      clear(host);
      if (view === 'menu') menu();
      else if (view === 'characters') characters();
      else editor(openId);
    }

    function go(next, id) { view = next; openId = id; paint(); }

    function menu() {
      const list = el('div.picker-list', {});
      for (const s of SECTIONS) {
        const row = frag(`<div class="picker-item"><span class="pi-name">${escapeHtml(s.name())}</span><span class="muted" style="font-size:12px;flex:2;min-width:0">${escapeHtml(s.desc())}</span></div>`);
        row.addEventListener('click', () => go(s.id));
        list.appendChild(row);
      }
      host.appendChild(el('div.card', {},
        el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: t('nav.mods') }), el('span.sub', { text: t('mods.subtitle') })),
        el('div.card-body', {}, list,
          el('p.muted', { text: t('mods.description'), style: { fontSize: '12px', margin: '12px 0 0', lineHeight: '1.6' } }))));
    }

    function characters() {
      const back = button(t('common.back'), { variant: 'ghost', sm: true, iconName: 'x', onClick: () => go('menu') });
      const add = button(t('mods.addCharacter'), { variant: 'primary', sm: true, iconName: 'plus', onClick: importFlow });
      const body = el('div.card-body', {});
      host.appendChild(el('div.card', {},
        el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: t('mods.customCharacters') }), el('div.spacer', {}), back, add),
        body));

      body.innerHTML = '<div class="empty"><div class="spinner"></div></div>';
      api.modsCharacters().then((data) => {
        clear(body);
        if (!data.characters.length) {
          body.appendChild(el('div.empty', {}, el('b', { text: t('mods.noCustomCharacters') }), el('span', { text: t('mods.noCustomCharactersDescription') })));
        } else {
          const list = el('div.picker-list', {});
          for (const c of data.characters) {
            const assetLabel = c.assets.length === 1
              ? t('mods.fileCountOne', { count: c.assets.length })
              : t('mods.fileCountOther', { count: c.assets.length });
            const row = frag(`<div class="picker-item"><span class="pi-id">${c.id}</span><span class="pi-name">${escapeHtml(c.name || t('mods.unnamed'))}</span><span class="tag grey">${escapeHtml(t('mods.fromDonor', { id: c.donorId }))}</span>${c.assets.length ? `<span class="tag">${escapeHtml(assetLabel)}</span>` : ''}</div>`);
            row.addEventListener('click', () => go('editor', c.id));
            list.appendChild(row);
          }
          body.appendChild(list);
        }
        body.appendChild(el('p.muted', { text: data.databases === 1
          ? t('mods.databaseCopiesOne', { count: data.databases })
          : t('mods.databaseCopiesOther', { count: data.databases }),
        style: { fontSize: '12px', margin: '12px 0 0', lineHeight: '1.6' } }));
      }).catch((e) => { body.innerHTML = `<div class="empty"><b>${escapeHtml(t('common.couldNotLoad'))}</b><span>${escapeHtml(String(e.message || e))}</span></div>`; });
    }

    async function importFlow() {
      const zipPath = await window.host.pickFile([{ name: t('mods.characterModFile'), extensions: ['zip'] }]);
      if (!zipPath) return;

      let info;
      try { info = await api.modsInspect(zipPath); }
      catch (e) { toast(e.message, 'bad'); return; }

      let donorId = info.donorId || null;
      let donorName = null;

      const name = input({ value: info.name || '', placeholder: 'Shirakami Suzu' });
      const id = input({ type: 'number', placeholder: t('mods.nextFreeId') });
      const donorLabel = el('div', {});
      const pickDonor = button(t('mods.chooseDonor'), { variant: 'ghost', sm: true, iconName: 'users', onClick: () => {
        openPicker({ title: t('mods.borrowFrom'), loader: (q) => api.staticCharacters(q).then((r) => r.map((x) => ({ id: x.id, name: x.name, sub: `★${x.maxStar}` }))),
          onPick: (it) => { donorId = it.id; donorName = it.name; paintDonor(); } });
      }});
      function paintDonor() {
        clear(donorLabel);
        if (donorId) donorLabel.appendChild(frag(`<div class="chip"><div class="chip-ic">${'★'}</div><div class="chip-main"><b>${escapeHtml(donorName || t('mods.characterWithId', { id: donorId }))}</b><span>${escapeHtml(t('mods.idLabel', { id: donorId }))}</span></div></div>`));
        else donorLabel.appendChild(el('div.muted', { text: t('mods.pickDonorDescription'), style: { fontSize: '12.5px' } }));
      }
      paintDonor();

      const stagedText = info.assets.length === 1
        ? t('mods.stagedAssetsOne', { count: info.assets.length })
        : info.assets.length > 1
          ? t('mods.stagedAssetsOther', { count: info.assets.length })
          : t('mods.noArtInZip');
      const staged = frag(`<p class="muted" style="font-size:12px;margin:12px 0 0;line-height:1.6">${stagedText}</p>`);

      const install = button(t('common.install'), { variant: 'primary', iconName: 'download' });
      const cancel = button(t('common.cancel'), { variant: 'ghost' });
      const ref = modal({
        title: t('mods.addCustomCharacter'), wide: true,
        body: el('div', {},
          field(t('common.name'), name, t('mods.nameHint')),
          el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', margin: '0 0 14px' } }, donorLabel, el('div.spacer', {}), pickDonor),
          field(t('mods.characterId'), id, t('mods.characterIdHint')),
          frag(`<div class="muted mono" data-selectable style="font-size:11px;overflow-wrap:anywhere">${escapeHtml(zipPath)}</div>`),
          staged),
        footer: [cancel, install],
      });
      cancel.addEventListener('click', ref.close);
      install.addEventListener('click', async () => {
        if (!donorId) { toast(t('mods.pickDonorFirst'), 'warn'); return; }
        install.disabled = true;
        try {
          const made = await api.modsImport({ zipPath, donorId, id: id.value ? parseInt(id.value, 10) : null, name: name.value.trim(), overrides: info.overrides || {} });
          ref.close();
          toast(t('mods.installedAs', { name: made.name, id: made.id }), 'good', t('mods.restartServer'));
          paint();
        } catch (e) { install.disabled = false; toast(e.message, 'bad'); }
      });
    }

    function editor(id) {
      const back = button(t('common.back'), { variant: 'ghost', sm: true, iconName: 'x', onClick: () => go('characters') });
      const body = el('div.card-body', {});
      const head = el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: t('mods.characterWithId', { id }) }), el('div.spacer', {}), back);
      host.appendChild(el('div.card', {}, head, body));

      body.innerHTML = '<div class="empty"><div class="spinner"></div></div>';
      api.modsCharacter(id).then((d) => {
        clear(body);
        head.querySelector('h3').textContent = t('mods.characterEditorTitle', { name: d.name || t('mods.unnamed'), id });

        const name = input({ value: d.name || '' });
        const inputs = { character: {}, profile: {}, stat: {} };

        function group(title, values, bag, numeric) {
          if (!values) return null;
          const grid = el('div.grid-3', {});
          for (const [key, value] of Object.entries(values)) {
            const box = input({ value: value == null ? '' : value, type: numeric ? 'number' : 'text' });
            bag[key] = { box, was: value == null ? '' : String(value) };
            grid.appendChild(field(key, box));
          }
          return el('div', {}, el('div', { text: title, style: { fontSize: '13px', fontWeight: '600', margin: '18px 0 10px' } }), grid);
        }

        body.appendChild(field(t('mods.displayName'), name, t('mods.displayNameHint')));
        body.appendChild(el('div', {},
          group(t('mods.group.character'), d.character, inputs.character, false),
          group(t('mods.group.profile'), d.profile, inputs.profile, false),
          group(t('mods.group.stats'), d.stat, inputs.stat, true)));

        const save = button(t('common.save'), { variant: 'primary', iconName: 'save', onClick: async () => {
          const payload = { name: name.value.trim() };
          for (const part of ['character', 'profile', 'stat']) {
            const changed = {};
            for (const [key, held] of Object.entries(inputs[part])) {
              if (held.box.value !== held.was) changed[key] = held.box.value;
            }
            if (Object.keys(changed).length) payload[part] = changed;
          }
          save.disabled = true;
          try {
            await api.modsUpdate(id, payload);
            toast(t('mods.savedRestartRequired'), 'good');
            go('characters');
          } catch (e) { save.disabled = false; toast(e.message, 'bad'); }
        }});
        const remove = button(t('mods.deleteCharacter'), { variant: 'danger', iconName: 'trash', onClick: async () => {
          const ok = await confirmDialog({ title: t('mods.deleteCharacter'), confirmLabel: t('common.delete'), danger: true,
            message: t('mods.deleteCharacterConfirm', { id }) });
          if (!ok) return;
          try { await api.modsRemove(id); toast(t('common.deleted'), 'warn'); go('characters'); }
          catch (e) { toast(e.message, 'bad'); }
        }});

        body.appendChild(el('div.row.wrap', { style: { gap: '10px', marginTop: '20px' } }, save, remove, el('div.spacer', {}),
          d.assets.length ? el('span.tag.grey', { text: d.assets.length === 1
            ? t('mods.stagedFileCountOne', { count: d.assets.length })
            : t('mods.stagedFileCountOther', { count: d.assets.length }) }) : null,
          d.donorId ? el('span.tag', { text: t('mods.clonedFrom', { id: d.donorId }) }) : null));
      }).catch((e) => { body.innerHTML = `<div class="empty"><b>${escapeHtml(t('common.couldNotLoad'))}</b><span>${escapeHtml(String(e.message || e))}</span></div>`; });
    }
  },
};
