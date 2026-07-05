import { proposeSchedule } from '../lib/scheduling';

// Scheduler Agent
// Propone una finestra di pubblicazione naturale (24-72h+) evitando simultaneità.
// In MVP-1 PROPONE soltanto gli orari: non pubblica nulla automaticamente.
export function proposeSlots(count: number): string[] {
  return proposeSchedule(count, { windowHours: 72, minGapMinutes: 90 }).map((d) => d.toISOString());
}
