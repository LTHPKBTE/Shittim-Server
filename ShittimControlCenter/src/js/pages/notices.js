import { el, clear, button, input, select, toggle, field, toast, confirmDialog } from '../ui.js';
import { api } from '../api.js';
import { gate } from './_util.js';
import { t } from '../i18n.js';

// Blurbs keyed by ServerNotificationFlag member name. A bit the server enum grows past this list still gets a row, just without a description.
const FLAG_DESC = {
  NewMailArrived: () => t('notices.flags.newMailArrived'),
  HasUnreadMail: () => t('notices.flags.hasUnreadMail'),
  NewToastDetected: () => t('notices.flags.newToastDetected'),
  CanReceiveArenaDailyReward: () => t('notices.flags.canReceiveArenaDailyReward'),
  CanReceiveRaidReward: () => t('notices.flags.canReceiveRaidReward'),
  ServerMaintenance: () => t('notices.flags.serverMaintenance'),
  CannotReceiveMail: () => t('notices.flags.cannotReceiveMail'),
  InventoryFullRewardMail: () => t('notices.flags.inventoryFullRewardMail'),
  CanReceiveClanAttendanceReward: () => t('notices.flags.canReceiveClanAttendanceReward'),
  HasClanApplicant: () => t('notices.flags.hasClanApplicant'),
  HasFriendRequest: () => t('notices.flags.hasFriendRequest'),
  CheckConquest: () => t('notices.flags.checkConquest'),
  CanReceiveEliminateRaidReward: () => t('notices.flags.canReceiveEliminateRaidReward'),
  CanReceiveMultiFloorRaidReward: () => t('notices.flags.canReceiveMultiFloorRaidReward'),
  CanReceiveProductDailyRecordReward: () => t('notices.flags.canReceiveProductDailyRecordReward'),
  HasUnreadSemiPermanentMail: () => t('notices.flags.hasUnreadSemiPermanentMail'),
};

// The error codes the client has a dedicated screen for. Everything else in WebAPIErrorCode lands on its generic popup, which is what "Other error code" is for.
const GATE_CODES = [
  { value: 28001, name: 'ServerIsUnderMaintenance', desc: () => t('notices.gateCodes.serverIsUnderMaintenance') },
  { value: 28002, name: 'ServerMaintenanceSoon', desc: () => t('notices.gateCodes.serverMaintenanceSoon') },
  { value: 28003, name: 'AccountIsNotInWhiteList', desc: () => t('notices.gateCodes.accountIsNotInWhiteList') },
  { value: 28005, name: 'ServerContentsLock', desc: () => t('notices.gateCodes.serverContentsLock') },
  { value: 27000, name: 'AccountBanned', desc: () => t('notices.gateCodes.accountBanned') },
  { value: 903, name: 'ClientUpdateRequire', desc: () => t('notices.gateCodes.clientUpdateRequire') },
  { value: 3, name: 'InvalidSession', desc: () => t('notices.gateCodes.invalidSession') },
];

export default {
  id: 'notices',
  get title() { return t('nav.notices'); },  icon: 'info',
  needsTarget: false,

  mount(root, { rerender }) {
    return gate(root, { needServer: true }, async (root) => {
      const state = await api.notice();
      let flags = state.flags | 0;

      const flagTag = el('span', {});
      const gateTag = el('span', {});

      const flagBody = el('div', {});
      for (const f of state.availableFlags) {
        const row = el('div.toggle-row', {},
          el('div.tr-text', {}, el('b', { text: f.name }), el('span', { text: FLAG_DESC[f.name]?.() || t('notices.flags.bit', { value: f.value }) })));
        row.appendChild(toggle((flags & f.value) !== 0, (on) => {
          flags = on ? (flags | f.value) : (flags & ~f.value);
          paintFlags();
        }));
        flagBody.appendChild(row);
      }

      const flagCard = el('div.card', { style: { minWidth: '0' } },
        el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: t('notices.notificationFlags') }),
          el('span.sub', { text: t('notices.stampedOnEveryResponse') }), el('div.spacer', {}), flagTag),
        el('div.card-body', { style: { minWidth: '0' } }, flagBody,
          el('p.muted', { text: t('notices.flagsHelp'), style: { fontSize: '12px', margin: '10px 0 0', lineHeight: '1.6' } })));

      const codeSel = select(
        [{ value: '0', label: t('notices.offServeNormally') }]
          .concat(GATE_CODES.map((c) => ({ value: String(c.value), label: `${c.name} - ${c.value}` })))
          .concat([{ value: 'custom', label: t('notices.otherErrorCode') }]));
      const customCode = input({ type: 'number', value: '' });
      const customField = field(t('notices.errorCode'), customCode, t('notices.errorCodeHint'));
      const msg = input({ value: state.gateMessage || '', placeholder: t('notices.messagePlaceholder') });
      const codeNote = el('p.muted', { style: { fontSize: '12px', margin: '-2px 0 14px', lineHeight: '1.6' } });

      const known = GATE_CODES.some((c) => c.value === state.gateError);
      codeSel.value = state.gateError ? (known ? String(state.gateError) : 'custom') : '0';
      if (state.gateError && !known) customCode.value = state.gateError;

      codeSel.addEventListener('change', paintGate);
      customCode.addEventListener('input', paintGate);

      const gateCard = el('div.card', { style: { minWidth: '0' } },
        el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: t('notices.closeServer') }),
          el('div.spacer', {}), gateTag),
        el('div.card-body', { style: { minWidth: '0' } },
          field(t('notices.answerEveryRequestWith'), codeSel),
          codeNote,
          customField,
          field(t('notices.message'), msg, t('notices.messageHint')),
          el('p.muted', { text: t('notices.gateHelp'), style: { fontSize: '12px', margin: '10px 0 0', lineHeight: '1.6' } })));

      const applyBtn = button(t('common.apply'), { variant: 'primary', iconName: 'save', onClick: apply });
      const clearBtn = button(t('notices.clearEverything'), { variant: 'ghost', iconName: 'refresh', onClick: clearAll });
      const bar = el('div.card', { style: { marginTop: '18px' } },
        el('div.card-body', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
          applyBtn, clearBtn, el('div.spacer', {}),
          el('span.pill.blue', {}, el('span.dot', {}), t('notices.takesEffectNextRequest'))));

      root.appendChild(el('div.grid-2', { style: { alignItems: 'start' } }, flagCard, gateCard));
      root.appendChild(bar);
      paintFlags();
      paintGate();

      function currentCode() {
        return parseInt(codeSel.value === 'custom' ? customCode.value : codeSel.value, 10) || 0;
      }
      function paintFlags() {
        clear(flagTag);
        const set = state.availableFlags.filter((f) => flags & f.value).length;
        flagTag.appendChild(el(`span.pill${flags ? '.blue' : ''}`, {}, el('span.dot', {}),
          t('notices.flags.status', { flags, setText: set ? t('notices.flags.setCount', { count: set }) : '' })));
      }
      function paintGate() {
        const code = currentCode();
        customField.style.display = codeSel.value === 'custom' ? '' : 'none';
        const c = GATE_CODES.find((x) => x.value === code);
        codeNote.textContent = c ? c.desc()
          : code ? t('notices.genericErrorFallback')
          : '';
        clear(gateTag);
        gateTag.appendChild(el(`span.pill.${code ? 'warn' : 'good'}`, {}, el('span.dot', {}),
          code ? t('notices.closedStatus', { code }) : t('notices.openStatus')));
      }

      async function apply() {
        const code = currentCode();
        if (code && code !== state.gateError) {
          const c = GATE_CODES.find((x) => x.value === code);
          const ok = await confirmDialog({ title: t('notices.closeServer'), confirmLabel: t('notices.closeServer'), danger: true,
            message: t('notices.closeServerConfirm', { result: c ? c.name : t('notices.errorWithCode', { code }) }) });
          if (!ok) return;
        }
        try {
          await api.setNotice({ flags, gateError: code, gateMessage: msg.value });
          state.gateError = code;
          toast(code ? t('notices.toast.clientsGetError') : t('notices.toast.settingsApplied'), code ? 'warn' : 'good', code ? t('notices.toast.serverClosed') : t('common.saved'));
        } catch (e) { toast(e.message, 'bad'); }
      }
      async function clearAll() {
        try {
          await api.setNotice({ flags: 0, gateError: 0, gateMessage: msg.value });
          toast(t('notices.toast.clearedAndReopened'), 'good');
          rerender();
        } catch (e) { toast(e.message, 'bad'); }
      }
    });
  },
};
