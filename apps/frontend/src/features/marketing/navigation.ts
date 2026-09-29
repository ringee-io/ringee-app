import {
  CTA,
  MAIN_NAV,
  PRODUCT_MENU,
  FOOTER_COLUMNS,
  siteText,
  type NavLink
} from './site';
import { localizedHref, type MarketingLocale } from './locale';

export function marketingNavigation(locale: MarketingLocale) {
  const link = (item: NavLink): NavLink => ({
    ...item,
    label: siteText(item.label, locale),
    href: localizedHref(item.href, locale),
    description: item.description
      ? siteText(item.description, locale)
      : undefined
  });
  return {
    mainNav: MAIN_NAV.map((item) => ({
      ...link(item),
      label:
        locale === 'es'
          ? ({
              '/ai-voice-agents': 'Voz con IA',
              '/sales-dialer': 'Marcador',
              '/use-cases': 'Casos de uso'
            }[item.href] ?? siteText(item.label, locale))
          : item.label
    })),
    productMenu: PRODUCT_MENU.map((group) => ({
      ...group,
      title: siteText(group.title, locale),
      blurb: siteText(group.blurb, locale),
      links: group.links.map(link)
    })),
    footerColumns: FOOTER_COLUMNS.map((column) => ({
      ...column,
      title: siteText(column.title, locale),
      links: column.links.map(link)
    })),
    cta: {
      primary: link(CTA.primary),
      secondary: link(CTA.secondary),
      login: link(CTA.login)
    }
  };
}
