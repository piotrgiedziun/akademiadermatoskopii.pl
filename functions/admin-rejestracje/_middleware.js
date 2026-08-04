/**
 * Gate for everything under /admin-rejestracje/ — the static admin page and the
 * API routes beneath it. Because the middleware sits at this path (rather than
 * at the functions root), only these requests are routed through a Function;
 * the rest of the site stays a pure static asset hit.
 */

import { verifyAccess } from '../../src/server/access.js';

export async function onRequest(context) {
  const { request, env, next, data } = context;

  const email = await verifyAccess(request, env);
  if (!email) {
    return new Response(
      'Brak dostępu. Zaloguj się przez Cloudflare Access.',
      {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      },
    );
  }

  // Passed to the API routes so actions can be attributed to a real person.
  data.adminEmail = email;

  const response = await next();
  // Registration data must never sit in a shared cache.
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Robots-Tag', 'noindex');
  return new Response(response.body, { status: response.status, headers });
}
