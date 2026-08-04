/**
 * Transactional email for /zapisy/.
 *
 * Sends through the MAILER service binding (workers/mailer), because Pages
 * Functions cannot bind `send_email` themselves (Workers ✅ / Pages ❌). A
 * service binding is authorised by the platform, so there is no API token
 * anywhere in this repository or its environment.
 *
 * Templates are ported from the Google Apps Script this replaces. Payment
 * details are reproduced verbatim from it and intentionally NOT taken from
 * src/lib/siteData.ts, whose BANK.owner is the trading name ("Akademia
 * Dermatoskopii") rather than the legal payee on the account.
 */

export const ADMIN_TO = 'kontakt@akademiadermatoskopii.pl';

/** Legal payee — must match what appears on the invoice, not the brand name. */
const PAYMENT = {
  account: '51 1050 1575 1000 0092 7136 6206',
  owner: 'Indywidualna Praktyka Lekarska Jacek Calik',
  street: 'ul. Szwedzka 11/13',
  city: '54-401 Wrocław',
};

const ORGANISER = {
  name: 'Olga Poślednia',
  email: 'kontakt@akademiadermatoskopii.pl',
  phone: '516 516 065',
  phoneHref: '+48516516065',
};

export function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Send one email. Returns the parsed API result.
 *
 * Callers decide whether a failure is fatal — for registration it is not: the
 * D1 row is written first, so a bounced notification never loses a signup.
 */
export async function sendEmail(env, { to, subject, html, text, attachments, replyTo }) {
  if (!env.MAILER) {
    // Absent under `wrangler pages dev` unless the mailer is running too.
    throw new Error('MAILER service binding unavailable');
  }

  // The hostname is arbitrary: a service binding is an in-process call, not a
  // network request, and never resolves through DNS.
  const res = await env.MAILER.fetch('https://mailer.internal/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, html, text, replyTo, attachments }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Email Sending: ${body.error || `HTTP ${res.status}`}`);
  return body;
}

/**
 * Fetch the site logo for inline embedding.
 *
 * The Apps Script pulled this from a third-party S3 bucket on every send; using
 * our own asset removes that dependency from the critical path. Returns null on
 * failure — a missing logo must never block a registration confirmation.
 */
export async function logoAttachment(context) {
  try {
    const url = new URL('/logo.png', context.request.url);
    const res = context.env?.ASSETS ? await context.env.ASSETS.fetch(url) : await fetch(url);
    if (!res.ok) return null;

    const bytes = new Uint8Array(await res.arrayBuffer());
    // REST API takes base64; the Workers binding would take the ArrayBuffer.
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);

    return {
      content: btoa(binary),
      filename: 'logo.png',
      type: 'image/png',
      disposition: 'inline',
      contentId: 'logoImage',
    };
  } catch {
    return null;
  }
}

/**
 * Transfer title the attendee should use, so payments can be reconciled.
 *
 * A template rather than their actual name: the same string is shown in the
 * confirmation e-mail, which is delivered to whatever address was typed into
 * the form and therefore must never echo submitted data back.
 */
export function transferTitle(dateLabel) {
  return `imię i nazwisko, ${dateLabel || 'data kursu'}`;
}

/**
 * Confirmation to the attendee — carries the payment details.
 *
 * Contains NO submitted values, by design. Anyone can type any address into the
 * form, so whatever this e-mail says gets delivered to that address from a
 * trusted medical domain. Interpolating the submitted name would turn the form
 * into a relay for arbitrary text; the greeting is impersonal instead, and the
 * transfer title is a template the payer fills in themselves. Every remaining
 * value here comes from the course MDX, not from the request.
 */
export function attendeeEmail({ courseTitle, dateLabel, priceAmount, hasLogo }) {
  const subject = 'Potwierdzenie rejestracji na kurs – Akademia Dermatoskopii';
  const title = transferTitle(dateLabel);

  const text = [
    'Dziękujemy za dokonanie rejestracji na kurs.',
    '',
    `Kurs: ${courseTitle}`,
    `Termin: ${dateLabel}`,
    `Cena: ${priceAmount} zł`,
    '',
    'W celu rezerwacji miejsca należy dokonać opłaty na poniżej podane konto:',
    '',
    PAYMENT.account,
    PAYMENT.owner,
    PAYMENT.street,
    PAYMENT.city,
    '',
    `Tytuł przelewu: ${title}   (wpisz swoje imię i nazwisko)`,
    '',
    'Szczegółowe informacje organizacyjne, zgłoszenia na kurs:',
    ORGANISER.name,
    ORGANISER.email,
    `tel. ${ORGANISER.phone}`,
  ].join('\n');

  const logo = hasLogo
    ? `<img src="cid:logoImage" alt="Akademia Dermatoskopii" style="max-width:260px; width:100%; height:auto; display:block;">`
    : `<strong style="font-size:20px; color:#1f2937;">Akademia Dermatoskopii</strong>`;

  const html = `<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0; padding:0; background-color:#f4f4f4; font-family:Arial, Helvetica, sans-serif; color:#333;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f4f4; margin:0; padding:30px 0;">
    <tr><td align="center">
      <table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="max-width:680px; width:100%; background:#ffffff; border-radius:12px; overflow:hidden;">
        <tr><td align="center" style="padding:30px 30px 20px 30px;">${logo}</td></tr>
        <tr><td style="padding:10px 40px 0 40px;">
          <h1 style="margin:0 0 20px 0; font-size:26px; line-height:1.3; color:#1f2937; text-align:center;">Potwierdzenie rejestracji</h1>
          <p style="margin:0 0 20px 0; font-size:16px; line-height:1.7;">Dzień dobry,</p>
          <p style="margin:0 0 20px 0; font-size:16px; line-height:1.7;">Dziękujemy za dokonanie rejestracji na kurs organizowany przez <strong>Akademię Dermatoskopii</strong>.</p>
        </td></tr>
        <tr><td style="padding:0 40px 10px 40px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 6px 0; font-size:14px; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px;">Kurs</p>
              <p style="margin:0 0 16px 0; font-size:18px; line-height:1.4; font-weight:bold; color:#111827;">${escapeHtml(courseTitle)}</p>
              <p style="margin:0 0 6px 0; font-size:14px; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px;">Termin</p>
              <p style="margin:0 0 16px 0; font-size:18px; line-height:1.4; color:#111827;">${escapeHtml(dateLabel)}</p>
              <p style="margin:0 0 6px 0; font-size:14px; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px;">Cena</p>
              <p style="margin:0; font-size:18px; line-height:1.4; color:#111827;">${priceAmount} zł</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 40px 0 40px;">
          <p style="margin:0 0 20px 0; font-size:16px; line-height:1.7;">W celu rezerwacji miejsca należy dokonać opłaty na poniżej podane konto:</p>
        </td></tr>
        <tr><td style="padding:0 40px 10px 40px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px;">
            <tr><td style="padding:24px;">
              <p style="margin:0 0 10px 0; font-size:14px; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px;">Numer konta</p>
              <p style="margin:0 0 20px 0; font-size:24px; line-height:1.4; font-weight:bold; color:#111827;">${PAYMENT.account}</p>
              <p style="margin:0; font-size:16px; line-height:1.8;">
                ${PAYMENT.owner}<br>
                ${PAYMENT.street}<br>
                ${PAYMENT.city}
              </p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 40px 10px 40px;">
          <p style="margin:0 0 12px 0; font-size:16px; line-height:1.7;"><strong>Tytuł przelewu</strong> — prosimy wpisać swoje imię i nazwisko oraz termin:</p>
          <p style="margin:0; font-size:16px; line-height:1.7; background:#fff7ed; border:1px solid #fed7aa; padding:14px 16px; border-radius:8px;">${escapeHtml(title)}</p>
        </td></tr>
        <tr><td style="padding:24px 40px 10px 40px;">
          <p style="margin:0 0 10px 0; font-size:16px; line-height:1.7;">W razie pytań dotyczących organizacji kursu prosimy o kontakt:</p>
          <p style="margin:0; font-size:16px; line-height:1.8;">
            <strong>${ORGANISER.name}</strong><br>
            <a href="mailto:${ORGANISER.email}" style="color:#2563eb; text-decoration:none;">${ORGANISER.email}</a><br>
            tel. <a href="tel:${ORGANISER.phoneHref}" style="color:#2563eb; text-decoration:none;">${ORGANISER.phone}</a>
          </p>
        </td></tr>
        <tr><td style="padding:30px 40px 40px 40px;">
          <p style="margin:0; font-size:15px; line-height:1.7; color:#6b7280;">Do zobaczenia na kursie!<br><strong style="color:#111827;">Zespół Akademii Dermatoskopii</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

/** Internal notification to kontakt@. Plain text is enough — it's a work item. */
export function adminEmail({ id, fullName, email, phone, pwz, titlePrefix, invoiceData, courseTitle, dateLabel, priceAmount, siteOrigin }) {
  const subject = `Nowa rejestracja: ${courseTitle} (${dateLabel})`;

  const text = [
    'Nowe zgłoszenie z formularza na stronie.',
    '',
    `Kurs:            ${courseTitle}`,
    `Termin:          ${dateLabel}`,
    `Cena:            ${priceAmount} zł`,
    '',
    `Imię i nazwisko: ${titlePrefix ? titlePrefix + ' ' : ''}${fullName}`,
    `Adres email:     ${email}`,
    `Numer telefonu:  ${phone || '—'}`,
    `PWZ:             ${pwz || '—'}`,
    '',
    'Dane do faktury:',
    invoiceData || '—',
    '',
    'Zgłoszenie oczekuje na potwierdzenie w panelu:',
    `${siteOrigin}/admin-rejestracje/`,
    '',
    `ID zgłoszenia: ${id}`,
  ].join('\n');

  return { subject, text, html: `<pre style="font-family:ui-monospace,Menlo,Consolas,monospace; font-size:14px; line-height:1.6;">${escapeHtml(text)}</pre>` };
}
