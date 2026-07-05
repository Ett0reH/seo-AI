// Distribuisce le pubblicazioni su una finestra naturale (24-72h+), evitando
// simultaneità artificiale (requisito: non pubblicare tutto nello stesso minuto).

export interface ScheduleOptions {
  windowHours?: number;   // ampiezza finestra, default 72h
  minGapMinutes?: number; // distanza minima tra due slot, default 90'
  startFrom?: Date;       // inizio finestra, default: ora + 2h
}

// Genera N slot temporali sparsi con jitter, ordinati e con gap minimo garantito.
export function proposeSchedule(count: number, opts: ScheduleOptions = {}): Date[] {
  const windowHours = opts.windowHours ?? 72;
  const minGap = (opts.minGapMinutes ?? 90) * 60 * 1000;
  const start = (opts.startFrom ?? new Date(Date.now() + 2 * 60 * 60 * 1000)).getTime();
  const windowMs = windowHours * 60 * 60 * 1000;

  if (count <= 0) return [];

  // Slot base equidistanti + jitter pseudo-casuale entro metà intervallo.
  const step = windowMs / count;
  const slots: number[] = [];
  for (let i = 0; i < count; i++) {
    const base = start + step * i;
    const jitter = (Math.random() - 0.5) * step * 0.8;
    slots.push(base + jitter);
  }

  // Ordina e impone il gap minimo per non avere due post troppo ravvicinati.
  slots.sort((a, b) => a - b);
  for (let i = 1; i < slots.length; i++) {
    if (slots[i] - slots[i - 1] < minGap) {
      slots[i] = slots[i - 1] + minGap;
    }
  }
  return slots.map((t) => new Date(t));
}
