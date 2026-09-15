import { el, frag, clear, button, input, textarea, select, field, toast, confirmDialog, openPicker, promptAmount, num, shortDate, escapeHtml, emptyState } from '../ui.js';
import { icon } from '../icons.js';
import { api, targetAccount } from '../api.js';
import { t } from '../i18n.js';
import { gate, loadInto } from './_util.js';

const PARCEL_KINDS = [
  { value: 'Item', labelKey: 'mail.parcel.item', loader: (q) => api.staticItems(q), amount: true },
  { value: 'Currency', labelKey: 'mail.parcel.currency', loader: () => api.staticCurrencies(), amount: true },
  { value: 'Equipment', labelKey: 'mail.parcel.equipment', loader: (q) => api.staticEquipment(q), amount: true },
  { value: 'Character', labelKey: 'mail.parcel.character', loader: (q) => api.staticCharacters(q), amount: false },
];

function parcelLabel(type) {
  const kind = PARCEL_KINDS.find((entry) => entry.value === type);
  return kind ? t(kind.labelKey) : type;
}

export default {
  id: 'mail',
  get title() { return t('nav.mail'); },  icon: 'mail',
  needsTarget: true,

  mount(root) {
    return gate(root, { needServer: true, needTarget: true }, (root) => {
      const acc = targetAccount();
      const uid = acc.serverId;
      const rewards = [];

      const layout = el('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '18px', alignItems: 'start' } });
      root.appendChild(layout);

      const fSender = input({ value: 'Plana' });
      const fComment = textarea({ value: t('mail.defaultMessage') });
      const fExpire = input({ value: 30, type: 'number' });

      const kindSel = select(PARCEL_KINDS.map((k) => ({ value: k.value, label: t(k.labelKey) })));
      const addReward = button(t('mail.addReward'), { variant: 'ghost', sm: true, iconName: 'plus', onClick: pickReward });
      const chipList = el('div.chips', {});
      paintChips();

      const sendBtn = button(t('mail.send'), { variant: 'primary', iconName: 'send', onClick: send });

      const composer = el('div.card', { style: { minWidth: '0' } },
        el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: t('mail.compose') }),
          el('span.sub', { text: t('mail.toAccount', { nickname: acc.nickname, id: uid }), style: { minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } })),
        el('div.card-body', {},
          field(t('mail.fields.sender'), fSender),
          field(t('mail.fields.message'), fComment),
          field(t('mail.fields.expiresDays'), fExpire),
          frag('<div class="hazard" style="margin:6px 0 14px"></div>'),
          el('div', { text: t('mail.attachments.title'), style: { fontSize: '12px', fontWeight: '600', color: 'var(--ink-2)', margin: '0 0 10px' } }),
          el('div.input-row', { style: { marginBottom: '12px' } }, kindSel, addReward),
          chipList,
          el('div', { style: { marginTop: '16px' } }, sendBtn)));
      layout.appendChild(composer);

      function pickReward() {
        const kind = PARCEL_KINDS.find((k) => k.value === kindSel.value);
        openPicker({ title: t('mail.pick', { kind: t(kind.labelKey).toLocaleLowerCase() }),
          loader: (q) => kind.loader(q).then((r) => r.map((x) => ({ id: x.id, name: x.name, sub: x.icon || x.devName }))),
          onPick: (it) => {
            const add = (amount) => { rewards.push({ type: kind.value, id: it.id, name: it.name, amount }); paintChips(); };
            if (kind.amount) promptAmount({ title: t('mail.addNamed', { name: it.name }), confirmLabel: t('common.add'), onConfirm: add });
            else add(1);
          } });
      }
      function paintChips() {
        clear(chipList);
        if (!rewards.length) { chipList.appendChild(frag(`<div class="muted" style="font-size:12.5px;padding:6px 2px">${escapeHtml(t('mail.attachments.none'))}</div>`)); return; }
        rewards.forEach((r, i) => {
          const chip = frag(`<div class="chip"><div class="chip-ic">${icon(r.type === 'Currency' ? 'coin' : r.type === 'Character' ? 'users' : r.type === 'Equipment' ? 'shield' : 'box')}</div>
            <div class="chip-main"><b>${escapeHtml(r.name)}</b><span data-selectable>${escapeHtml(t('mail.attachments.meta', { type: parcelLabel(r.type), id: r.id, amount: num(r.amount) }))}</span></div></div>`);
          const x = frag('<button class="chip-x">✕</button>');
          x.addEventListener('click', () => { rewards.splice(i, 1); paintChips(); });
          chip.appendChild(x);
          chipList.appendChild(chip);
        });
      }
      async function send() {
        if (!rewards.length) { toast(t('mail.attachments.required'), 'warn'); return; }
        const days = Math.max(1, Number(fExpire.value) || 30);
        const expireDate = new Date(Date.now() + days * 86400000).toISOString();
        sendBtn.disabled = true;
        try {
          await api.sendMail({ accountServerId: uid, sender: fSender.value || 'Plana', comment: fComment.value,
            parcels: rewards.map((r) => ({ type: r.type, id: r.id, amount: r.amount })), expireDate });
          toast(t('mail.sent'), 'good');
          rewards.length = 0; paintChips(); reloadInbox();
        } catch (e) { toast(e.message, 'bad'); }
        sendBtn.disabled = false;
      }

      const clearBtn = button(t('mail.inbox.clearAll'), { variant: 'ghost', sm: true, iconName: 'trash', onClick: async () => {
        const ok = await confirmDialog({ title: t('mail.inbox.clear'), danger: true, confirmLabel: t('mail.inbox.deleteAll'), message: t('mail.inbox.clearConfirm') });
        if (!ok) return;
        try { await api.deleteMail({ accountServerId: uid, clearAll: true }); toast(t('mail.inbox.cleared'), 'warn'); reloadInbox(); }
        catch (e) { toast(e.message, 'bad'); }
      }});
      const refreshBtn = button('', { variant: 'ghost', sm: true, iconName: 'refresh', onClick: () => reloadInbox() });
      const inboxCard = el('div.card', { style: { minWidth: '0' } },
        el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: t('mail.inbox.title') }), el('div.spacer', {}), refreshBtn, clearBtn));
      const inboxBody = el('div.list-scroll', { style: { maxHeight: '66vh' } });
      inboxCard.appendChild(inboxBody);
      layout.appendChild(inboxCard);

      async function reloadInbox() {
        await loadInto(inboxBody, () => api.mails(uid), (body, mails) => {
          if (!mails.length) { body.appendChild(emptyState(t('mail.inbox.empty'))); return; }
          const wrap = el('div', { style: { padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' } });
          for (const m of mails) {
            const parcels = (m.parcels || []).map((p) => `<span class="tag grey" data-selectable>${escapeHtml(t('mail.inbox.parcel', { type: parcelLabel(p.type), id: p.id, amount: num(p.amount) }))}</span>`).join(' ');
            const card = frag(`<div class="banner-card" style="gap:8px">
              <div class="bc-top"><b style="font-family:var(--font-round);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(m.sender)}</b>
                <span class="bc-id mono" data-selectable>#${m.serverId}</span><div class="spacer" style="flex:1"></div>
                <span class="pill ${m.collected ? '' : 'blue'}" style="flex:none"><span class="dot"></span>${escapeHtml(t(m.collected ? 'mail.inbox.collected' : 'mail.inbox.unread'))}</span></div>
              <div style="font-size:12.5px;color:var(--ink-2);min-width:0;overflow-wrap:anywhere">${escapeHtml(m.comment || '')}</div>
              <div class="bc-feat">${parcels || `<span class="muted" style="font-size:12px">${escapeHtml(t('mail.attachments.noneLower'))}</span>`}</div>
              <div class="muted" style="font-size:11.5px;min-width:0;overflow-wrap:anywhere">${escapeHtml(t('mail.inbox.dates', { sent: shortDate(m.sendDate), expires: shortDate(m.expireDate) }))}</div></div>`);
            // delete sits in the flex row after the status pill - absolutely positioning it overlapped the pill at every window size
            const del = frag(`<button class="chip-x" style="flex:none">✕</button>`);
            del.addEventListener('click', async () => { await api.deleteMail({ accountServerId: uid, mailServerId: m.serverId }); toast(t('mail.inbox.deleted'), 'warn'); reloadInbox(); });
            card.querySelector('.bc-top').appendChild(del);
            wrap.appendChild(card);
          }
          body.appendChild(wrap);
        });
      }
      reloadInbox();
    });
  },
};
