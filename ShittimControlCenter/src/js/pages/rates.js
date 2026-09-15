import { el, frag, clear, button, input, field, toast, confirmDialog, openPicker, escapeHtml } from '../ui.js';
import { api } from '../api.js';
import { t } from '../i18n.js';
import { gate, loadInto } from './_util.js';

export default {
  id: 'rates',
  get title() { return t('gacha.title'); },  icon: 'rates',
  needsTarget: false,

  mount(root) {
    return gate(root, { needServer: true }, async (root) => {
      const cfg = await api.gachaConfig();
      let guaranteed = cfg.guaranteed || null;
      let guaranteedName = null;

      const fSsr = input({ value: cfg.ssr || 0, type: 'number', step: '0.1' });
      const fSr = input({ value: cfg.sr || 0, type: 'number', step: '0.1' });
      const fR = input({ value: cfg.r || 0, type: 'number', step: '0.1' });

      const bar = el('div', { style: { display: 'flex', height: '14px', borderRadius: 'var(--r-sm)', overflow: 'hidden', border: '1px solid var(--line)', margin: '4px 0 8px' } });
      const totalTag = el('span', {});
      function paintBar() {
        const ssr = +fSsr.value || 0, sr = +fSr.value || 0, r = +fR.value || 0;
        const total = ssr + sr + r;
        clear(bar);
        const seg = (pct, color) => { const d = el('div', { style: { width: `${total ? (pct / total) * 100 : 0}%`, background: color } }); return d; };
        bar.appendChild(seg(ssr, 'var(--gold)'));
        bar.appendChild(seg(sr, 'var(--blue)'));
        bar.appendChild(seg(r, 'var(--good)'));
        clear(totalTag);
        const ok = Math.abs(total - 100) < 0.001;
        totalTag.appendChild(el(`span.pill.${ok ? 'good' : 'warn'}`, {}, el('span.dot', {}), t('gacha.rates.total', { total: total.toFixed(1) })));
      }
      [fSsr, fSr, fR].forEach((i) => i.addEventListener('input', paintBar));

      const normalize = button(t('gacha.rates.normalize'), { variant: 'ghost', sm: true, iconName: 'rates', onClick: () => {
        let ssr = +fSsr.value || 0, sr = +fSr.value || 0, r = +fR.value || 0;
        const rateTotal = ssr + sr + r;
        if (!rateTotal) { toast(t('gacha.rates.enterFirst'), 'warn'); return; }
        fSsr.value = ((ssr / rateTotal) * 100).toFixed(2); fSr.value = ((sr / rateTotal) * 100).toFixed(2); fR.value = ((r / rateTotal) * 100).toFixed(2);
        paintBar();
      }});

      const ratesCard = el('div.card', {},
        el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: t('gacha.rates.title') }), el('div.spacer', {}), totalTag),
        el('div.card-body', {},
          el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', minWidth: 0 } },
            el('span.tag.gold', { text: t('gacha.rates.ssrTag') }),
            el('span.tag.grey', { text: t('gacha.rates.srTag') }),
            el('span.tag', { text: t('gacha.rates.rTag') })),
          bar,
          el('div.grid-3', { style: { marginTop: '14px' } },
            field(t('gacha.rates.ssrLabel'), fSsr), field(t('gacha.rates.srLabel'), fSr), field(t('gacha.rates.rLabel'), fR)),
          el('div.row.wrap', { style: { gap: '10px' } }, normalize,
            el('span.muted', { text: t('gacha.rates.defaultHint'), style: { fontSize: '12px', minWidth: '0', flex: '1 1 200px' } }))));

      const guaranteedLabel = el('div', {});
      function paintGuaranteed() {
        clear(guaranteedLabel);
        if (guaranteed) guaranteedLabel.appendChild(el('div.chip', {}, el('div.chip-ic', { text: '★' }),
          el('div.chip-main', {}, el('b', { text: guaranteedName || t('gacha.guaranteed.character', { id: guaranteed }) }),
            el('span', { text: t('gacha.guaranteed.id', { id: guaranteed }) }))));
        else guaranteedLabel.appendChild(el('div.muted', { text: t('gacha.guaranteed.none'), style: { fontSize: '12.5px' } }));
      }
      const pickGuaranteed = button(t('gacha.guaranteed.choose'), { variant: 'ghost', sm: true, iconName: 'users', onClick: () => {
        openPicker({ title: t('gacha.guaranteed.pickerTitle'), loader: (q) => api.staticCharacters(q).then((r) => r.map((x) => ({ id: x.id, name: x.name, sub: `★${x.maxStar}` }))),
          onPick: (it) => { guaranteed = it.id; guaranteedName = it.name; paintGuaranteed(); } });
      }});
      const clearGuaranteed = button(t('gacha.guaranteed.clear'), { variant: 'ghost', sm: true, iconName: 'x', onClick: () => { guaranteed = null; guaranteedName = null; paintGuaranteed(); } });

      const guaranteedCard = el('div.card', {},
        el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: t('gacha.guaranteed.title') }), el('span.sub', { text: t('gacha.guaranteed.optional') }), el('div.spacer', {}), pickGuaranteed, clearGuaranteed),
        el('div.card-body', {}, guaranteedLabel,
          el('p.muted', { text: t('gacha.guaranteed.warning'), style: { fontSize: '12px', margin: '12px 0 0', lineHeight: '1.6' } })));

      const saveBtn = button(t('gacha.action.saveRates'), { variant: 'primary', iconName: 'save', onClick: save });
      const resetBtn = button(t('gacha.action.resetDefaults'), { variant: 'ghost', iconName: 'refresh', onClick: reset });
      const saveBar = el('div.card', { style: { marginTop: '18px' } },
        el('div.card-body', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
          saveBtn, resetBtn, el('div.spacer', {}),
          frag(`<span class="muted mono" data-selectable style="font-size:11px;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(cfg.path || '')}">${escapeHtml(cfg.path || '')}</span>`),
          el('span.pill.blue', {}, el('span.dot', {}), t('gacha.status.hotReload'))));

      root.appendChild(el('div.grid-2', { style: { alignItems: 'start' } }, ratesCard, guaranteedCard));
      root.appendChild(saveBar);
      paintBar();
      paintGuaranteed();

      // banners are read-only (defined in the Excel data), listed for reference
      root.appendChild(el('div', { text: t('gacha.banners.title'), style: { fontSize: '14px', fontWeight: '600', color: 'var(--ink)', margin: '22px 0 12px' } }));
      const bannerGrid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '16px', minWidth: '0' } });
      root.appendChild(bannerGrid);
      loadInto(bannerGrid, () => api.gachaBanners(), (grid, banners) => {
        if (!banners.length) { grid.appendChild(el('div.empty', {}, el('b', { text: t('gacha.banners.emptyTitle') }), el('span', { text: t('gacha.banners.emptyDescription') }))); return; }
        for (const b of banners) {
          const flags = [];
          if (b.isNewbie) flags.push(el('span.tag.gold', { text: t('gacha.banner.newbie') }));
          if (b.isSelect) flags.push(el('span.tag', { text: t('gacha.banner.selector') }));
          const featured = (b.featured || []).slice(0, 8);
          const feat = featured.length
            ? featured.map((f) => el('span.tag', { text: f.name }))
            : [el('span.muted', { text: t('gacha.banner.noFeatured'), style: { fontSize: '12px' } })];
          grid.appendChild(el('div.banner-card', {},
            el('div.bc-top', {},
              el('b', { text: t('gacha.banner.label', { id: b.id }), 'data-selectable': true, style: { fontFamily: 'var(--font-round)', fontSize: '14.5px', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }),
              el('span.bc-id', { text: t('gacha.banner.order', { order: b.displayOrder }), 'data-selectable': true }),
              el('div', { style: { flex: '1', minWidth: '8px' } }), flags),
            el('div.bc-feat', {}, feat),
            el('div.muted', { text: b.saleFrom ? t('gacha.banner.saleWindow', { from: b.saleFrom, to: b.saleTo || '' }) : t('gacha.banner.noSaleWindow'), 'data-selectable': true, style: { fontSize: '11.5px', color: 'var(--ink-3)', overflowWrap: 'anywhere' } })));
        }
      });

      async function save() {
        const ssr = +fSsr.value || 0, sr = +fSr.value || 0, r = +fR.value || 0;
        const clearRates = ssr === 0 && sr === 0 && r === 0;
        try {
          await api.setGachaConfig({ ssr, sr, r, guaranteed, clearRates });
          toast(t('gacha.toast.saved'), 'good');
        } catch (e) { toast(e.message, 'bad'); }
      }
      async function reset() {
        const ok = await confirmDialog({ title: t('gacha.reset.title'), confirmLabel: t('gacha.reset.confirm'), message: t('gacha.reset.message') });
        if (!ok) return;
        try {
          await api.setGachaConfig({ ssr: 0, sr: 0, r: 0, guaranteed: null, clearRates: true });
          fSsr.value = 0; fSr.value = 0; fR.value = 0; guaranteed = null; guaranteedName = null;
          paintBar(); paintGuaranteed();
          toast(t('gacha.toast.resetDone'), 'warn');
        } catch (e) { toast(e.message, 'bad'); }
      }
    });
  },
};
