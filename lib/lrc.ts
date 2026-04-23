// lib/lrc.ts
// Parser de archivos .lrc (lyrics sincronizadas). Formato:
//
//   [01:23.45]línea de letra
//   [02:10.00]siguiente línea
//
// Una línea puede tener múltiples timestamps ([01:00][02:30]Coro...) —
// la misma letra se repite en varios momentos. Devolvemos un array
// plano ordenado por tiempo.

export interface TimedLine {
  time: number; // segundos
  text: string;
}

// Parsea un contenido LRC completo.
export function parseLRC(raw: string): TimedLine[] {
  const lines: TimedLine[] = [];
  const rx = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

  for (const rawLine of raw.split(/\r?\n/)) {
    const stamps: number[] = [];
    let match: RegExpExecArray | null;
    rx.lastIndex = 0;
    while ((match = rx.exec(rawLine)) !== null) {
      const mm = parseInt(match[1]!, 10);
      const ss = parseInt(match[2]!, 10);
      const frac = match[3] ? parseInt(match[3].padEnd(3, "0").slice(0, 3), 10) / 1000 : 0;
      stamps.push(mm * 60 + ss + frac);
    }
    if (stamps.length === 0) continue;
    const text = rawLine.replace(rx, "").trim();
    if (!text) continue;
    for (const t of stamps) lines.push({ time: t, text });
  }

  lines.sort((a, b) => a.time - b.time);
  return lines;
}

// Dado un tiempo actual, devuelve el índice de la línea que está sonando
// (la última cuyo `time` es <= currentTime). -1 si no empezó ninguna.
export function currentLineIndex(lines: TimedLine[], currentTime: number): number {
  if (lines.length === 0) return -1;
  let lo = 0,
    hi = lines.length - 1,
    ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid]!.time <= currentTime) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
