import type { App } from '../../app.ts';
import { getCharacter } from '../../content/catalog.ts';
import { CLASS_INFO, ELEMENT_INFO } from '../../content/classes.ts';
import { characterPower, displayStats, starMultiplier } from '../../content/squad.ts';
import { audio } from '../../core/audio.ts';
import { vibrate } from '../../core/device.ts';
import { canStarUp, levelProgress, setSquadSlot, starUp, starUpCost } from '../../meta/collection.ts';
import { maxCharacterLevel } from '../../meta/city.ts';
import { ECONOMY, formatNumber } from '../../meta/economy.ts';
import { RARITY_COLORS } from '../../render/colors.ts';
import { h } from '../dom.ts';
import { icon, type IconName } from '../icons.ts';
import { ELEMENT_NAMES } from '../panels/buildingPanel.ts';
import { RARITY_NAMES, lazyPortrait, starsRow } from '../panels/charCard.ts';

/** Detalhes de um personagem: vitrine 3D giratória, atributos, evolução e esquadrão. */
export function openCharacter(app: App, id: number, opts: { list?: number[]; onChange?: () => void } = {}): void {
  let current = id;
  const canvas = app.game.renderer.canvas;
  const stage = h('div', { class: 'cs-stage' });
  const titleBox = h('div', { class: 'cs-title' });
  const panel = h('div', { class: 'cs-panel scroll-y' });
  const nav = h('div', { class: 'cs-nav' });
  const anims = h(
    'div',
    { class: 'cs-anims' },
    h('button', { class: 'btn small dark', onClick: () => play('attack') }, icon('sword'), 'Ataque'),
    h('button', { class: 'btn small dark', onClick: () => play('ability') }, icon('bolt'), 'Habilidade'),
    h('button', { class: 'btn small dark', onClick: () => play('cheer') }, icon('star'), 'Festa'),
  );

  // arrastar gira, toque ataca
  let drag: { x: number; start: number; id: number } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, start: e.clientX, id: e.pointerId };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    app.showroom.drag(e.clientX - drag.x);
    drag.x = e.clientX;
  });
  stage.addEventListener('pointerup', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const tap = Math.abs(e.clientX - drag.start) < 8;
    drag = null;
    if (tap && app.showroom.pick(e.clientX, e.clientY, canvas) === 0) play('attack');
  });

  const play = (kind: 'attack' | 'ability' | 'cheer') => {
    if (!app.save.collection[current]) return;
    if (kind === 'attack') {
      app.showroom.attack(0);
      audio.play(getCharacter(current).range > 2 ? 'shoot' : 'hit');
    } else if (kind === 'ability') {
      app.showroom.cheer(0);
      audio.play('ability');
      audio.voice(current, 'ability');
    } else {
      app.showroom.setCelebrate(true);
      audio.voice(current, 'victory');
      setTimeout(() => app.showroom.setCelebrate(false), 1600);
    }
  };

  const render = () => {
    const save = app.save;
    const def = getCharacter(current);
    const owned = save.collection[current];
    const rc = RARITY_COLORS[def.rarity].css;
    screen.style.setProperty('--rar', rc);
    titleBox.replaceChildren(
      h('div', { class: `cs-rarity rar-${def.rarity} ${def.rarity === 'extremo' ? 'prismatic' : ''}` }, RARITY_NAMES[def.rarity]),
      h('div', { class: 'cs-name stroke' }, def.name),
      h('div', { class: 'cs-sub' }, def.title),
      h(
        'div',
        { class: 'cs-chips' },
        h('span', { class: 'chip small' }, h('span', { class: `el-dot el-bg-${def.element}` }), ELEMENT_NAMES[def.element]),
        h('span', { class: 'chip small' }, icon('squad'), CLASS_INFO[def.cls].name),
        h('span', { class: 'chip small' }, icon('bolt'), formatNumber(characterPower(def, owned))),
      ),
    );
    anims.style.display = owned ? '' : 'none';

    const s = displayStats(def, owned);
    const cost = owned ? starUpCost(owned) : null;
    const cap = Math.min(ECONOMY.characters.maxLevel, maxCharacterLevel(save));
    const children: (HTMLElement | null)[] = [];

    if (owned) {
      const lp = levelProgress(owned, cap);
      children.push(
        section(
          'Nível',
          h(
            'div',
            { class: 'cs-level' },
            h('div', { class: 'cs-lvl-num stroke' }, String(owned.level)),
            h(
              'div',
              { class: 'grow col' },
              h('div', { class: 'bar cyan' }, h('i', { style: { width: `${lp.pct * 100}%` } }), h('span', null, lp.capped ? 'NO LIMITE' : `${owned.xp}/${lp.need} XP`)),
              h('div', { class: 'cs-note dim' }, lp.capped ? `Limite do Quartel: nível ${cap}. Melhore o Quartel para subir mais.` : `Ganha XP lutando. Limite atual: nível ${cap}.`),
            ),
          ),
        ),
      );
      const canUp = canStarUp(save, current);
      children.push(
        section(
          'Estrelas',
          h(
            'div',
            { class: 'cs-stars' },
            starsRow(owned.stars),
            cost
              ? h(
                  'div',
                  { class: 'grow col' },
                  h('div', { class: `bar ${owned.fragments >= cost.fragments ? '' : 'pink'}` }, h('i', { style: { width: `${Math.min(100, (owned.fragments / cost.fragments) * 100)}%` } }), h('span', null, `${owned.fragments}/${cost.fragments} fragmentos`)),
                  h('div', { class: 'cs-note dim' }, `Cada estrela: +${Math.round(ECONOMY.characters.statPerStar * 100)}% de vida e dano. Repetidos viram fragmentos.`),
                )
              : h('div', { class: 'grow cs-note gold-text' }, 'Estrelas no máximo!'),
          ),
          cost
            ? h(
                'button',
                { class: `btn ${canUp.ok ? 'green' : 'dark'} cs-evolve`, onClick: () => evolve() },
                icon('up'),
                `Evoluir para ${owned.stars + 1}★`,
                h('span', { class: 'cost' }, icon('coin'), formatNumber(cost.coins)),
              )
            : null,
        ),
      );
    } else {
      children.push(
        section(
          'Ainda não encontrado',
          h('p', { class: 'cs-note' }, `Personagens ${RARITY_NAMES[def.rarity]} aparecem nos baús. Abra baús para completar a coleção!`),
        ),
      );
    }

    const next = owned && cost ? starMultiplier(owned.stars + 1) / starMultiplier(owned.stars) : 1;
    const stat = (ico: IconName, label: string, value: string, up?: string) =>
      h('div', { class: 'cs-stat' }, icon(ico), h('span', { class: 'dim' }, label), h('b', null, value), up ? h('em', { class: 'cs-up' }, up) : null);
    children.push(
      section(
        'Atributos',
        h(
          'div',
          { class: 'cs-stats' },
          stat('heart', 'Vida', formatNumber(s.hp), next > 1 ? `+${formatNumber(Math.round(s.hp * (next - 1)))}` : undefined),
          stat('sword', 'Dano', formatNumber(s.dmg), next > 1 ? `+${formatNumber(Math.round(s.dmg * (next - 1)))}` : undefined),
          stat('flame', 'Dano/s', formatNumber(s.dps)),
          stat('range', 'Alcance', s.range < 1.5 ? 'Corpo a corpo' : `${s.range.toFixed(1).replace('.', ',')} casas`),
          stat('speed', 'Velocidade', s.speed >= 1.15 ? 'Rápido' : s.speed <= 0.9 ? 'Lento' : 'Normal'),
          stat('energy', 'Custo', `${s.cost} de energia`),
          def.splash > 0 ? stat('target', 'Área', `${def.splash.toFixed(1).replace('.', ',')} casas`) : null,
          def.vsBuildings !== 100 ? stat('city', 'Em construções', `${def.vsBuildings}%`) : null,
        ),
      ),
    );
    const a = def.ability;
    children.push(
      section(
        'Habilidade',
        h(
          'div',
          { class: 'cs-ability' },
          h('div', { class: 'cs-ab-head' }, h('span', { class: 'cs-ab-ico' }, icon('bolt')), h('b', { class: 'stroke-sm' }, a.name), h('span', { class: 'chip small' }, icon('clock'), `${a.cooldown} s`)),
          h('p', null, a.description),
          h('p', { class: 'cs-note dim' }, `${ELEMENT_INFO[def.element].name} vence ${ELEMENT_NAMES[ELEMENT_INFO[def.element].beats]} (+30% de dano).`),
        ),
      ),
    );
    if (def.lore || def.lines)
      children.push(
        section(
          'História',
          def.lore ? h('p', { class: 'cs-lore' }, def.lore) : null,
          def.lines ? h('p', { class: 'cs-quote' }, `“${def.lines[0]}”`) : null,
        ),
      );

    // esquadrão
    const inSquad = save.squad.indexOf(current);
    if (owned)
      children.push(
        h(
          'div',
          { class: 'cs-actions' },
          inSquad >= 0
            ? h('div', { class: 'chip cs-in-squad' }, icon('check'), h('span', { class: 'stroke-sm' }, `No esquadrão (vaga ${inSquad + 1})`))
            : h('button', { class: 'btn blue', onClick: () => chooseSlot() }, icon('squad'), 'Colocar no esquadrão'),
        ),
      );
    panel.replaceChildren(...children.filter((x): x is HTMLElement => !!x));

    // setas para navegar na lista
    const list = opts.list ?? [];
    const idx = list.indexOf(current);
    const arrows: HTMLElement[] = [];
    if (idx > 0) arrows.push(h('button', { class: 'cs-arrow left', 'aria-label': 'Anterior', onClick: () => go(list[idx - 1]) }, icon('back')));
    if (idx >= 0 && idx < list.length - 1) arrows.push(h('button', { class: 'cs-arrow right', 'aria-label': 'Próximo', onClick: () => go(list[idx + 1]) }, icon('back')));
    nav.replaceChildren(...arrows);
  };

  const go = (next: number) => {
    current = next;
    app.showroom.showSingle(getCharacter(current), { silhouette: !app.save.collection[current] });
    panel.scrollTop = 0;
    render();
    audio.play('whoosh', { volume: 0.4, pitch: 1.4 });
  };

  const evolve = () => {
    const r = app.store.update('star-up', (d) => starUp(d, current));
    if (!r.ok) {
      app.ui.toast(r.reason, 'error');
      return;
    }
    const def = getCharacter(current);
    const stars = app.save.collection[current].stars;
    app.showroom.cheer(0);
    app.showroom.setCelebrate(true);
    setTimeout(() => app.showroom.setCelebrate(false), 1800);
    app.ui.flash(RARITY_COLORS[def.rarity].css, 380, 0.55);
    audio.play('levelUp');
    audio.voice(current, 'victory');
    vibrate([20, 40, 80]);
    app.ui.toast(`${def.name} agora tem ${stars} estrelas!`, 'gold', 'star');
    render();
    opts.onChange?.();
  };

  const chooseSlot = () => {
    const save = app.save;
    const m = app.ui.modal(
      h(
        'div',
        { class: 'panel slot-modal' },
        h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, `Quem sai para ${getCharacter(current).name} entrar?`)),
        h(
          'div',
          { class: 'panel-body slot-row' },
          ...save.squad.map((sid, i) => {
            const d = getCharacter(sid);
            const pic = h('div', { class: `mini-portrait big rar-${d.rarity}` });
            lazyPortrait(app, pic, sid);
            return h(
              'button',
              {
                class: 'slot-pick',
                onClick: () => {
                  const r = app.store.update('squad', (dd) => setSquadSlot(dd, i, current));
                  m.close();
                  if (!r.ok) return app.ui.toast(r.reason, 'error');
                  audio.play('deploy');
                  audio.voice(current, 'deploy');
                  app.showroom.cheer(0);
                  app.ui.toast(`${getCharacter(current).name} entrou no esquadrão!`, 'good', 'squad');
                  render();
                  opts.onChange?.();
                },
              },
              pic,
              h('span', { class: 'stroke-sm' }, d.name),
              h('span', { class: 'dim' }, `Nv ${save.collection[sid]?.level ?? 1}`),
            );
          }),
        ),
      ),
    );
  };

  const screen = h(
    'div',
    { class: 'char-screen' },
    stage,
    h('div', { class: 'cs-left' }, titleBox, anims),
    nav,
    h('button', { class: 'back-btn cs-back', 'aria-label': 'Voltar', onClick: () => app.ui.closeScreen() }, icon('back')),
    panel,
  );
  app.ui.openScreen(screen, () => app.popShowroom(), false, true);
  app.pushShowroom(
    () => {
      // abaixo do título e acima dos botões de animação
      const r = stage.getBoundingClientRect();
      const top = titleBox.getBoundingClientRect().bottom + 6;
      const bottom = anims.getBoundingClientRect().top - 4;
      return new DOMRect(r.left, top, r.width, Math.max(60, bottom - top));
    },
    (sr) => sr.showSingle(getCharacter(current), { silhouette: !app.save.collection[current] }),
  );
  render();
  if (app.save.collection[current]) setTimeout(() => audio.voice(current, 'deploy', 0.7), 250);
}

function section(title: string, ...body: (HTMLElement | null)[]): HTMLElement {
  return h('div', { class: 'cs-sec' }, h('div', { class: 'cs-sec-title' }, title), ...body);
}
