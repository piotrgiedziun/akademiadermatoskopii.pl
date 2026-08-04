/**
 * RODO consent — shared between the form (build time) and the register endpoint
 * (runtime), so the text a user agreed to and the text we store can never drift.
 *
 * Wording is carried over verbatim from the Google Form it replaces. When it
 * changes, bump CONSENT_VERSION: rows keep the version they were collected
 * under, so you can always tell what a given person actually agreed to.
 */

export const CONSENT_VERSION = '2026-08';

export const CONSENT_TEXT =
  'Wyrażam zgodę na przetwarzanie moich danych osobowych dla potrzeb niezbędnych ' +
  'do realizacji procesu rejestracji (zgodnie z ustawą z dnia 10 maja 2018 roku ' +
  'o ochronie danych osobowych (Dz. Ustaw z 2018, poz. 1000) oraz zgodnie ' +
  'z Rozporządzeniem Parlamentu Europejskiego i Rady (UE) 2016/679 z dnia ' +
  '27 kwietnia 2016 r.';

/** Options offered for "Tytuł naukowy", matching the Google Form. */
export const TITLE_PREFIXES = [
  'lek.',
  'lek. dent.',
  'dr n. med.',
  'dr hab. n. med.',
  'prof.',
];
