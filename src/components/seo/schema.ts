/**
 * JSON-LD builders for Schema.org structured data.
 *
 * Rich-result eligibility is a real SEO lever — especially `Course`,
 * which lets Google render course title, provider, location, and dates
 * directly in search results.
 */

import type { CollectionEntry } from 'astro:content';
import { SITE_URL, SITE_NAME, LOGO_URL } from '@/consts';
import { ADDRESS, EMAIL, CONTACTS, OPENING_HOURS } from '@/lib/siteData';

type CourseStatus = 'open' | 'filling' | 'sold-out' | 'cancelled';

/**
 * TODO(learning-mode A): map internal CourseStatus → schema.org availability URL.
 *
 * Trade-off: Google Course rich-result guidance expects Offer.availability per
 * CourseInstance. Which statuses do we surface as bookable? Do we still emit
 * sold-out CourseInstances (transparent, lets users see interest) or drop them
 * from the payload (keeps listing "clean" for search)?
 *
 * See: https://schema.org/ItemAvailability
 *   - https://schema.org/InStock
 *   - https://schema.org/LimitedAvailability
 *   - https://schema.org/SoldOut
 *   - https://schema.org/Discontinued
 *
 * Safe default below — user can refine.
 */
export function mapAvailability(status: CourseStatus): string {
  switch (status) {
    case 'open':
      return 'https://schema.org/InStock';
    case 'filling':
      return 'https://schema.org/LimitedAvailability';
    case 'sold-out':
      return 'https://schema.org/SoldOut';
    case 'cancelled':
      return 'https://schema.org/Discontinued';
  }
}

/** MedicalBusiness + EducationalOrganization — homepage + /kontakt/. */
export function medicalBusinessSchema() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': ['MedicalBusiness', 'EducationalOrganization'],
        '@id': `${SITE_URL}/#org`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}${LOGO_URL}`,
        image: `${SITE_URL}/og/og-default.png`,
        telephone: CONTACTS.map((c) => c.phone),
        email: EMAIL,
        address: {
          '@type': 'PostalAddress',
          streetAddress: ADDRESS.streetAddress,
          addressLocality: ADDRESS.city,
          postalCode: ADDRESS.postalCode,
          addressCountry: ADDRESS.country,
        },
        openingHoursSpecification: OPENING_HOURS.map(() => ({
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          opens: '09:00',
          closes: '17:00',
        })),
        sameAs: [
          'https://facebook.com/akademiadermatoskopii',
          'https://www.youtube.com/channel/UC7REIrAz1Xxp4CQF-yIORgg',
        ],
      },
    ],
  };
}

/** Course with CourseInstance per scheduled date. */
export function courseSchema(course: CollectionEntry<'courses'>, pageUrl: string) {
  const d = course.data;
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: d.title,
    description: d.summary,
    url: pageUrl,
    provider: { '@type': 'Organization', '@id': `${SITE_URL}/#org` },
    offers: {
      '@type': 'Offer',
      price: d.price.amount,
      priceCurrency: d.price.currency,
      availability: 'https://schema.org/InStock',
      url: d.registrationUrl,
    },
    hasCourseInstance: d.dates.map((slot) => ({
      '@type': 'CourseInstance',
      courseMode: 'Onsite',
      startDate: slot.start.toISOString().slice(0, 10),
      endDate: (slot.end ?? slot.start).toISOString().slice(0, 10),
      location: {
        '@type': 'Place',
        name: d.location.venue ?? 'Akademia Dermatoskopii',
        address: {
          '@type': 'PostalAddress',
          streetAddress: d.location.address ?? ADDRESS.streetAddress,
          addressLocality: d.location.city,
          postalCode: ADDRESS.postalCode,
          addressCountry: ADDRESS.country,
        },
      },
      offers: {
        '@type': 'Offer',
        price: d.price.amount,
        priceCurrency: d.price.currency,
        availability: mapAvailability(slot.status),
        url: d.registrationUrl,
      },
    })),
  };
}

/** NewsArticle — per article page. */
export function articleSchema(
  post: CollectionEntry<'news'>,
  pageUrl: string,
  imageUrl?: string,
) {
  const d = post.data;
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: d.title,
    description: d.summary,
    datePublished: d.publishedAt.toISOString(),
    dateModified: (d.updatedAt ?? d.publishedAt).toISOString(),
    mainEntityOfPage: pageUrl,
    image: imageUrl ? [imageUrl] : [`${SITE_URL}/og/og-default.png`],
    publisher: { '@id': `${SITE_URL}/#org` },
    author: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
  };
}

/** Person — instructor schema. */
export function personSchema(instructor: CollectionEntry<'instructors'>, pageUrl: string) {
  const d = instructor.data;
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: `${d.titlePrefix ? d.titlePrefix + ' ' : ''}${d.name}`.trim(),
    jobTitle: d.role,
    description: d.bio,
    url: pageUrl,
    worksFor: { '@id': `${SITE_URL}/#org` },
    knowsAbout: d.specializations,
  };
}

/** BreadcrumbList — every non-homepage route. */
export function breadcrumbSchema(crumbs: { label: string; href: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      item: c.href.startsWith('http') ? c.href : `${SITE_URL}${c.href}`,
    })),
  };
}

/** ItemList<Course> — catalog page. */
export function courseItemListSchema(
  courses: CollectionEntry<'courses'>[],
  basePath: string,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: courses.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_URL}${basePath}${c.id}/`,
      name: c.data.title,
    })),
  };
}

/** FAQ page schema — when MDX contains FAQ items. */
export function faqPageSchema(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.question,
      acceptedAnswer: { '@type': 'Answer', text: i.answer },
    })),
  };
}
