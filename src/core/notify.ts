import type { App } from '../app.ts';
import { protection } from '../meta/defense.ts';
import { freeChestStatus } from '../meta/retention.ts';
import { msUntilNextDay, msUntilNextWeek } from '../meta/time.ts';
import { BUILDINGS } from '../meta/buildings.ts';
import { showNotification } from './device.ts';

/**
 * Notificações do PWA: baú grátis pronto, melhoria concluída, escudo
 * acabando, prêmio de login e evento novo. Quando o app vai para segundo
 * plano, agendamos os próximos avisos (funciona enquanto o sistema mantém o
 * app vivo; com Web Push no servidor dá para avisar com o app fechado).
 */
const MAX_DELAY = 24 * 3_600_000;
let timers: ReturnType<typeof setTimeout>[] = [];

function clear(): void {
  for (const t of timers) clearTimeout(t);
  timers = [];
}

function at(ms: number, title: string, body: string, tag: string): void {
  if (ms <= 1000 || ms > MAX_DELAY) return;
  timers.push(setTimeout(() => void showNotification(title, body, tag), ms));
}

export function scheduleNotifications(app: App): void {
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    clear();
    if (document.visibilityState !== 'hidden' || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const s = app.save;
    const now = Date.now();
    const fc = freeChestStatus(s, now);
    if (fc.ready < fc.max) at(fc.nextAt - now, 'Baú grátis pronto!', 'Volte para Kaelora e pegue seu baú.', 'free-chest');
    for (const b of s.city.buildings)
      if (b.upgradeEndsAt && b.upgradeEndsAt > now) at(b.upgradeEndsAt - now, 'Melhoria concluída', `${BUILDINGS[b.type].name} chegou ao nível ${b.level + 1}!`, `up-${b.id}`);
    const prot = protection(s, now);
    if (prot.kind === 'shield') at(prot.until - now - 30 * 60_000, 'Seu escudo está acabando', 'Em 30 minutos sua cidade pode ser invadida. Reforce as defesas!', 'shield');
    at(msUntilNextDay(now) + 60_000, 'Prêmio de login liberado', 'Seu prêmio do dia está esperando. Não quebre a sequência!', 'login');
    at(msUntilNextWeek(now) + 120_000, 'Evento novo começando!', 'Um evento semanal com regras especiais acabou de começar.', 'event');
  });
}

/** Aviso imediato (ex.: cidade atacada, recebido em tempo real). */
export function notifyNow(title: string, body: string, tag: string): void {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') void showNotification(title, body, tag);
}
