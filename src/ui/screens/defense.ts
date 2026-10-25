import type { App } from '../../app.ts';
import { audio } from '../../core/audio.ts';
import { vibrate } from '../../core/device.ts';
import { coinsAtRisk, protection, revengeTarget } from '../../meta/defense.ts';
import { ECONOMY, formatDuration, formatNumber } from '../../meta/economy.ts';
import type { DefenseLogEntry, RevengeEntry } from '../../meta/types.ts';
import { decodeReplay } from '../../sim/replay.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { CHEST_NAMES } from './result.ts';

function ago(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 90) return 'agora há pouco';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return `há ${Math.round(s / 86400)} d`;
}

function defenseRow(app: App, e: DefenseLogEntry, compact = false): HTMLElement {
  return h(
    'div',
    { class: `def-row ${e.won ? 'held' : 'fell'}` },
    h('div', { class: 'def-badge stroke-sm' }, e.won ? 'DEFENDIDA' : 'SAQUEADA'),
    h(
      'div',
      { class: 'def-info' },
      h('b', { class: 'stroke-sm' }, e.attackerName),
      h('span', { class: 'dim' }, `${ago(e.at)} • ${e.stars}★${e.trophies ? ` • ${e.trophies > 0 ? '+' : ''}${e.trophies} troféus` : ''}`),
      !e.won ? h('span', { class: 'def-loss' }, icon('coin'), `-${formatNumber(e.coinsLost)}`, e.ruined.length ? ` • ${e.ruined.length} em ruínas` : '') : null,
    ),
    e.replay && !compact ? h('button', { class: 'btn small purple', onClick: () => app.watchDefenseReplay(e) }, icon('replay'), 'Replay') : null,
  );
}

/** "Sua cidade foi atacada!": resumo das invasões que aconteceram. */
export function showDefenseReport(app: App, entries: DefenseLogEntry[], onDone?: () => void): void {
  const fell = entries.some((e) => !e.won);
  audio.play(fell ? 'defeat' : 'victory', { volume: 0.7 });
  vibrate(fell ? [80, 60, 160] : [20, 30, 20]);
  const m = app.ui.modal(
    h(
      'div',
      { class: `panel def-report ${fell ? 'fell' : 'held'}` },
      h('div', { class: 'panel-head' }, icon('shield'), h('div', { class: 'panel-title' }, fell ? 'Sua cidade foi invadida!' : 'Sua cidade se defendeu!')),
      h(
        'div',
        { class: 'panel-body col' },
        ...entries.map((e) => defenseRow(app, e)),
        h(
          'div',
          { class: 'row def-actions' },
          h('button', { class: 'btn dark', onClick: () => (m.close(), openRevengeWall(app)) }, icon('flame'), 'Mural da Vingança'),
          h('button', { class: 'btn green', onClick: () => m.close() }, 'Ok'),
        ),
      ),
    ),
    {
      onClose: () => {
        app.act('defenseSeen', {});
        onDone?.();
      },
    },
  );
}

/** Cidade SAQUEADA: reconstruir do zero ou retomar em 48 h. */
export function showRaidChoice(app: App): void {
  const save = app.save;
  const pc = save.raids.pendingChoice;
  if (!pc) return;
  const entry = save.raids.revenge.find((e) => e.id === pc.revengeId);
  const pack = ECONOMY.raid.restartPack;
  const m = app.ui.modal(
    h(
      'div',
      { class: 'panel raid-choice' },
      h('div', { class: 'rc-alarm' }),
      h('div', { class: 'raid-title stroke' }, 'CIDADE SAQUEADA!'),
      h(
        'p',
        { class: 'raid-sub' },
        entry ? h('b', null, entry.raiderName) : 'Um rival',
        ' derrubou seu Núcleo',
        entry ? ` e levou ${formatNumber(entry.coinsLost)} moedas` : '',
        entry?.ruined.length ? `. ${entry.ruined.length} construções estão em ruínas.` : '.',
        h('br'),
        h('span', { class: 'raid-safe' }, icon('check'), 'Seus personagens estão a salvo.'),
      ),
      h(
        'div',
        { class: 'raid-options' },
        h(
          'button',
          {
            class: 'raid-opt retake',
            onClick: async () => {
              if (!(await app.raidChoice('retake'))) return;
              m.close();
              audio.play('ultimateReady');
              if (entry) {
                const go = await app.ui.confirm('Hora da vingança!', `Invadir ${entry.raiderName} agora? Vencendo, você recupera tudo + ${Math.round(ECONOMY.raid.retakeBonus * 100)}% de bônus.`, 'Revidar!', 'Depois');
                if (go) app.startRevenge(entry.id);
              }
            },
          },
          icon('swords'),
          h('b', { class: 'stroke-sm' }, 'Retomar'),
          h('span', null, `Você tem ${ECONOMY.raid.retakeHours} h para invadir quem te saqueou e recuperar tudo + ${Math.round(ECONOMY.raid.retakeBonus * 100)}%.`),
        ),
        h(
          'button',
          {
            class: 'raid-opt rebuild',
            onClick: async () => {
              const ok = await app.ui.confirm('Reconstruir do zero?', 'Sua cidade volta ao começo (personagens, diamantes e conta continuam).', 'Reconstruir', 'Voltar', true);
              if (!ok || !(await app.raidChoice('rebuild'))) return;
              m.close();
              app.afterRebuild();
            },
          },
          icon('build'),
          h('b', { class: 'stroke-sm' }, 'Reconstruir do zero'),
          h('span', null, `Cidade nova + Pacote de Recomeço: ${formatNumber(pack.coins)} moedas e ${CHEST_NAMES[pack.chest]}.`),
        ),
      ),
      h('div', { class: 'raid-shield dim' }, icon('shield'), `Escudo de ${ECONOMY.raid.shieldHours} h ativo: ninguém pode te invadir agora.`),
    ),
    { dismissable: false, closeButton: false },
  );
}

function revengeRow(app: App, e: RevengeEntry): HTMLElement {
  const now = Date.now();
  const open = !e.done && e.expiresAt > now;
  return h(
    'div',
    { class: `rev-row ${open ? 'open' : e.done ? 'done' : 'expired'}` },
    h('div', { class: 'rev-skull' }, icon(open ? 'flame' : e.done ? 'check' : 'clock')),
    h(
      'div',
      { class: 'def-info' },
      h('b', { class: 'stroke-sm' }, e.raiderName),
      h('span', { class: 'dim' }, open ? `Levou ${formatNumber(e.coinsLost)} moedas • ${formatDuration(Math.round((e.expiresAt - now) / 1000))} para revidar` : e.done ? 'Vingança concluída' : 'O prazo acabou'),
    ),
    open ? h('button', { class: 'btn small red', onClick: () => app.startRevenge(e.id) }, icon('swords'), 'Revidar') : null,
  );
}

/** Mural da Vingança + registro de defesas + estado do escudo. */
export function openRevengeWall(app: App): void {
  const save = app.save;
  const now = Date.now();
  const prot = protection(save, now);
  const status =
    prot.kind === 'beginner'
      ? h('div', { class: 'chip shield-chip' }, icon('shield'), h('span', { class: 'stroke-sm' }, `Proteção de iniciante: ${formatDuration(Math.round((prot.until - now) / 1000))} (ou até o nível ${ECONOMY.raid.beginnerLevel})`))
      : prot.kind === 'shield'
        ? h('div', { class: 'chip shield-chip' }, icon('shield'), h('span', { class: 'stroke-sm' }, `Escudo: ${formatDuration(Math.round((prot.until - now) / 1000))}`))
        : h('div', { class: 'chip shield-chip off' }, icon('shield'), h('span', { class: 'stroke-sm' }, 'Sem escudo'));
  const revs = save.raids.revenge;
  const log = save.raids.log;
  const screen = h(
    'div',
    { class: 'revenge-screen' },
    h(
      'div',
      { class: 'scr-head' },
      h('button', { class: 'back-btn', 'aria-label': 'Voltar', onClick: () => app.ui.closeScreen() }, icon('back')),
      h('div', { class: 'scr-title stroke' }, 'Mural da Vingança'),
      h('div', { class: 'grow' }),
      status,
    ),
    h(
      'div',
      { class: 'rev-body' },
      h(
        'div',
        { class: 'rev-col panel' },
        h('div', { class: 'panel-head' }, icon('flame'), h('div', { class: 'panel-title' }, 'Quem te saqueou')),
        h('div', { class: 'panel-body col scroll-y' }, ...(revs.length ? revs.map((e) => revengeRow(app, e)) : [h('p', { class: 'dim rev-empty' }, 'Ninguém derrubou seu Núcleo ainda. Continue assim!')])),
      ),
      h(
        'div',
        { class: 'rev-col panel' },
        h('div', { class: 'panel-head' }, icon('shield'), h('div', { class: 'panel-title' }, 'Defesas da cidade')),
        h(
          'div',
          { class: 'panel-body col scroll-y' },
          h('p', { class: 'dim rev-tip' }, `Moedas em risco agora: ${formatNumber(coinsAtRisk(save))}. O Cofre protege parte delas.`),
          ...(log.length ? log.map((e) => defenseRow(app, e)) : [h('p', { class: 'dim rev-empty' }, 'Nenhum ataque ainda. Monte bem as defesas: a ordem na estrada segue a distância até a entrada!')]),
        ),
      ),
    ),
  );
  app.ui.openScreen(screen);
  if (log.some((e) => !e.seen)) app.act('defenseSeen', {});
}

/** Cidade de quem saqueou, para revidar (offline gera; online o servidor manda a real). */
export function revengeCity(app: App, id: string) {
  return revengeTarget(app.save, id);
}

export function replayOf(e: DefenseLogEntry) {
  return decodeReplay(e.replay);
}
