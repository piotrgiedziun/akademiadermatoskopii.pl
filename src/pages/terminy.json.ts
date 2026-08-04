/**
 * Static slot catalogue — the bridge between build time and runtime.
 *
 * Pages Functions cannot call getCollection(), so the registration endpoint
 * needs course + capacity data from somewhere. Emitting it here at build time
 * keeps the course MDX as the single source of truth: adding an edition in
 * Sveltia is the only step needed to open registrations for it.
 *
 * Deliberately NOT under /api/ — that path belongs to the Functions routing
 * tree, and a collision there would be silent and confusing.
 *
 * Consumed by functions/api/register.js and functions/api/availability.js.
 */

import type { APIRoute } from 'astro';
import { buildSlotCatalogue } from '@/lib/slotCatalogue';

export const GET: APIRoute = async () => {
  const slots = await buildSlotCatalogue();

  return new Response(
    JSON.stringify({ generatedAt: new Date().toISOString(), slots }, null, 2),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
  );
};
