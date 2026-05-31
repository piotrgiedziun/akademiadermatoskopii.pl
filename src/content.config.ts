/**
 * Content Collections — typed schemas for MD/MDX content.
 * Validated at build time. Any frontmatter mismatch errors the build.
 */

import { defineCollection, reference, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * CMS editors (Sveltia) write blank optional fields as "" or null, which Zod's
 * .optional()/.default() do NOT treat as "absent" — so an empty date/url/regex
 * field would fail validation. Strip empty strings, nulls and empty objects
 * before validation so blanks behave as omitted. Applied to every collection.
 */
function stripEmpty(value: unknown): unknown {
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map(stripEmpty).filter((v) => v !== '' && v !== null && v !== undefined);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const sv = stripEmpty(v);
      if (sv !== '' && sv !== null && sv !== undefined) out[k] = sv;
    }
    return out;
  }
  return value;
}

const courseStatus = z.enum(['open', 'filling', 'sold-out', 'cancelled']);
const courseCategory = z.enum([
  'dermatoskopia',
  'chirurgia',
  'laser',
  'nauka',
  'inne',
]);
const courseLevel = z.enum(['basic', 'intermediate', 'advanced', 'all']);

const dateSlot = z.object({
  start: z.coerce.date(),
  end: z.coerce.date().optional(),
  status: courseStatus.default('open'),
  capacity: z.number().int().positive().optional(),
  note: z.string().optional(),
});

const courses = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/courses' }),
  schema: z.preprocess(stripEmpty, z.object({
    title: z.string(),
    shortTitle: z.string().optional(),
    summary: z.string().max(260),
    category: courseCategory,
    level: courseLevel,
    durationDays: z.number().int().min(1).max(5),
    price: z.object({
      amount: z.number().int().positive(),
      currency: z.literal('PLN').default('PLN'),
      notes: z.string().optional(),
    }),
    location: z.object({
      city: z.string().default('Wrocław'),
      venue: z.string().optional(),
      address: z.string().optional(),
    }).default({ city: 'Wrocław' }),
    dates: z.array(dateSlot).default([]),
    capacityDefault: z.number().int().positive().optional(),
    includes: z.array(z.string()).default([]),
    targetAudience: z.array(z.string()).default([]),
    prerequisites: z.string().optional(),
    instructors: z.array(reference('instructors')).default([]),
    heroImageAlt: z.string().optional(),
    registrationUrl: z.string().url().default('https://forms.gle/eU6jfCAwqLAmzPzb9'),
    featured: z.boolean().default(false),
    isNew: z.boolean().default(false),
    order: z.number().int().default(0),
    draft: z.boolean().default(false),
    seo: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
    }).default({}),
  })),
});

const news = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/news' }),
  schema: ({ image }) => z.preprocess(stripEmpty, z.object({
    title: z.string(),
    summary: z.string().max(260),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    author: reference('instructors').optional(),
    tags: z.array(z.string()).default([]),
    // Accept an optimized import (existing posts, src/assets) OR a public URL
    // string (new CMS uploads to /images/news — Sveltia requires public paths).
    heroImage: z.union([image(), z.string()]).optional(),
    heroImageAlt: z.string().optional(),
    youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/).optional(),
    relatedCourses: z.array(reference('courses')).default([]),
    draft: z.boolean().default(false),
    seo: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
    }).default({}),
  })),
});

const instructors = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/instructors' }),
  schema: z.preprocess(stripEmpty, z.object({
    name: z.string(),
    titlePrefix: z.string().optional(),
    role: z.string(),
    bio: z.string(),
    photoAlt: z.string().optional(),
    specializations: z.array(z.string()).default([]),
    credentials: z.array(z.string()).default([]),
    links: z.array(z.object({
      label: z.string(),
      url: z.string().url(),
    })).default([]),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    featured: z.boolean().default(false),
    order: z.number().int().default(100),
  })),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: z.preprocess(stripEmpty, z.object({
    title: z.string(),
    tagline: z.string(),
    summary: z.string().max(300),
    status: z.enum(['active', 'beta', 'research', 'archived']).default('active'),
    heroImageAlt: z.string().optional(),
    partners: z.array(z.string()).default([]),
    links: z.array(z.object({
      label: z.string(),
      url: z.string().url(),
      kind: z.enum(['app-store', 'play-store', 'web', 'paper', 'video', 'other']),
    })).default([]),
    order: z.number().int().default(0),
    draft: z.boolean().default(false),
  })),
});

export const collections = { courses, news, instructors, projects };
