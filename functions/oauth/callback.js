/**
 * GET /oauth/callback — completes the GitHub OAuth flow for Sveltia/Decap CMS.
 *
 * Verifies the CSRF state, exchanges the code for an access token, then returns
 * an HTML page that hands the token back to the CMS window via postMessage
 * (the Netlify/Decap "authorization:github:*" handshake).
 *
 * Requires Cloudflare Pages environment variables:
 *   GITHUB_CLIENT_ID
 *   GITHUB_CLIENT_SECRET  (mark as a Secret / encrypted)
 */
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const cookie = request.headers.get('Cookie') || '';
  const savedState = (cookie.match(/(?:^|;\s*)csrf_state=([^;]+)/) || [])[1];

  if (!code) return new Response('Missing "code" parameter.', { status: 400 });
  if (!state || !savedState || state !== savedState) {
    return new Response('Invalid OAuth state.', { status: 403 });
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/oauth/callback`,
    }),
  });

  const data = await tokenRes.json().catch(() => ({}));
  const ok = Boolean(data && data.access_token);
  const status = ok ? 'success' : 'error';
  const content = ok
    ? { token: data.access_token, provider: 'github' }
    : { error: data.error_description || data.error || 'Authorization failed.' };

  return new Response(renderHandshake(status, content), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Set-Cookie': 'csrf_state=; HttpOnly; Secure; SameSite=Lax; Path=/oauth; Max-Age=0',
      'Cache-Control': 'no-store',
    },
  });
}

/** HTML that performs the Decap/Netlify postMessage handshake with the opener. */
function renderHandshake(status, content) {
  const message = `authorization:github:${status}:${JSON.stringify(content)}`;
  const payload = JSON.stringify(message);
  return `<!doctype html>
<html lang="pl">
  <head><meta charset="utf-8" /><title>Logowanie…</title></head>
  <body>
    <p>Trwa logowanie, możesz zamknąć to okno…</p>
    <script>
      (function () {
        var msg = ${payload};
        function send(e) {
          window.opener && window.opener.postMessage(msg, e && e.origin ? e.origin : '*');
          window.removeEventListener('message', send, false);
        }
        window.addEventListener('message', send, false);
        // Kick off the handshake; the CMS replies and we send the token back.
        window.opener && window.opener.postMessage('authorizing:github', '*');
      })();
    </script>
  </body>
</html>`;
}
