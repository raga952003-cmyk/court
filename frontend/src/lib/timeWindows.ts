import { SlotTime } from '../types';

/** Canonical slot label → start hour (24h) */
export const SLOT_START_HOUR: Record<string, number> = {
  '6-7 AM': 6,
  '7-8 AM': 7,
  '8-9 AM': 8,
  '9-10 AM': 9,
  '10-11 AM': 10,
  '11-12 PM': 11,
  '12-1 PM': 12,
  '1-2 PM': 13,
  '2-3 PM': 14,
  '3-4 PM': 15,
  '4-5 PM': 16,
  '5-6 PM': 17,
  '6-7 PM': 18,
  '7-8 PM': 19
};

export interface CampusTime {
  hour: number;
  minute: number;
}

/** Normalize slot labels from DB/UI (dashes, spaces, AM/PM case) to a canonical form. */
export function normalizeSlotLabel(slot: string): string {
  const cleaned = String(slot || '')
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const m = cleaned.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s*(AM|PM)$/i);
  if (m) {
    return `${parseInt(m[1], 10)}-${parseInt(m[2], 10)} ${m[3].toUpperCase()}`;
  }
  return cleaned;
}

/** Sort slot labels by start hour (unrecognized labels go last). */
export function sortSlotLabels(slots: string[]): string[] {
  return [...slots].sort((a, b) => {
    const ha = getSlotStartHour(a);
    const hb = getSlotStartHour(b);
    if (ha === null && hb === null) return normalizeSlotLabel(a).localeCompare(normalizeSlotLabel(b));
    if (ha === null) return 1;
    if (hb === null) return -1;
    return ha - hb;
  });
}

/** Resolve slot start hour (0–23). Null if unrecognized. */
export function getSlotStartHour(slot: string): number | null {
  const key = normalizeSlotLabel(slot);
  if (Object.prototype.hasOwnProperty.call(SLOT_START_HOUR, key)) {
    return SLOT_START_HOUR[key];
  }

  // Fallback parser for slight label variants
  const m = key.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s*(AM|PM)$/i);
  if (!m) return null;
  let start = parseInt(m[1], 10);
  const end = parseInt(m[2], 10);
  const period = m[3].toUpperCase();

  if (period === 'AM') {
    if (start === 12) return 0;
    return start;
  }
  // PM labels
  if (start === 12) return 12; // 12-1 PM
  if (start === 11 && end === 12) return 11; // 11-12 PM (ends at noon)
  return start + 12; // 1-2 PM → 13, 6-7 PM → 18
}

/** Wall clock in Asia/Kolkata (campus timezone), with safe fallback. */
export function getWallClockIST(): CampusTime {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date());
    let hour = Number(parts.find(p => p.type === 'hour')?.value);
    let minute = Number(parts.find(p => p.type === 'minute')?.value);
    if (hour === 24) hour = 0;
    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      return { hour, minute };
    }
  } catch {
    // fall through
  }

  // UTC+5:30 fallback if Intl fails
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const ist = new Date(utcMs + 5.5 * 3_600_000);
  return { hour: ist.getHours(), minute: ist.getMinutes() };
}

export function formatCampusTime(time: CampusTime): string {
  const h12 = time.hour % 12 || 12;
  const suffix = time.hour >= 12 ? 'PM' : 'AM';
  return `${h12}:${String(time.minute).padStart(2, '0')} ${suffix} IST`;
}

/**
 * True once the slot's start time has been reached (cannot newly book).
 * Compares hour+minute so freeze is exact.
 */
export function isSlotPastOrStarted(slot: string, time: CampusTime): boolean {
  const startHour = getSlotStartHour(slot);
  if (startHour === null) return false;
  const nowMinutes = time.hour * 60 + time.minute;
  const startMinutes = startHour * 60;
  return nowMinutes >= startMinutes;
}

/** Employee online self-booking: 10:00–19:59 (10 AM – 8 PM) */
export function isEmployeeOnlineBookingOpen(time: CampusTime): boolean {
  return time.hour >= 10 && time.hour < 20;
}

/**
 * Security desk assisted booking: all day while facilities are open (5:00–19:59).
 * Security may book on behalf of employees at any time in this window — not limited to mornings.
 */
export function isSecurityDeskBookingOpen(time: CampusTime): boolean {
  return isFacilitiesOpen(time);
}

/** Facilities operating window: 5:00–19:59 */
export function isFacilitiesOpen(time: CampusTime): boolean {
  return time.hour >= 5 && time.hour < 20;
}

export function slotTimeFromHour(hour: number): SlotTime | 'none' {
  if (hour >= 6 && hour < 7) return '6-7 AM';
  if (hour >= 7 && hour < 8) return '7-8 AM';
  if (hour >= 8 && hour < 9) return '8-9 AM';
  if (hour >= 9 && hour < 10) return '9-10 AM';
  if (hour >= 10 && hour < 11) return '10-11 AM';
  if (hour >= 11 && hour < 12) return '11-12 PM';
  if (hour >= 12 && hour < 13) return '12-1 PM';
  if (hour >= 13 && hour < 14) return '1-2 PM';
  if (hour >= 14 && hour < 15) return '2-3 PM';
  if (hour >= 15 && hour < 16) return '3-4 PM';
  if (hour >= 16 && hour < 17) return '4-5 PM';
  if (hour >= 17 && hour < 18) return '5-6 PM';
  if (hour >= 18 && hour < 19) return '6-7 PM';
  if (hour >= 19 && hour < 20) return '7-8 PM';
  return 'none';
}

export function isDemoSimulatedTimeEnabled(): boolean {
  return import.meta.env.VITE_SHOW_SIMULATED_TIME === 'true';
}

/** First bookable (not past) slot, or null. */
export function firstFutureSlot(slots: string[], time: CampusTime): string | null {
  for (const s of slots) {
    if (!isSlotPastOrStarted(s, time)) return s;
  }
  return null;
}
