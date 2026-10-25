import * as THREE from 'three';
import { registerSW } from 'virtual:pwa-register';
import { audio } from './core/audio.ts';
import { enterFullscreenLandscape, setVibration, vibrate } from './core/device.ts';
import { Game, type GameOverlay } from './core/game.ts';
import { loadSave } from './core/save.ts';
import { Store } from './core/store.ts';
import { BUILDINGS, levelStats } from './meta/buildings.ts';
import {
  buyBuilding,
  collect,
  finishUpgrades,
  moveBuilding,
  placeFromStorage,
  repair,
  speedUp,
  startUpgrade,
  storeBuilding,
} from './meta/city.ts';
import { formatNumber } from './meta/economy.ts';
import { nextGoal } from './meta/goals.ts';
import { migrateSave, newGame } from './meta/newGame.ts';
import type { BuildingType, ChestType, Element, SaveData } from './meta/types.ts';
import { ELEMENT_COLORS } from './render/colors.ts';
import { createBuildingView } from './render/models/factory.ts';
import { detectPreset, presetConfig } from './render/renderer.ts';
import { Thumbnailer } from './render/thumbnailer.ts';
import { CityScene } from './scenes/city/CityScene.ts';
import { BattleScene, type BattleKind, type BattleParams } from './scenes/battle/BattleScene.ts';
import { buildRaidSetup, type EventRules } from './content/battleSetup.ts';
import type { BotCity } from './content/botCity.ts';
import { getCharacter } from './content/catalog.ts';
import { buildSquad } from './content/squad.ts';
import { CharacterView } from './render/characterView.ts';
import { applyBattleResult, consumeTarget } from './meta/raids.ts';
import { metaRng } from './meta/rng.ts';
import type { BattleSim } from './sim/battle.ts';
import { decodeReplay, encodeReplay, type Replay } from './sim/replay.ts';
import type { BattleResult } from './sim/types.ts';
import { openInvasionMap } from './ui/screens/invasion.ts';
import { openSquad } from './ui/screens/squad.ts';
import { openChests } from './ui/screens/chests.ts';
import { showLevelUp } from './ui/screens/levelUp.ts';
import { createChestView } from './render/models/chest.ts';
import { Showroom } from './render/showroom.ts';
import { showResult } from './ui/screens/result.ts';
import { h } from './ui/dom.ts';
import { CityHud, type NavTab } from './ui/hud/cityHud.ts';
import { BuildingPanel, ELEMENT_NAMES } from './ui/panels/buildingPanel.ts';
import { openBuildShop } from './ui/panels/buildShop.ts';
import { EditBar } from './ui/panels/editBar.ts';
import { openSettings } from './ui/screens/settings.ts';
import { showLogin, showSplash } from './ui/screens/intro.ts';
import { UI } from './ui/ui.ts';
import { icon } from './ui/icons.ts';

/**
 * Raiz do jogo: liga o save, o loop 3D, as cenas e a interface.
 * As telas chamam ações daqui; as ações mexem no save via `store.update`.
 */
export class App {
  store!: Store;
  game!: Game;
  ui: UI;
  city!: CityScene;
  hud!: CityHud;
  panel!: BuildingPanel;
  editBar!: EditBar;
  thumbs!: Thumbnailer;
  battle!: BattleScene;
  /** Vitrine 3D compartilhada pelas telas de personagens (e baús). */
  readonly showroom = new Showroom();
  private overlayStack: ({ kind: 'showroom'; frame: () => DOMRect | null; setup: (s: Showroom) => void } | { kind: 'custom'; overlay: GameOverlay })[] = [];
  private battleCtx: { target: BotCity | null; kind: BattleKind; squad: number[]; revengeId?: string } | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private uiRoot: HTMLElement,
  ) {
    this.ui = new UI(uiRoot);
  }

  get save(): SaveData {
    return this.store.data;
  }

  // ------------------------------------------------------------ boot

  async boot(): Promise<void> {
    const splash = showSplash(this.ui.screens);
    splash.setProgress(0.1);
    const loaded = await loadSave();
    splash.setProgress(0.35);
    const graphics = loaded?.settings.graphics ?? detectPreset();
    this.game = new Game(this.canvas, graphics);
    this.thumbs = new Thumbnailer(this.game.renderer.renderer);
    this.ui.onOpaqueChange = (covered) => (this.game.renderSuspended = covered);
    splash.setProgress(0.55);
    // Pequena pausa para o logo respirar (e as fontes carregarem).
    await Promise.all([document.fonts?.ready, new Promise((r) => setTimeout(r, 900))]);
    splash.setProgress(1);
    await splash.done();

    let data: SaveData;
    if (loaded) {
      data = migrateSave(loaded);
    } else {
      const login = await showLogin(this.ui.screens, { cloud: false });
      data = newGame(login.name, Date.now(), graphics);
      data.city.element = login.element;
      void enterFullscreenLandscape();
    }
    this.store = new Store(data);
    if (!loaded) await this.store.flush(true);
    this.applySettings();

    this.city = new CityScene(
      {
        getSave: () => this.store.data,
        onSelect: (id) => this.onSelect(id),
        commitMove: (id, x, z, rot) => this.commitMove(id, x, z, rot),
        onPlacementValidity: (v) => this.editBar.setPlacementValid(v),
        onCollect: (id) => this.collect(id),
      },
      this.uiRoot,
      presetConfig(graphics).cityLife,
    );
    this.game.register(this.city);
    this.battle = new BattleScene({
      uiRoot: this.ui.hud,
      hitStop: (ms) => this.game.hitStop(ms),
      slowMotion: (sc, t) => this.game.slowMotion(sc, t),
      portrait: (id) => this.characterPortrait(id),
      settings: () => {
        const st = this.store.data.settings;
        return { shake: st.shake, vibration: st.vibration, quality: presetConfig(st.graphics).particles };
      },
      onEnd: (result, sim, params) => this.onBattleEnd(result, sim, params),
      onPause: () => this.openPause(),
    });
    this.game.register(this.battle);
    this.hud = new CityHud(this);
    this.panel = new BuildingPanel(this);
    this.editBar = new EditBar(this);
    this.showCityHud();
    this.game.go('city');
    this.game.onFrame = () => this.thumbs.pump(2);
    this.game.start();
    document.body.classList.add('game-ready');

    this.store.on('change', () => this.city.active && this.city.refresh());
    setInterval(() => this.tick(), 1000);
    this.tick();
    this.registerServiceWorker();
    this.canvas.addEventListener('pointerdown', () => audio.unlock(), { once: true });
    // replay compartilhado por link (#replay=...)
    if (location.hash.startsWith('#replay=')) {
      const rep = decodeReplay(location.hash.slice(8));
      history.replaceState(null, '', location.pathname + location.search);
      if (rep) setTimeout(() => this.watchReplay(rep), 600);
      else this.ui.toast('Link de replay inválido', 'error');
    }
  }

  private registerServiceWorker(): void {
    if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
    const update = registerSW({
      onNeedRefresh: () => {
        const box = h(
          'div',
          { class: 'panel confirm-box' },
          h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Nova versão!')),
          h(
            'div',
            { class: 'panel-body col' },
            h('p', null, 'Uma atualização do Kaelora está pronta.'),
            h('button', { class: 'btn green', onClick: () => void update(true) }, 'Atualizar agora'),
          ),
        );
        this.ui.modal(box);
      },
      onOfflineReady: () => this.ui.toast('Pronto para jogar offline!', 'good'),
    });
  }

  applySettings(): void {
    const s = this.save.settings;
    audio.setVolumes(s.sound, s.music);
    setVibration(s.vibration);
  }

  showCityHud(): void {
    const wrap = h('div', { class: 'city-hud-wrap' }, this.hud.el, this.panel.el, this.editBar.el);
    this.ui.setHud(wrap);
  }

  private pendingLevelUps: number[] = [];

  /** Níveis de conta ganhos: comemorados assim que a cidade estiver livre. */
  queueLevelUps(levels: number[]): void {
    this.pendingLevelUps.push(...levels);
  }

  private showPendingLevelUp(): void {
    if (!this.pendingLevelUps.length || this.ui.hasScreen || this.ui.modals.childElementCount || this.game.current !== this.city) return;
    const lv = this.pendingLevelUps.shift()!;
    showLevelUp(this, lv);
  }

  /** Relógio de 1 s: conclui melhorias e atualiza o objetivo. */
  private tick(): void {
    const now = Date.now();
    this.showPendingLevelUp();
    const done = this.store.data.city.buildings.filter((b) => b.upgradeEndsAt && b.upgradeEndsAt <= now);
    if (done.length) {
      this.store.update('upgrade-finish', (d) => finishUpgrades(d, now));
      for (const b of done) {
        this.city.celebrate(b.id);
        this.ui.toast(`${BUILDINGS[b.type].name} chegou ao nível ${b.level}!`, 'good', 'up');
      }
      audio.play('upgradeDone');
      vibrate([30, 40, 60]);
    }
    this.hud.refreshGoal();
  }

  // ------------------------------------------------------------ cidade

  private onSelect(id: string | null): void {
    if (this.city.mode === 'view') this.panel.show(id);
    else this.panel.show(null);
    this.editBar.setSelection(!!id);
  }

  private commitMove(id: string, x: number, z: number, rot: number): boolean {
    let ok = false;
    this.store.update('move', (d) => {
      ok = moveBuilding(d, id, x, z, rot).ok;
    });
    return ok;
  }

  toggleEdit(): void {
    const on = this.city.mode === 'view';
    this.city.select(null);
    this.city.setMode(on ? 'edit' : 'view');
    this.hud.setEditMode(on);
    this.editBar.show(on ? 'edit' : 'off');
    audio.play(on ? 'open' : 'close');
  }

  rotateSelected(): void {
    this.city.rotateSelected();
  }

  storeSelected(): void {
    const id = this.city.selected;
    if (!id) return;
    const r = this.store.update('store', (d) => storeBuilding(d, id));
    if (!r.ok) return this.ui.toast(r.reason, 'error');
    this.city.select(null);
    audio.play('close');
  }

  openBuildShop(type?: BuildingType): void {
    openBuildShop(this, type);
  }

  startBuild(type: BuildingType): void {
    if (this.city.mode === 'view') {
      this.city.setMode('edit');
      this.hud.setEditMode(true);
    }
    this.city.beginPlacement(type, 1);
    this.editBar.show('place');
  }

  startPlaceFromStorage(storageId: string): void {
    const it = this.save.city.storage.find((s) => s.id === storageId);
    if (!it) return;
    this.city.beginPlacement(it.type, it.level, storageId);
    this.editBar.show('place');
  }

  confirmPlacement(): void {
    const info = this.city.placementInfo;
    if (!info) return;
    if (!info.valid) {
      this.ui.toast('Não cabe aí!', 'error');
      return;
    }
    const now = Date.now();
    const r = info.storageId
      ? this.store.update('place', (d) => placeFromStorage(d, info.storageId!, info.x, info.z, info.rot, now))
      : this.store.update('build', (d) => buyBuilding(d, info.type, info.x, info.z, info.rot, now));
    if (!r.ok) {
      this.ui.toast(r.reason, 'error');
      return;
    }
    this.city.endPlacement(true);
    this.editBar.show('edit');
    audio.play('build');
    vibrate(20);
    if (!info.storageId) this.ui.toast(`${BUILDINGS[info.type].name} construída!`, 'good', 'build');
  }

  cancelPlacement(): void {
    this.city.cancelPlacement();
    this.editBar.show('edit');
  }

  upgrade(id: string): void {
    const b = this.save.city.buildings.find((x) => x.id === id);
    if (!b) return;
    const cost = levelStats(b.type, b.level + 1).cost;
    if (this.save.currencies.coins < cost) {
      this.ui.toast(`Faltam ${formatNumber(cost - this.save.currencies.coins)} moedas`, 'error', 'coin');
      return;
    }
    const r = this.store.update('upgrade', (d) => startUpgrade(d, id, Date.now()));
    if (!r.ok) return this.ui.toast(r.reason, 'error');
    audio.play('upgrade');
    vibrate(15);
    const nb = this.save.city.buildings.find((x) => x.id === id);
    if (nb && !nb.upgradeEndsAt) {
      this.city.celebrate(id);
      this.ui.toast(`${BUILDINGS[nb.type].name} chegou ao nível ${nb.level}!`, 'good', 'up');
    }
  }

  speedUp(id: string): void {
    const r = this.store.update('speedup', (d) => speedUp(d, id, Date.now()));
    if (!r.ok) return this.ui.toast(r.reason, 'error', 'gem');
    this.city.celebrate(id);
    audio.play('upgradeDone');
  }

  collect(id: string): void {
    const amount = this.store.update('collect', (d) => collect(d, id, Date.now()));
    if (amount > 0) {
      this.city.coinBurst(id, amount);
      audio.play('coins');
      vibrate(10);
      this.ui.toast(`+${formatNumber(amount)} moedas`, 'gold', 'coin');
    }
  }

  repair(id: string): void {
    const r = this.store.update('repair', (d) => repair(d, id));
    if (!r.ok) return this.ui.toast(r.reason, 'error');
    this.city.celebrate(id);
    audio.play('build');
  }

  openElementPicker(): void {
    const grid = h('div', { class: 'element-grid' });
    for (const el of Object.keys(ELEMENT_NAMES) as Element[]) {
      grid.appendChild(
        h(
          'button',
          {
            class: `element-pick ${el === this.save.city.element ? 'active' : ''}`,
            style: { '--elc': ELEMENT_COLORS[el].css } as unknown as Partial<CSSStyleDeclaration>,
            onClick: () => {
              this.store.update('element', (d) => (d.city.element = el));
              m.close();
              audio.play('magic');
              const core = this.save.city.buildings.find((b) => b.type === 'core');
              if (core) this.city.celebrate(core.id);
            },
          },
          h('span', { class: 'el-gem' }),
          h('span', { class: 'stroke-sm' }, ELEMENT_NAMES[el]),
        ),
      );
    }
    const m = this.ui.modal(
      h(
        'div',
        { class: 'panel element-modal' },
        h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Elemento do Núcleo')),
        h('div', { class: 'panel-body col' }, h('p', { class: 'dim' }, 'Suas defesas causam +30% de dano em invasores do elemento mais fraco.'), grid),
      ),
    );
  }

  /** Executa a ação do "próximo objetivo". */
  runGoal(): void {
    const g = nextGoal(this.save, Date.now());
    const a = g.action;
    switch (a.kind) {
      case 'focus':
        this.city.focusOn(a.buildingId);
        this.city.select(a.buildingId);
        break;
      case 'upgrade':
        this.city.focusOn(a.buildingId);
        this.city.select(a.buildingId);
        break;
      case 'build':
        this.openBuildShop(a.type);
        break;
      case 'battle':
        this.navigate('battle');
        break;
      case 'chests':
        this.navigate('chests');
        break;
      case 'squad':
        this.navigate('squad');
        break;
      case 'album':
        this.navigate('city');
        openSquad(this, 'album');
        break;
      case 'missions':
        this.openMissions();
        break;
      default:
        this.navigate('battle');
    }
  }

  // ------------------------------------------------------------ navegação

  navigate(tab: NavTab): void {
    if (this.city.mode !== 'view') this.toggleEdit();
    this.ui.closeAllScreens();
    this.hud.setActive(tab);
    if (tab === 'city') return;
    if (tab === 'battle') {
      openInvasionMap(this);
      this.hud.setActive('city');
      return;
    }
    if (tab === 'squad') {
      openSquad(this);
      this.hud.setActive('city');
      return;
    }
    if (tab === 'chests') {
      openChests(this);
      this.hud.setActive('city');
      return;
    }
    this.hud.setActive('city');
    this.ui.toast('Chegando na próxima fase do desenvolvimento!', 'info', 'clock');
  }

  openTraining(): void {
    this.ui.toast('Chegando na próxima fase do desenvolvimento!', 'info', 'clock');
  }

  // ------------------------------------------------------------ batalha

  /** Invade uma cidade (rival bot, vingança ou evento). */
  startRaid(target: BotCity, kind: BattleKind = 'raid', extra: { revengeId?: string; event?: EventRules; title?: string } = {}): void {
    const save = this.save;
    const { specs } = buildSquad(save.squad, save.collection, save.city.research, { eventHpPct: extra.event?.attackerHpPct });
    const seed = this.store.update('battle-seed', (d) => metaRng(d).nextU32());
    const setup = buildRaidSetup({
      seed,
      attacker: { name: save.profile.name, element: save.city.element, squad: specs, research: save.city.research },
      defender: { name: target.ownerName, city: { buildings: target.buildings, element: target.element }, research: target.research },
      event: extra.event,
    });
    this.battleCtx = { target, kind, squad: [...save.squad], revengeId: extra.revengeId };
    this.launchBattle({
      setup,
      playerTeam: 0,
      kind,
      title: { name: extra.title ?? target.ownerName, sub: `${target.name} • Núcleo ${target.coreLevel}`, element: target.element },
      timeOfDay: this.city.clock.t,
      tutorial: save.stats.battles < 3 ? 1 : 0,
    });
  }

  /** Transição cidade → batalha (1,5 s): mergulho, linhas de velocidade e clarão. */
  launchBattle(params: BattleParams): void {
    this.ui.closeAllScreens();
    this.ui.closeAllModals();
    if (this.city.mode !== 'view') this.toggleEdit();
    this.city.select(null);
    this.ui.setHud(null);
    audio.play('whoosh');
    vibrate(15);
    const fx = h('div', { class: 'speed-lines' });
    this.ui.fx.appendChild(fx);
    if (this.game.current === this.city) this.city.diveToEntrance();
    setTimeout(() => this.game.go('battle', params), 900);
    setTimeout(() => fx.remove(), 1550);
  }

  watchReplay(rep: Replay): void {
    this.battleCtx = null;
    const def = rep.setup.teams[1];
    this.launchBattle({
      setup: rep.setup,
      playerTeam: 0,
      kind: 'replay',
      replay: rep.commands,
      title: { name: rep.setup.teams[0].name, sub: `contra ${def.name}`, element: def.element },
      timeOfDay: 0.45,
    });
  }

  private openPause(): void {
    this.battle.setPaused(true);
    this.game.paused = true;
    const m = this.ui.modal(
      h(
        'div',
        { class: 'panel confirm-box' },
        h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Pausa')),
        h(
          'div',
          { class: 'panel-body col' },
          h('button', { class: 'btn green big', onClick: () => m.close() }, icon('play'), 'Continuar'),
          h(
            'button',
            {
              class: 'btn red',
              onClick: async () => {
                m.close();
                const ok = await this.ui.confirm('Desistir?', 'A batalha termina agora e conta como derrota.', 'Desistir', 'Voltar', true);
                if (ok) this.battle.surrender();
              },
            },
            icon('flag'),
            'Desistir',
          ),
        ),
      ),
      {
        onClose: () => {
          this.battle.setPaused(false);
          this.game.paused = false;
        },
      },
    );
  }

  private onBattleEnd(result: BattleResult, sim: BattleSim, params: BattleParams): void {
    const ctx = this.battleCtx;
    this.battleCtx = null;
    let rewards = null;
    if (ctx && params.kind !== 'replay' && params.kind !== 'defense') {
      rewards = this.store.update('battle-end', (d) => {
        const rw = applyBattleResult(d, { kind: ctx.kind === 'event' ? 'event' : ctx.kind === 'revenge' ? 'revenge' : ctx.kind === 'training' ? 'training' : 'raid', target: ctx.target, result, squad: ctx.squad, now: Date.now(), revengeId: ctx.revengeId });
        if (ctx.target && ctx.kind === 'raid') consumeTarget(d, ctx.target.seed);
        if (d.progression.tutorialStep < 3) d.progression.tutorialStep++;
        return rw;
      });
      this.queueLevelUps(rewards.levelsGained);
    }
    const replay: Replay = { setup: params.setup, commands: sim.log, hash: result.hash, meta: { attacker: params.setup.teams[0].name, defender: params.setup.teams[1].name, at: Date.now() } };
    const link = `${location.origin}${location.pathname}#replay=${encodeReplay(replay)}`;
    showResult(this, {
      result,
      rewards,
      title: `${params.setup.teams[0].name} × ${params.setup.teams[1].name}`,
      replayLink: link.length < 12000 ? link : null,
      perspective: params.kind === 'defense' ? 'defender' : 'attacker',
      onContinue: () => this.returnToCity(),
      onReplay: () => this.watchReplay(replay),
    });
  }

  returnToCity(): void {
    this.ui.closeAllScreens();
    this.ui.flash('#ffffff', 300, 0.7);
    audio.play('whoosh', { volume: 0.6 });
    this.game.go('city');
    this.city.resetCamera();
    this.showCityHud();
    this.hud.setActive('city');
    this.hud.refresh();
  }

  characterPortrait(id: number): Promise<string> {
    let view: CharacterView | null = null;
    return this.thumbs
      .request(
        `c:${id}`,
        () => {
          view = new CharacterView(getCharacter(id));
          view.face(1, Math.PI / 2 - 0.35);
          view.shadow.visible = false;
          view.update(0);
          return view.root;
        },
        { focusY: 0.74, zoom: 0.6, yaw: 0, pitch: 0.1 },
      )
      .then((url) => {
        (view as CharacterView | null)?.dispose();
        return url;
      });
  }

  chestThumb(type: ChestType): Promise<string> {
    return this.thumbs.request(`chest:${type}`, () => createChestView(type).root, { yaw: 0.55, pitch: 0.42, zoom: 0.9 });
  }

  openChests(): void {
    this.navigate('chests');
  }

  /** Mostra a vitrine 3D enquadrada num retângulo da tela (empilhável). */
  pushShowroom(frame: () => DOMRect | null, setup: (s: Showroom) => void): void {
    this.overlayStack.push({ kind: 'showroom', frame, setup });
    this.applyOverlay();
  }

  popShowroom(): void {
    this.popOverlay();
  }

  /** Overlay próprio (ex.: abertura de baú) por cima de tudo. */
  pushOverlay(overlay: GameOverlay): void {
    this.overlayStack.push({ kind: 'custom', overlay });
    this.applyOverlay();
  }

  popOverlay(): void {
    this.overlayStack.pop();
    this.applyOverlay();
  }

  private applyOverlay(): void {
    const top = this.overlayStack[this.overlayStack.length - 1];
    if (!this.overlayStack.some((o) => o.kind === 'showroom')) this.showroom.dispose();
    if (!top) {
      this.game.overlay = null;
      return;
    }
    if (top.kind === 'custom') {
      this.game.overlay = top.overlay;
      return;
    }
    this.showroom.frame = top.frame;
    top.setup(this.showroom);
    this.game.overlay = this.showroom;
  }

  openShop(): void {
    this.navigate('more');
  }
  openProfile(): void {
    this.navigate('more');
  }
  openRanking(): void {
    this.navigate('more');
  }
  openMissions(): void {
    this.navigate('more');
  }
  openSettings(): void {
    openSettings(this);
  }

  // ------------------------------------------------------------ miniaturas

  buildingThumb(type: BuildingType, level: number): Promise<string> {
    const el = this.save.city.element;
    return this.thumbs.request(`b:${type}:${level <= 3 ? 1 : level <= 6 ? 4 : 7}:${type === 'core' || type === 'barracks' ? el : ''}`, () => {
      const v = createBuildingView(type, level, el, 1);
      const g = new THREE.Group();
      g.add(v.root);
      return g;
    });
  }
}

