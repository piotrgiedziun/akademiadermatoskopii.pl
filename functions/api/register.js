/**
 * POST /api/register — the only public write path.
 *
 * Order matters: the D1 row is written BEFORE any email is sent, so a mail
 * failure can never lose a registration. Emails are best-effort; if one fails
 * the response still reports success and the entry is visible in the admin
 * panel, where it can be handled by hand.
 */

import { loadSlots, findSlot, countConfirmed, availabilityFor } from '../../src/server/slots.js';
import { sendEmail, logoAttachment, attendeeEmail, adminEmail, transferTitle, ADMIN_TO } from '../../src/server/email.js';
import { CONSENT_VERSION } from '../../src/server/consent.js';
import { participantFields } from '../../src/server/registrationFields.js';

/**
 * Abuse ceilings, counted against D1 over a rolling 24h window.
 *
 * Turnstile stops bots and the mailer caps bursts, but neither stops a patient
 * human driving the form to send mail from this domain. Real volume is about
 * one registration per day, so these sit far above legitimate use.
 */
const LIMITS = {
  perEmailPerDay: 3,
  // Circuit breaker. Past this, registrations are still accepted and stored —
  // losing a real signup would be worse — but no mail goes out, so neither the
  // send quota nor the domain reputation can be burned while nobody is looking.
  //
  // Keep this at 48 or below: each registration sends 2 e-mails, so
  // 2 × cap × 31 must stay under the 3,000/month included with Workers Paid.
  // Above that, sustained abuse would start costing money ($0.35/1,000).
  globalPerDay: 40,
};

// Note: the attendee e-mail deliberately contains no submitted values at all
// (see src/server/email.js). That removes the "send arbitrary text from a
// trusted domain to any address" vector outright, so no name sanitising is
// needed here — there is nothing attacker-controlled left to sanitise.

function fail(message, status = 400, extra = {}) {
  return Response.json({ error: message, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Cloudflare Turnstile server-side validation. Tokens are single-use. */
async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) {
    console.error('TURNSTILE_SECRET missing — rejecting rather than accepting unverified');
    return false;
  }
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });
  const data = await res.json().catch(() => ({ success: false }));
  if (!data.success) console.warn('Turnstile rejected:', data['error-codes']);
  return data.success === true;
}

export async function onRequestPost(context) {
  const { request, env, waitUntil } = context;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return fail('Nieprawidłowe dane formularza.');
  }

  // 1. Bot check before anything touches the database.
  const ok = await verifyTurnstile(
    env,
    payload.turnstileToken,
    request.headers.get('CF-Connecting-IP'),
  );
  if (!ok) return fail('Weryfikacja antyspamowa nie powiodła się. Odśwież stronę i spróbuj ponownie.', 403);

  // 2. Field validation. Shared with the admin panel, so a row typed by hand
  //    can never hold something this path would have refused.
  const { fields, error } = participantFields(payload);
  if (error) return fail(error);
  if (payload.consent !== true) return fail('Zgoda na przetwarzanie danych osobowych jest wymagana.');

  const { fullName, email, phone, pwz, titlePrefix, invoiceData, courseSlug, dateStart } = fields;

  // 3. Resolve the slot against the CMS catalogue. Anything not in there —
  //    cancelled, past, or invented by a forged request — is rejected.
  let slots;
  try {
    slots = await loadSlots(context);
  } catch (err) {
    console.error('slot catalogue unavailable:', err.message);
    return fail('Chwilowy problem techniczny. Spróbuj ponownie za chwilę.', 503);
  }

  const slot = findSlot(slots, courseSlug, dateStart);
  if (!slot) return fail('Wybrany termin jest niedostępny.', 404);

  // 4. Authoritative capacity check — the client's view may be stale.
  const counts = await countConfirmed(env.DB);
  const avail = availabilityFor(slot, counts.get(slot.key) ?? 0);
  if (!avail.available) {
    return fail(
      'Na ten termin nie ma już wolnych miejsc. Prosimy o kontakt telefoniczny w sprawie listy rezerwowej.',
      409,
      { full: true },
    );
  }

  // 5. Abuse ceilings over the last 24h. Counted in one round trip.
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const usage = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM registrations WHERE created_at > ?1 AND email = ?2) AS by_email,
       (SELECT COUNT(*) FROM registrations WHERE created_at > ?1) AS total`,
  )
    .bind(since, email)
    .first();

  if ((usage?.by_email ?? 0) >= LIMITS.perEmailPerDay) {
    console.warn('abuse: per-email daily cap hit');
    return fail(
      'Zbyt wiele zgłoszeń z tego adresu e-mail. Prosimy o kontakt telefoniczny.',
      429,
    );
  }

  // Above the global ceiling the registration is still stored — dropping a real
  // signup would be worse than a missing e-mail — but nothing is sent.
  const emailsSuppressed = (usage?.total ?? 0) >= LIMITS.globalPerDay;
  if (emailsSuppressed) {
    console.error(
      `abuse: global daily cap (${LIMITS.globalPerDay}) reached — storing registration, suppressing e-mail`,
    );
  }

  // 6. Guard against double submissions (impatient click, back button).
  const dupe = await env.DB.prepare(
    `SELECT id FROM registrations
      WHERE email = ? AND course_slug = ? AND date_start = ? AND status != 'cancelled'
      LIMIT 1`,
  )
    .bind(email, courseSlug, dateStart)
    .first();
  if (dupe) {
    return fail('Zgłoszenie na ten termin zostało już przyjęte dla tego adresu e-mail.', 409, {
      duplicate: true,
    });
  }

  // 7. Persist. Price is snapshotted so historical rows survive price changes.
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO registrations
       (id, created_at, course_slug, date_start, status, full_name, title_prefix, pwz,
        email, phone, invoice_data, price_amount, consent_at, consent_version, source)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'web')`,
  )
    .bind(
      id, now, courseSlug, dateStart, fullName, titlePrefix || null, pwz || null,
      email, phone || null, invoiceData || null, slot.priceAmount, now, CONSENT_VERSION,
    )
    .run();

  // 8. Notify. Failures are logged, never surfaced — the row is already safe.
  const dateLabel = `${slot.label}${slot.city ? ', ' + slot.city : ''}`;
  const notify = async () => {
    if (emailsSuppressed) return;
    const logo = await logoAttachment(context);
    const attendee = attendeeEmail({
      courseTitle: slot.courseTitle,
      dateLabel,
      priceAmount: slot.priceAmount,
      hasLogo: Boolean(logo),
    });

    const results = await Promise.allSettled([
      sendEmail(env, { to: email, ...attendee, attachments: logo ? [logo] : undefined }),
      sendEmail(env, {
        to: ADMIN_TO,
        replyTo: email,
        ...adminEmail({
          id, fullName, email, phone, pwz, titlePrefix, invoiceData,
          courseTitle: slot.courseTitle,
          dateLabel,
          priceAmount: slot.priceAmount,
          siteOrigin: new URL(request.url).origin,
        }),
      }),
    ]);
    for (const r of results) {
      if (r.status === 'rejected') console.error('registration email failed:', r.reason?.message);
    }
  };

  if (waitUntil) waitUntil(notify());
  else await notify();

  return Response.json(
    {
      id,
      courseTitle: slot.courseTitle,
      dateLabel,
      // Repeated on the thank-you page: the confirmation e-mail can be delayed
      // or filtered, and without this the payment can't be matched.
      transferTitle: transferTitle(dateLabel),
      consentVersion: CONSENT_VERSION,
    },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}
