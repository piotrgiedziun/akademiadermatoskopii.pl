/**
 * Site-wide constants. Single source of truth for URLs, navigation, and metadata.
 */

export const SITE_URL = 'https://akademiadermatoskopii.pl';
export const SITE_NAME = 'Akademia Dermatoskopii';
export const SITE_TAGLINE =
  'Kursy dermatoskopii, chirurgii skóry i lasera CO2 — Wrocław';
export const SITE_DESCRIPTION =
  'Praktyczne kursy dermatoskopii, chirurgii skóry i lasera CO2 prowadzone przez dr hab. n. med. Jacka Calika. Wrocław, ul. Wyspiańskiego 11.';
export const TITLE_SUFFIX = ' — Akademia Dermatoskopii';
export const DEFAULT_OG = '/og/og-default.png';
export const LOGO_URL = '/logo.png';
export const DEFAULT_LOCALE = 'pl_PL';

export const REGISTRATION_URL = 'https://forms.gle/eU6jfCAwqLAmzPzb9';

export interface NavItem {
  label: string;
  href: string;
}

export const NAV: NavItem[] = [
  { label: 'Kursy', href: '/kursy/' },
  { label: 'Aktualności', href: '/aktualnosci/' },
  { label: 'Wideo', href: '/wideo/' },
  { label: 'Projekty', href: '/projekty/' },
  { label: 'O nas', href: '/wykladowcy/' },
  { label: 'Kontakt', href: '/kontakt/' },
];

export interface SocialLink {
  label: string;
  href: string;
  icon: 'facebook' | 'youtube' | 'email' | 'phone';
}

export const SOCIAL: SocialLink[] = [
  {
    label: 'Facebook',
    href: 'https://facebook.com/akademiadermatoskopii',
    icon: 'facebook',
  },
  {
    label: 'YouTube',
    href: 'https://www.youtube.com/channel/UC7REIrAz1Xxp4CQF-yIORgg',
    icon: 'youtube',
  },
];
