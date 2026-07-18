export const COURSE = {
  TOTAL: 1_200_000,
  LESSONS: 12,
  LESSON_PRICE: 100_000,
} as const;

export const SCHEDULE_DEFAULTS: { dayOfWeek: number; lessonTime: string }[] = [
  { dayOfWeek: 1, lessonTime: '18:00' }, // Dushanba
  { dayOfWeek: 3, lessonTime: '18:00' }, // Chorshanba
  { dayOfWeek: 5, lessonTime: '18:00' }, // Juma
];

export const TZ_OFFSET_HOURS = 5; // Asia/Tashkent, DST yo'q
export const MORNING_HOUR = 11;
export const PRE_LESSON_MINUTES = 10;
export const LESSON_END_PROMPT_MINUTES = 120;
