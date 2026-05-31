/**
 * Static map of instructor slug → imported asset. Astro processes each import
 * at build time so the type and dimensions are known to <Image>.
 *
 * Keep this in sync with the slugs in src/content/instructors/.
 */

import type { ImageMetadata } from 'astro';
import calikImg from '@/assets/instructors/jacek-calik.jpg';
import sauerImg from '@/assets/instructors/natalia-sauer.png';
import giedziunImg from '@/assets/instructors/piotr-giedziun.jpeg';
import pietkiewiczImg from '@/assets/instructors/pawel-pietkiewicz.jpeg';
import wozniakImg from '@/assets/instructors/bartosz-wozniak.jpeg';
import slomiakImg from '@/assets/instructors/anna-slomiak-wasik.jpg';
import luciukImg from '@/assets/instructors/marek-luciuk.png';

export const INSTRUCTOR_PHOTOS: Record<string, ImageMetadata> = {
  'jacek-calik': calikImg,
  'natalia-sauer': sauerImg,
  'piotr-giedziun': giedziunImg,
  'pawel-pietkiewicz': pietkiewiczImg,
  'bartosz-wozniak': wozniakImg,
  'anna-slomiak-wasik': slomiakImg,
  'marek-luciuk': luciukImg,
};
