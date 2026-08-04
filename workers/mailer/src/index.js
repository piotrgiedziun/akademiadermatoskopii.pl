/**
 * akademia-mailer — sends the registration emails for /zapisy/.
 *
 * Exists because Pages Functions cannot bind `send_email` (Workers ✅ /
 * Pages ❌). Reaching Cloudflare Email Sending through this Worker instead of
 * its REST API means the site needs no API token at all: a service binding is
 * authorised by the platform, so there is no credential to store, rotate, or
 * leak from an open-source repository.
 *
 * Not publicly routable (`workers_dev: false`, no routes). The only caller is
 * the Pages project via its MAILER service binding.
 *
 * Deploy:  npx wrangler deploy --config workers/mailer/wrangler.jsonc
 */

/** Mirrors the sender allowlist in wrangler.jsonc; rejected early with a clear error. */
const ALLOWED_FROM = 'zapisy@akademiadermatoskopii.pl';

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { to, subject, html, text, replyTo, attachments, fromName } = payload;
    if (!to || !subject || (!html && !text)) {
      return Response.json(
        { error: 'Missing required field: to, subject, and html or text' },
        { status: 400 },
      );
    }

    // One recipient per call. Accepting an array here would turn a single
    // compromised call into a fan-out, and nothing in this project needs it.
    if (typeof to !== 'string') {
      return Response.json({ error: 'Field "to" must be a single address' }, { status: 400 });
    }

    // Rate limits are checked before the send, and a rejection is a hard 429 —
    // the caller treats email failures as non-fatal, so the worst case of a
    // false positive is a missing notification, never a lost registration.
    const global = await env.RL_GLOBAL.limit({ key: 'global' });
    if (!global.success) {
      console.warn('rate limit: global send cap hit');
      return Response.json({ error: 'Global send rate limit exceeded' }, { status: 429 });
    }

    const perRecipient = await env.RL_RECIPIENT.limit({ key: to.toLowerCase() });
    if (!perRecipient.success) {
      console.warn('rate limit: per-recipient cap hit');
      return Response.json({ error: 'Recipient rate limit exceeded' }, { status: 429 });
    }

    try {
      const result = await env.EMAIL.send({
        to,
        from: { email: ALLOWED_FROM, name: fromName || 'Akademia Dermatoskopii' },
        subject,
        ...(html ? { html } : {}),
        ...(text ? { text } : {}),
        ...(replyTo ? { replyTo } : {}),
        // The Workers binding takes raw bytes, unlike the REST API which wants
        // base64. Callers send base64 because it has to survive JSON.
        ...(attachments?.length
          ? {
              attachments: attachments.map((a) => ({
                ...a,
                content: base64ToBytes(a.content),
              })),
            }
          : {}),
      });

      return Response.json({ ok: true, messageId: result?.messageId ?? null });
    } catch (err) {
      // Surfaced to the caller so a registration can be logged with the reason,
      // but never shown to the visitor — their row is already saved.
      console.error('send failed:', err.code, err.message);
      return Response.json({ error: err.message, code: err.code }, { status: 502 });
    }
  },
};

function base64ToBytes(b64) {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
