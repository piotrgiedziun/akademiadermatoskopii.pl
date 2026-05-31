/**
 * GET /oauth/auth — starts the GitHub OAuth flow for Sveltia/Decap CMS.
 *
 * The CMS opens this in a popup; we redirect to GitHub's consent screen and
 * set a short-lived CSRF state cookie that /oauth/callback verifies.
 *
 * Requires Cloudflare Pages environment variables:
 *   GITHUB_CLIENT_ID      — OAuth App client ID
 *   GITHUB_OAUTH_SCOPE    — optional, defaults to "repo" (use "public_repo" if the repo is public)
 */
export async function onRequestGet({ request, env }) {
  const clientId = env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return new Response('Missing GITHUB_CLIENT_ID environment variable.', { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const state = crypto.randomUUID();

  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', `${origin}/oauth/callback`);
  authorize.searchParams.set('scope', env.GITHUB_OAUTH_SCOPE || 'repo');
  authorize.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      'Set-Cookie': `csrf_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/oauth; Max-Age=600`,
      'Cache-Control': 'no-store',
    },
  });
}
