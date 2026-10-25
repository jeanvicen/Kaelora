// Calendário do jogo (dias, semanas e temporadas) num fuso fixo — horário de
// Brasília (UTC-3) — para cliente e servidor virarem o dia juntos.

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
const TZ_OFFSET = -3 * HOUR;
/** Início da temporada 1 (segunda-feira, 00:00 de Brasília). */
const SEASON_EPOCH = Date.UTC(2026, 0, 5, 3, 0, 0);

function local(now: number): number {
  return now + TZ_OFFSET;
}

/** "2026-10-25" no horário de Brasília. */
export function dayKey(now: number): string {
  return new Date(local(now)).toISOString().slice(0, 10);
}

/** Índice do dia (para comparar "ontem"). */
export function dayIndex(now: number): number {
  return Math.floor(local(now) / DAY);
}

/** Semana que começa na segunda-feira: "2026-W43". */
export function weekKey(now: number): string {
  const d = new Date(local(now));
  const day = (d.getUTCDay() + 6) % 7; // segunda = 0
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  const jan4 = Date.UTC(new Date(monday).getUTCFullYear(), 0, 4);
  const jan4Monday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY;
  const week = Math.floor((monday - jan4Monday) / (7 * DAY)) + 1;
  return `${new Date(monday + 3 * DAY).getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Quanto falta para o próximo dia (00:00 de Brasília). */
export function msUntilNextDay(now: number): number {
  return DAY - (local(now) % DAY);
}

/** Quanto falta para a próxima segunda-feira 00:00. */
export function msUntilNextWeek(now: number): number {
  const d = new Date(local(now));
  const day = (d.getUTCDay() + 6) % 7;
  return (7 - day) * DAY - (local(now) % DAY);
}

export function seasonOf(now: number, seasonDays: number): number {
  return Math.max(1, Math.floor((now - SEASON_EPOCH) / (seasonDays * DAY)) + 1);
}

export function seasonEndsAt(season: number, seasonDays: number): number {
  return SEASON_EPOCH + season * seasonDays * DAY;
}
