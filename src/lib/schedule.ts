/**
 * 2026 course schedule (harmonogram). Single source of truth shared by the
 * /kursy catalog and each course detail page. Each entry's `slug` links it to a
 * course; `scheduleForCourse()` returns just that course's editions.
 */
export interface ScheduleEntry {
  date: string;
  title: string;
  slug?: string;
  soldOut?: boolean;
}

export const SCHEDULE: ScheduleEntry[] = [
  { date: '16–17.01.2026', title: 'Kurs dermatoskopowy podstawowy', slug: 'dermatoskopia-podstawowa', soldOut: true },
  { date: '21.02.2026', title: 'Kurs Chirurgia skóry – intensywne warsztaty praktyczne', slug: 'chirurgia-skory', soldOut: true },
  { date: '27–28.02.2026', title: 'Kurs dermatoskopowy podstawowy', slug: 'dermatoskopia-podstawowa', soldOut: true },
  { date: '6–7.03.2026', title: 'Kurs dermatoskopowy zaawansowany', slug: 'dermatoskopia-zaawansowana', soldOut: true },
  { date: '13–14.03.2026', title: 'Kurs dermatoskopowy podstawowy', slug: 'dermatoskopia-podstawowa' },
  { date: '21.03.2026', title: 'Trudne lokalizacje w dermatoskopii', slug: 'trudne-lokalizacje' },
  { date: '22.03.2026', title: 'Pisanie prac naukowych', slug: 'pisanie-prac-naukowych', soldOut: true },
  { date: '18.04.2026', title: 'Kurs pisania prac naukowych', slug: 'pisanie-prac-naukowych' },
  { date: '24–25.04.2026', title: 'Kurs dermatoskopowy podstawowy', slug: 'dermatoskopia-podstawowa' },
  { date: '22–23.05.2026', title: 'Kurs dermatoskopowy podstawowy', slug: 'dermatoskopia-podstawowa' },
  { date: '30.05.2026', title: 'Kurs Chirurgia skóry – intensywne warsztaty praktyczne', slug: 'chirurgia-skory', soldOut: true },
  { date: '5–6.06.2026', title: 'Laser CO2 – teoria i praktyka', slug: 'laser-co2', soldOut: true },
  { date: '12–13.06.2026', title: 'Kurs dermatoskopowy zaawansowany', slug: 'dermatoskopia-zaawansowana' },
  { date: '19–20.06.2026', title: 'Kurs dermatoskopowy podstawowy', slug: 'dermatoskopia-podstawowa' },
  { date: '19.09.2026', title: 'Pisanie prac naukowych', slug: 'pisanie-prac-naukowych' },
  { date: '25–26.09.2026', title: 'Kurs dermatoskopowy podstawowy', slug: 'dermatoskopia-podstawowa' },
  { date: '9–10.10.2026', title: 'Kurs dermatoskopowy podstawowy', slug: 'dermatoskopia-podstawowa' },
  { date: '24.10.2026', title: 'Kurs chirurgia skóry', slug: 'chirurgia-skory' },
  { date: '31.10.2026', title: 'Trudne lokalizacje w dermatoskopii', slug: 'trudne-lokalizacje' },
  { date: '20–21.11.2026', title: 'Kurs dermatoskopowy zaawansowany', slug: 'dermatoskopia-zaawansowana' },
  { date: '27–28.11.2026', title: 'Kurs dermatoskopowy podstawowy', slug: 'dermatoskopia-podstawowa' },
  { date: '11–12.12.2026', title: 'Kurs dermatoskopowy podstawowy', slug: 'dermatoskopia-podstawowa' },
];

/** All scheduled editions for a given course slug, in chronological order. */
export function scheduleForCourse(slug: string): ScheduleEntry[] {
  return SCHEDULE.filter((e) => e.slug === slug);
}
