import { TZ_OFFSET_HOURS } from '../config';

export const DAY_NAMES: Record<number, string> = {
  0: 'Yakshanba',
  1: 'Dushanba',
  2: 'Seshanba',
  3: 'Chorshanba',
  4: 'Payshanba',
  5: 'Juma',
  6: 'Shanba',
};

export function fmtMoney(n: number): string {
  return n.toLocaleString('en-US').replace(/,/g, ' ') + " so'm";
}

/** Toshkent vaqti bo'yicha hozirgi Date (UTC maydonlari orqali o'qiladi) */
export function tashkentNow(): Date {
  return new Date(Date.now() + TZ_OFFSET_HOURS * 60 * 60 * 1000);
}

export function todayDate(): string {
  return tashkentNow().toISOString().slice(0, 10); // YYYY-MM-DD
}

export function todayDayOfWeek(): number {
  return tashkentNow().getUTCDay();
}

export function nowHM(): { hour: number; minute: number } {
  const t = tashkentNow();
  return { hour: t.getUTCHours(), minute: t.getUTCMinutes() };
}

export function parseTime(str: string): { hour: number; minute: number } | null {
  const m = str.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** vaqtga daqiqa qo'shib "HH:MM" emas {hour,minute} qaytaradi (kun chegarasidan oshsa null) */
export function addMinutes(t: { hour: number; minute: number }, delta: number) {
  const total = t.hour * 60 + t.minute + delta;
  if (total < 0 || total >= 24 * 60) return null;
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

export const MONTHS_UZ = [
  'yanvar','fevral','mart','aprel','may','iyun',
  'iyul','avgust','sentabr','oktabr','noyabr','dekabr',
];

/** "2026-07-25" -> "25-iyul" */
export function fmtDateUz(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}-${MONTHS_UZ[m - 1]}`;
}

/** "25.07.2026" | "25.07" | "2026-07-25" -> "YYYY-MM-DD" yoki null */
export function parseDateInput(s: string): string | null {
  const t = s.trim();
  let y: number, m: number, d: number;
  let match = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    [y, m, d] = [+match[1], +match[2], +match[3]];
  } else if ((match = t.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/))) {
    d = +match[1];
    m = +match[2];
    y = match[3] ? +match[3] : tashkentNow().getUTCFullYear();
  } else {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** iso sanaga kun qo'shish -> YYYY-MM-DD */
export function addDays(iso: string, days: number): string {
  const dt = new Date(iso + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export const ATT_LABELS: Record<string, string> = {
  came: '✅ Keldi',
  missed_unexcused: '❌ Kelmadi (sababsiz)',
  missed_excused: '⚠️ Kelmadi (ogohlantirgan)',
};
