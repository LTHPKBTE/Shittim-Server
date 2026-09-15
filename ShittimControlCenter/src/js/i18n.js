import i18next from '../../node_modules/i18next/dist/esm/i18next.js';
import en from '../locales/en.json' with { type: 'json' };
import zhCN from '../locales/zh-CN.json' with { type: 'json' };

export const DEFAULT_LANGUAGE = 'en';
export const SUPPORTED_LANGUAGES = Object.freeze([
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '简体中文' },
]);

export function normalizeLanguage(language) {
  return language === 'zh-CN' ? 'zh-CN' : DEFAULT_LANGUAGE;
}

export async function initI18n(language = DEFAULT_LANGUAGE) {
  const lng = normalizeLanguage(language);
  await i18next.init({
    lng,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES.map((item) => item.value),
    resources: {
      en: { translation: en },
      'zh-CN': { translation: zhCN },
    },
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    returnEmptyString: false,
    initImmediate: false,
  });
  document.documentElement.lang = lng;
  return lng;
}

export function t(key, options) {
  return i18next.t(key, options);
}

export function getLanguage() {
  return normalizeLanguage(i18next.resolvedLanguage || i18next.language);
}
