/**
 * Field limits and normalisation shared by the public form and the admin panel.
 *
 * Both write to the same table, so they have to agree on what a valid value is.
 * Without this, a row typed into the panel could hold data the public path would
 * have refused — longer than the column expects, or an address that never gets
 * the confirmation e-mail because it was never checked.
 */

export const MAX = {
  name: 200,
  email: 200,
  phone: 60,
  pwz: 40,
  title: 60,
  invoice: 1000,
  notes: 2000,
  slug: 120,
  date: 10,
};

/** Trim and hard-truncate. Non-strings become '' rather than 'undefined'. */
export function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// Deliberately loose. Anything stricter rejects valid addresses; the real test
// of an address is whether the confirmation e-mail arrives.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** True for something that could plausibly receive the confirmation e-mail. */
export function isEmail(value) {
  return EMAIL_RE.test(value);
}

/**
 * Normalise the participant fields common to both write paths.
 *
 * Returns `{ fields, error }`, where `error` is a ready-to-display Polish
 * message or null. The caller adds its own checks on top — the public form
 * also requires consent, the panel does not (an admin attests to it).
 */
export function participantFields(payload) {
  const fields = {
    fullName: clean(payload.fullName, MAX.name),
    email: clean(payload.email, MAX.email).toLowerCase(),
    phone: clean(payload.phone, MAX.phone),
    pwz: clean(payload.pwz, MAX.pwz),
    titlePrefix: clean(payload.titlePrefix, MAX.title),
    invoiceData: clean(payload.invoiceData, MAX.invoice),
    courseSlug: clean(payload.courseSlug, MAX.slug),
    dateStart: clean(payload.dateStart, MAX.date),
  };

  let error = null;
  if (!fields.fullName) error = 'Podaj imię i nazwisko.';
  else if (!isEmail(fields.email)) error = 'Podaj poprawny adres e-mail.';
  else if (!fields.courseSlug || !fields.dateStart) error = 'Wybierz kurs i termin.';

  return { fields, error };
}
