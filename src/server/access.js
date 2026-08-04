/**
 * Cloudflare Access JWT verification.
 *
 * Access already gates /admin-rejestracje/* at the edge, so this is defence in
 * depth — but it is not optional. The `Cf-Access-Authenticated-User-Email`
 * header is only trustworthy on a path Access actually covers; if the
 * application were deleted, renamed, or its path changed, that header becomes
 * attacker-controlled and trusting it alone would expose every registrant's
 * name, PWZ number, phone and invoice data.
 *
 * Verifying the signed assertion instead means the endpoint is safe even when
 * the Access configuration is wrong.
 */

const CERT_TTL_MS = 60 * 60 * 1000;
let certCache = { keys: null, fetchedAt: 0, team: null };

function b64urlToBytes(input) {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function decodeJson(segment) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(segment)));
}

async function getKeys(teamDomain) {
  const fresh = certCache.keys && certCache.team === teamDomain && Date.now() - certCache.fetchedAt < CERT_TTL_MS;
  if (fresh) return certCache.keys;

  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs unavailable (HTTP ${res.status})`);
  const { keys } = await res.json();

  certCache = { keys, fetchedAt: Date.now(), team: teamDomain };
  return keys;
}

/**
 * Returns the authenticated email, or null when the request is not a valid
 * Access session. Callers must treat null as 403 — never as anonymous access.
 */
export async function verifyAccess(request, env) {
  const teamDomain = env.ACCESS_TEAM_DOMAIN;
  const expectedAud = env.ACCESS_AUD;

  // Local-development escape hatch. Access runs at Cloudflare's edge and cannot
  // issue a session to localhost, so without this the panel is untestable
  // outside production.
  //
  // Interlocked against ACCESS_TEAM_DOMAIN: production always has that set, so
  // this branch is unreachable there even if ACCESS_DEV_EMAIL were added by
  // mistake. Disabling it would also break JWT verification below, which fails
  // closed — so a half-configured deployment 403s rather than opening up.
  if (!teamDomain && env.ACCESS_DEV_EMAIL) {
    console.warn(
      `⚠️  ACCESS BYPASSED as ${env.ACCESS_DEV_EMAIL} — local development only. ` +
        'If you see this in production, ACCESS_TEAM_DOMAIN is missing.',
    );
    return env.ACCESS_DEV_EMAIL.toLowerCase();
  }

  // Fail closed. An unconfigured deployment must not serve personal data.
  if (!teamDomain || !expectedAud) {
    console.error('ACCESS_TEAM_DOMAIN / ACCESS_AUD not set — refusing admin request');
    return null;
  }

  // Every rejection below logs why. Auth that fails silently is unfixable —
  // "Brak dostępu" alone cannot distinguish a wrong AUD from a stale key.
  const deny = (reason, detail) => {
    console.warn(`Access denied: ${reason}${detail ? ` — ${detail}` : ''}`);
    return null;
  };

  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') ||
    (request.headers.get('Cookie') || '').match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];
  if (!token) return deny('no token', 'neither Cf-Access-Jwt-Assertion nor CF_Authorization present');

  const parts = token.split('.');
  if (parts.length !== 3) return deny('malformed token', `${parts.length} segments`);
  const [headerB64, payloadB64, signatureB64] = parts;

  let header, payload;
  try {
    header = decodeJson(headerB64);
    payload = decodeJson(payloadB64);
  } catch (err) {
    return deny('undecodable token', err.message);
  }

  let keys;
  try {
    keys = await getKeys(teamDomain);
  } catch (err) {
    return deny('cert fetch failed', err.message);
  }

  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    // Almost always a team-domain mismatch rather than key rotation, so report
    // the issuer the token actually claims — that is the value ACCESS_TEAM_DOMAIN
    // should hold.
    return deny(
      'unknown signing key',
      `kid=${header.kid} not among ${keys.length} keys from ${teamDomain}; ` +
        `token iss=${payload.iss ?? '(none)'} aud=${JSON.stringify(payload.aud)}`,
    );
  }

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(signatureB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  if (!valid) return deny('bad signature');

  // A signature alone is not enough: without the audience check any Access
  // application on this account would grant entry to this one.
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(expectedAud))
    return deny('audience mismatch', `token aud=[${aud.join(', ')}] expected=${expectedAud}`);

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) return deny('token expired', `exp=${payload.exp} now=${now}`);
  if (payload.nbf && payload.nbf > now) return deny('token not yet valid');
  if (payload.iss && payload.iss !== `https://${teamDomain}`)
    return deny('issuer mismatch', `iss=${payload.iss} expected=https://${teamDomain}`);

  const email = payload.email?.toLowerCase() ?? null;
  if (!email) return deny('no email claim', `claims: ${Object.keys(payload).join(', ')}`);

  // Second, independent gate. The Access policy is the primary one, but it
  // lives in a dashboard where a single mistyped rule ("emails ending in
  // @gmail.com") would silently widen access to this data. Keeping the list in
  // the repository means it is reviewed like code.
  //
  // Optional: unset means "trust the Access policy alone", which is the
  // documented state rather than an accident, so it warns rather than locking
  // out an otherwise correctly configured deployment.
  const allowed = (env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!allowed.length) {
    console.warn('ADMIN_EMAILS not set — relying on the Cloudflare Access policy alone');
    return email;
  }

  if (!allowed.includes(email)) {
    return deny('not in ADMIN_EMAILS', `${email} not among ${allowed.length} allowed`);
  }

  return email;
}
