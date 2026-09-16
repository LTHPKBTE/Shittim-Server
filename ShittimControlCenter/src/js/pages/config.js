import { el, frag, clear, button, input, select, toggle, field, toast, modal, textarea, confirmDialog } from '../ui.js';
import { store } from '../api.js';
import { t, getLanguage, SUPPORTED_LANGUAGES } from '../i18n.js';

// Defaults mirror Shittim-Server/Configuration/ConfigType/ServerConfig.cs.
// Reset overwrites only these editable ServerConfiguration fields, preserving GameVersion, gateway keys, ClientPluginDirectory and the Irc/DataFetcher sibling sections in Config.json.
const DEFAULT_SERVER_CONFIG = {
  HostPort: '5000',
  GatewayPort: '5100',
  EnableGateway: true,
  OutboundProxyUrl: '',
  OutboundProxyBypass: '',
  OutboundProxyUseSystem: true,
  ClientInstallDirectory: '',
  AutoPatchClientMetadata: true, ClientMetadataPath: '',
  AutoPatchClientGamescaleIas: true, ClientGamescaleCorePath: '',
  AutoPatchClientInfaceConfig: true, ClientInfaceConfigPath: '',
  AutoManageGrap64: true, ClientGrap64Path: '',
  AutoPatchClientBanners: true, ClientExcelDbPath: '',
  RegionDisplayText: '',
  SQLProvider: 'SQLite3',
  SQLConnectionString: 'Data Source=shittim.sqlite3',
  UseEncryption: false,
  BypassAuthentication: false,
  UseCustomExcel: false,
  KoyukiIncident: false,
  AutoCheckVersion: true,
  AutoUpdateVersion: true,
  AutoUpdateResources: false,
  OverrideVersionId: null,
  OverrideCdnBaseUrl: null,
  ExcelDbSqlCipherKey: 'ef0aaca06f34b4a4be3172a75a3ea565e815f9ece35b1fb12b7a166ba0807bc4',
  ExcelDbSqlCipherLicense: 'OmNpZDowMDFWSjAwMDAwY3pzaVlZQVE6cGxhdGZvcm06MjY6ZXhwaXJlOm5ldmVyOnZlcnNpb246MTpsaWJ2ZXI6NC4xMC4wOmhtYWM6ODQ1Y2JkMzQ0MDc3YjIxNmRlYTgyOWI3OTIyMzRkM2UwYmUyMzNhYw==',
  ServerInfoUrl: 'https://d2vaidpni345rp.cloudfront.net/com.nexon.bluearchivesteam/server_config/433063_Live_77acRXMErRIj8461BJ0KXJP3t.json',
  PacketLogging: { RequestPacket: true, ResponsePacket: false, ErrorPacket: false },
};

const GROUPS = [
  {
    titleKey: 'config.group.networking', icon: 'server',
    fields: [
      { key: 'HostPort', labelKey: 'config.field.apiPort', type: 'text', hintKey: 'config.hint.default5000' },
      { key: 'GatewayPort', labelKey: 'config.field.gatewayPort', type: 'text', hintKey: 'config.hint.default5100' },
      { key: 'EnableGateway', labelKey: 'config.field.enableGateway', type: 'bool' },
    ],
  },
  {
    titleKey: 'config.group.outboundProxy', icon: 'server',
    fields: [
      { key: 'OutboundProxyUrl', labelKey: 'config.field.outboundProxyUrl', type: 'text', hintKey: 'config.hint.outboundProxyUrl', descKey: 'config.desc.outboundProxy' },
      { key: 'OutboundProxyBypass', labelKey: 'config.field.outboundProxyBypass', type: 'text', hintKey: 'config.hint.outboundProxyBypass' },
      { key: 'OutboundProxyUseSystem', labelKey: 'config.field.outboundProxyUseSystem', type: 'bool', descKey: 'config.desc.outboundProxyUseSystem' },
    ],
  },
  {
    titleKey: 'config.group.behaviour', icon: 'bolt',
    fields: [
      { key: 'UseEncryption', labelKey: 'config.field.packetEncryption', type: 'bool' },
      { key: 'BypassAuthentication', labelKey: 'config.field.bypassAuthentication', type: 'bool' },
      { key: 'UseCustomExcel', labelKey: 'config.field.customExcelTables', type: 'bool' },
      { key: 'KoyukiIncident', labelKey: 'config.field.koyukiIncident', type: 'bool', descKey: 'config.desc.koyukiIncident' },
      { key: 'AutoCheckVersion', labelKey: 'config.field.autoCheckVersion', type: 'bool', descKey: 'config.desc.autoCheckVersion' },
      { key: 'AutoUpdateVersion', labelKey: 'config.field.autoUpdateVersion', type: 'bool' },
      { key: 'AutoUpdateResources', labelKey: 'config.field.autoUpdateResources', type: 'bool', descKey: 'config.desc.autoUpdateResources' },
    ],
  },
  {
    titleKey: 'config.group.database', icon: 'inventory',
    fields: [
      { key: 'SQLProvider', labelKey: 'config.field.sqlProvider', type: 'text' },
      { key: 'SQLConnectionString', labelKey: 'config.field.connectionString', type: 'text' },
    ],
  },
  {
    titleKey: 'config.group.versionDataSources', icon: 'clock',
    fields: [
      { key: 'OverrideVersionId', labelKey: 'config.field.overrideVersionId', type: 'text', hintKey: 'config.hint.blankAuto' },
      { key: 'OverrideCdnBaseUrl', labelKey: 'config.field.overrideCdnBaseUrl', type: 'text', hintKey: 'config.hint.blankAuto' },
      { key: 'ServerInfoUrl', labelKey: 'config.field.serverInfoUrl', type: 'text' },
    ],
  },
  {
    titleKey: 'config.group.clientAutoPatching', icon: 'shield',
    fields: [
      { key: 'ClientInstallDirectory', labelKey: 'config.field.gameInstallDirectory', type: 'dir', hintKey: 'config.hint.gameInstallDirectory' },
      { key: 'AutoPatchClientMetadata', labelKey: 'config.field.patchMetadata', type: 'bool', path: 'ClientMetadataPath' },
      { key: 'AutoPatchClientGamescaleIas', labelKey: 'config.field.patchGamescaleIas', type: 'bool', path: 'ClientGamescaleCorePath' },
      { key: 'AutoPatchClientInfaceConfig', labelKey: 'config.field.patchInfaceConfig', type: 'bool', path: 'ClientInfaceConfigPath' },
      { key: 'AutoManageGrap64', labelKey: 'config.field.manageGrap64', type: 'bool', path: 'ClientGrap64Path' },
      { key: 'AutoPatchClientBanners', labelKey: 'config.field.patchRecruitmentBanners', type: 'bool', path: 'ClientExcelDbPath' },
      { key: 'RegionDisplayText', labelKey: 'config.field.regionLabel', type: 'text', hintKey: 'config.hint.regionLabel' },
    ],
  },
  {
    titleKey: 'config.group.packetLogging', icon: 'edit', sub: 'PacketLogging', subKey: 'config.group.packetLoggingTechnical',
    fields: [
      { key: 'RequestPacket', labelKey: 'config.field.logRequests', type: 'bool' },
      { key: 'ResponsePacket', labelKey: 'config.field.logResponses', type: 'bool' },
      { key: 'ErrorPacket', labelKey: 'config.field.logErrors', type: 'bool' },
    ],
  },
];

export default {
  id: 'config',
  get title() { return t('config.title'); },  icon: 'config',
  needsTarget: false,

  async mount(root, { rerender }) {
    const language = select(SUPPORTED_LANGUAGES, { value: getLanguage() });
    language.addEventListener('change', async () => {
      language.disabled = true;
      try {
        const saved = await window.host.settingsWrite({ language: language.value });
        if (saved?.error) throw new Error(saved.error);
        window.location.reload();
      } catch (error) {
        language.disabled = false;
        language.value = getLanguage();
        toast(`${t('config.language.saveFailed')}: ${String(error.message || error)}`, 'bad');
      }
    });
    root.appendChild(el('div.card', { style: { marginBottom: '18px' } },
      el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: t('config.language.title') })),
      el('div.card-body', {}, field(t('config.language.label'), language, t('config.language.hint')))));

    const cfg = await window.host.configRead();
    if (!cfg.ok) {
      root.appendChild(el('div.empty', {},
        el('b', { text: t('config.empty.title') }),
        el('span', {}, el('span.mono', { text: cfg.path, 'data-selectable': true, style: { wordBreak: 'break-all' } }), el('br'), t('config.empty.description'))));
      const b = button(t('config.action.openContainingFolder'), { variant: 'ghost', iconName: 'folder', onClick: async () => {
        const p = await window.host.paths(); window.host.openPath(p.exeBaseDir);
      }});
      root.appendChild(el('div', { style: { textAlign: 'center', marginTop: '14px' } }, b));
      return;
    }

    const data = cfg.data;
    const sc = data.ServerConfiguration = data.ServerConfiguration || {};
    const pl = sc.PacketLogging = sc.PacketLogging || {};

    const restartHint = store.get().online
      ? el('span.pill.warn', {}, el('span.dot', {}), t('config.status.restartToApply'))
      : el('span.pill', {}, el('span.dot', {}), t('config.status.serverOffline'));

    const saveBtn = button(t('config.action.save'), { variant: 'primary', iconName: 'save', onClick: save });
    const reloadBtn = button(t('config.action.reload'), { variant: 'ghost', iconName: 'refresh', onClick: rerender });
    const rawBtn = button(t('config.action.editRawJson'), { variant: 'ghost', iconName: 'edit', onClick: editRaw });
    const openBtn = button(t('config.action.openFile'), { variant: 'ghost', iconName: 'external', onClick: () => window.host.openPath(cfg.path) });
    const resetBtn = button(t('config.action.resetDefaults'), { variant: 'ghost', iconName: 'refresh', onClick: resetDefaults });

    const bar = el('div.card', { style: { marginBottom: '18px' } },
      el('div.card-body', { style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
        saveBtn, reloadBtn, rawBtn, openBtn, resetBtn, el('div.spacer', {}), restartHint));
    root.appendChild(bar);
    root.appendChild(frag(`<div class="row wrap" style="margin:-4px 0 16px;min-width:0"><span class="mono" data-selectable style="font-size:11.5px;color:var(--ink-2);min-width:0;word-break:break-all;line-height:1.5">${cfg.path}</span></div>`));

    const grid = el('div.grid-2', { style: { alignItems: 'start' } });

    for (const g of GROUPS) {
      const target = g.sub === 'PacketLogging' ? pl : sc;
      const body = el('div', {});
      for (const f of g.fields) {
        if (f.type === 'bool') {
          const row = buildToggleRow(target, f);
          body.appendChild(row);
          if (f.path) body.appendChild(buildPathField(sc, f));
        } else if (f.type === 'dir') {
          body.appendChild(field(t(f.labelKey), buildDirRow(target, f.key), f.hintKey ? t(f.hintKey) : null));
        } else {
          body.appendChild(field(t(f.labelKey), bindInput(target, f.key), f.hintKey ? t(f.hintKey) : null));
        }
      }
      grid.appendChild(el('div.card', { style: { minWidth: '0' } },
        el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: t(g.titleKey) }),
          g.subKey ? el('span.sub', { text: t(g.subKey) } ) : null),
        el('div.card-body', { style: { minWidth: '0' } }, body)));
    }
    root.appendChild(grid);

    const advBody = el('div', {});
    advBody.appendChild(field(t('config.field.excelSqlCipherKey'), bindInput(sc, 'ExcelDbSqlCipherKey')));
    advBody.appendChild(field(t('config.field.excelSqlCipherLicense'), bindInput(sc, 'ExcelDbSqlCipherLicense')));
    root.appendChild(el('div.card', { style: { marginTop: '18px' } },
      el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: t('config.advanced.title') }),
        el('span.sub', { text: t('config.advanced.description') })),
      el('div.card-body', {}, advBody)));

    function bindInput(obj, key) {
      const i = input({ value: obj[key] ?? '', placeholder: '-' });
      i.addEventListener('input', () => { obj[key] = i.value; });
      return i;
    }
    function buildToggleRow(obj, f) {
      const row = el('div.toggle-row', {},
        el('div.tr-text', {}, el('b', { text: t(f.labelKey) }), f.descKey ? el('span', { text: t(f.descKey) }) : null));
      const control = toggle(!!obj[f.key], (on) => { obj[f.key] = on; });
      row.appendChild(control);
      return row;
    }
    function buildDirRow(obj, key) {
      const row = el('div.input-row', { style: { minWidth: '0' } });
      const i = input({ value: obj[key] ?? '', placeholder: '-' });
      i.addEventListener('input', () => { obj[key] = i.value; });
      const browse = button('...', { variant: 'ghost', onClick: async () => {
        const picked = await window.host.pickFolder();
        if (picked) { i.value = picked; obj[key] = picked; }
      }});
      browse.style.flex = '0 0 auto';
      row.appendChild(i); row.appendChild(browse);
      return row;
    }
    function buildPathField(obj, f) {
      const wrap = el('div', { style: { margin: '-4px 0 8px', paddingLeft: '2px', minWidth: '0' } });
      const row = el('div.input-row', { style: { minWidth: '0' } });
      const i = input({ value: obj[f.path] ?? '', placeholder: t('config.placeholder.optionalPathOverride') });
      i.addEventListener('input', () => { obj[f.path] = i.value; });
      const browse = button('...', { variant: 'ghost', onClick: async () => {
        const picked = await window.host.pickFile();
        if (picked) { i.value = picked; obj[f.path] = picked; }
      }});
      browse.style.flex = '0 0 auto';
      row.appendChild(i); row.appendChild(browse);
      wrap.appendChild(row);
      return wrap;
    }

    async function save() {
      const r = await window.host.configWrite(data);
      toast(r.ok ? t('config.toast.saved') : (r.error || t('config.toast.saveFailed')), r.ok ? 'good' : 'bad');
    }
    async function resetDefaults() {
      const ok = await confirmDialog({ title: t('config.reset.title'), confirmLabel: t('config.reset.confirm'),
        message: t('config.reset.message') });
      if (!ok) return;
      Object.assign(sc, DEFAULT_SERVER_CONFIG, { PacketLogging: { ...DEFAULT_SERVER_CONFIG.PacketLogging } });
      const r = await window.host.configWrite(data);
      if (r.ok) { toast(t('config.toast.resetDone'), 'good'); rerender(); }
      else toast(r.error || t('config.toast.resetFailed'), 'bad');
    }

    function editRaw() {
      const ta = textarea({ value: JSON.stringify(data, null, 2), style: { minHeight: '52vh', maxWidth: '100%', fontFamily: 'var(--font-mono)', fontSize: '12.5px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' } });
      const apply = button(t('config.raw.apply'), { variant: 'primary', iconName: 'check' });
      const cancel = button(t('config.raw.cancel'), { variant: 'ghost' });
      const ref = modal({ title: t('config.raw.title'), wide: true, body: ta, footer: [cancel, apply] });
      cancel.addEventListener('click', ref.close);
      apply.addEventListener('click', async () => {
        try {
          const parsed = JSON.parse(ta.value);
          const r = await window.host.configWrite(parsed);
          if (r.ok) { ref.close(); toast(t('config.toast.saved'), 'good'); rerender(); }
          else toast(r.error, 'bad');
        } catch (e) { toast(t('config.raw.invalidJson', { message: e.message }), 'bad'); }
      });
    }
  },
};
