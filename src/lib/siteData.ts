/**
 * Contact info, bank details, address — centralized for use across Contact page,
 * Footer, and JSON-LD organisation schema.
 */

export const ADDRESS = {
  streetAddress: 'Wyspiańskiego 11',
  city: 'Wrocław',
  postalCode: '50-370',
  country: 'PL',
  full: 'ul. Wyspiańskiego 11, 50-370 Wrocław',
  mapsUrl: 'https://maps.app.goo.gl/LiqphxJAzeiQzd6N9',
} as const;

export const CONTACTS = [
  {
    name: 'Olga Poślednia',
    role: 'Organizacja i zapisy',
    phone: '+48 516 516 065',
    phoneHref: 'tel:+48516516065',
  },
] as const;

export const EMAIL = 'kontakt@akademiadermatoskopii.pl';
export const EMAIL_HREF = `mailto:${EMAIL}`;

export const BANK = {
  account: '51 1050 1575 1000 0092 7136 6206',
  bankName: 'ING Bank Śląski',
  owner: 'Akademia Dermatoskopii',
} as const;

export const OPENING_HOURS = [
  { day: 'pon.–pt.', hours: '9:00 — 17:00' },
] as const;
