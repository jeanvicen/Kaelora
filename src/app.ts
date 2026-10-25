import * as THREE from 'three';
import { registerSW } from 'virtual:pwa-register';
import { audio } from './core/audio.ts';
import { enterFullscreenLandscape, setVibration, vibrate } from './core/device.ts';
import { Game, type GameOverlay } from './core/game.ts';
import { loadSave } from './core/save.ts';
import { Store } from './core/store.ts';
import { BUILDINGS, levelStats } from './meta/buildings.ts';
import { CLAIMS, OPTIMISTIC, runAction, type ActionArgs, type ActionName, type ActionResult, type ClaimKind } from './meta/actions.ts';
import { battleSquad } from './content/eventSquad.ts';
import { currentEvent, eventTarget } from './meta/retention.ts';
import { dayKey, seasonOf, weekKey } from './meta/time.ts';
import { ECONOMY, isUnlocked, unlockLevel } from './meta/economy.ts';
import { openDaily, showDailyIfNeeded } from './ui/screens/daily.ts';
import { openLeague } from './ui/screens/league.ts';
import { openEvents } from './ui/screens/events.ts';
import { openPass } from './ui/screens/pass.ts';
import { openMore } from './ui/screens/more.ts';
import { notifyNow, scheduleNotifications } from './core/notify.ts';
import type { ChestResult } from './meta/chests.ts';
import { CloudClient, CloudError, type OnlineTarget } from './net/cloud.ts';
import { openRevengeWall, revengeCity, showDefenseReport, showRaidChoice } from './ui/screens/defense.ts';
import type { BattleRewards } from './meta/raids.ts';
import type { DefenseLogEntry } from './meta/types.ts';
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
import { buildDuelSetup, raidSetupFor, type EventRules } from './content/battleSetup.ts';
import { trainingBot, trainingTarget } from './content/training.ts';
import { RESEARCH, buildSquad } from './content/squad.ts';
import { ELEMENTS } from './content/classes.ts';
import { coreLevel } from './meta/buildings.ts';
import { openTraining } from './ui/screens/training.ts';
import { openLab } from './ui/screens/lab.ts';
import { openShop } from './ui/screens/shop.ts';
import { openProfile } from './ui/screens/profile.ts';
import type { BotCity } from './content/botCity.ts';
import { getCharacter } from './content/catalog.ts';
import { CharacterView } from './render/characterView.ts';
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
  /** Cliente online (null = jogo 100% offline). */
  cloud: CloudClient | null = null;
  /** Logado e falando com o servidor: moedas, baús e resultados vêm de lá. */
  online = false;
  private netQueue: Promise<void> = Promise.resolve();
  private netPending = 0;
  private celebrated = new Set<string>();

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

    let data: SaveData | null = null;
    let defenses: DefenseLogEntry[] = [];
    // online (se o projeto tiver Supabase configurado e o jogador já entrou)
    this.cloud = await CloudClient.connect().catch(() => null);
    const session = this.cloud ? await this.cloud.session().catch(() => null) : null;
    if (session && this.cloud) {
      try {
        const r = await this.cloud.bootstrap({ localSave: loaded && !loaded.profile.id.startsWith('cloud:') ? loaded : undefined });
        data = r.save;
        data.settings = loaded?.settings ?? data.settings;
        defenses = r.defenses;
        this.online = true;
      } catch {
        this.ui.toast('Sem conexão com o servidor: jogando offline', 'error');
      }
    }
    if (!data && loaded) data = migrateSave(loaded);
    if (!data) {
      const login = await showLogin(this.ui.screens, { cloud: !!this.cloud });
      if (login.cloud && this.cloud) {
        try {
          await this.cloud.signInGuest();
          const r = await this.cloud.bootstrap({ name: login.name, element: login.element });
          data = r.save;
          data.settings = { ...data.settings, graphics };
          this.online = true;
        } catch (e) {
          this.ui.toast(`Não deu para entrar online (${e instanceof Error ? e.message : e}). Jogando offline.`, 'error');
        }
      }
      if (!data) {
        data = newGame(login.name, Date.now(), graphics);
        data.city.element = login.element;
      }
      void enterFullscreenLandscape();
    }
    if (this.online && this.cloud?.userId) data.profile.id = `cloud:${this.cloud.userId}`;
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
    // invasões enquanto o jogador estava fora
    if (this.online) {
      this.cloud!.watchRaids(() => {
        notifyNow('Sua cidade foi atacada!', 'Veja o replay e decida: retomar ou reconstruir.', 'raid');
        void this.resync();
      });
      setTimeout(() => this.onDefenses(defenses), 1200);
    } else setTimeout(() => this.checkOfflineRaids(), 1200);
    setTimeout(() => showDailyIfNeeded(this), 2600);
    scheduleNotifications(this);
    setInterval(() => (this.online ? void this.resync() : this.checkOfflineRaids()), 5 * 60_000);
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
    this.checkRollover();
    this.showPendingLevelUp();
    const done = this.store.data.city.buildings.filter((b) => b.upgradeEndsAt && b.upgradeEndsAt <= now);
    if (done.length) {
      // online o servidor conclui sozinho na próxima ação (sem pedido extra)
      this.store.update('finishUpgrades', (d) => runAction(d, 'finishUpgrades', {}, { now }));
      let fresh = false;
      for (const b of done) {
        const key = `${b.id}:${b.level}`;
        if (this.celebrated.has(key)) continue;
        this.celebrated.add(key);
        fresh = true;
        this.city.celebrate(b.id);
        this.ui.toast(`${BUILDINGS[b.type].name} chegou ao nível ${b.level}!`, 'good', 'up');
      }
      if (fresh) {
        audio.play('upgradeDone');
        vibrate([30, 40, 60]);
      }
    }
    // pesquisa do Laboratório (online o servidor conclui sozinho na próxima ação)
    const rq = this.store.data.city.researchQueue;
    if (rq && rq.endsAt <= now) {
      const id = this.store.update('finishResearch', (d) => runAction(d, 'finishResearch', {}, { now }));
      const def = id ? RESEARCH.find((r) => r.id === id) : null;
      if (def) {
        audio.play('upgradeDone');
        this.ui.toast(`Pesquisa concluída: ${def.name}!`, 'good', 'bolt');
      }
    }
    this.hud.refreshGoal();
  }

  // ------------------------------------------------------------ ações e servidor

  /**
   * Ação no save. Offline: aplica aqui mesmo. Online: aplica na hora
   * (otimista, a mesma função pura) e o servidor repete e confirma.
   */
  act<K extends ActionName>(name: K, args: ActionArgs<K>): ActionResult<K> {
    const res = this.store.update(name, (d) => runAction(d, name, args, { now: Date.now() }));
    if (this.online && OPTIMISTIC.has(name)) this.pushAction(name, args);
    return res;
  }

  private pushAction<K extends ActionName>(name: K, args: ActionArgs<K>): void {
    this.netPending++;
    this.netQueue = this.netQueue.then(async () => {
      try {
        const r = await this.cloud!.action(name, args);
        this.netPending--;
        // só adota o estado oficial quando não há outra ação a caminho
        if (this.netPending === 0) this.adoptServerSave(r.save);
      } catch (e) {
        this.netPending--;
        this.onNetError(e);
      }
    });
  }

  /** Estado oficial vindo do servidor (as configurações são deste aparelho). */
  adoptServerSave(save: SaveData): void {
    save.settings = this.store.data.settings;
    save.profile.id = this.store.data.profile.id;
    this.store.replace(save, 'server');
  }

  private onNetError(e: unknown): void {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof CloudError && e.status === 401) this.ui.toast('Sessão expirada: entre de novo nas Configurações', 'error');
    else this.ui.toast(`Servidor: ${msg}`, 'error');
    void this.resync();
  }

  /** Busca o estado oficial (e invasões que aconteceram) no servidor. */
  async resync(): Promise<void> {
    if (!this.online || !this.cloud) return;
    try {
      await this.netQueue;
      const r = await this.cloud.applyRaid();
      this.adoptServerSave(r.save);
      this.onDefenses(r.defenses);
    } catch {
      // sem rede: tenta de novo no próximo ciclo
    }
  }

  /** Offline: rivais-bot podem ter invadido a cidade enquanto o jogador estava fora. */
  private checkOfflineRaids(): void {
    if (this.online) return;
    const entries = this.act('offlineRaids', {});
    this.onDefenses(entries);
  }

  /** Mostra o relatório de defesa e, se a cidade foi saqueada, a escolha. */
  onDefenses(entries: DefenseLogEntry[]): void {
    const show = () => {
      if (this.ui.hasScreen || this.ui.modals.childElementCount || this.game.current !== this.city) return void setTimeout(show, 1500);
      if (entries.length) showDefenseReport(this, entries, () => this.save.raids.pendingChoice && showRaidChoice(this));
      else if (this.save.raids.pendingChoice) showRaidChoice(this);
    };
    if (entries.length || this.save.raids.pendingChoice) show();
    this.hud?.refresh();
  }

  /** Escolha da cidade saqueada: reconstruir do zero ou retomar (48 h). */
  async raidChoice(choice: 'rebuild' | 'retake'): Promise<boolean> {
    if (!this.online) {
      const r = this.act('raidChoice', { choice });
      if (!r.ok) this.ui.toast(r.reason, 'error');
      return r.ok;
    }
    try {
      const r = await this.cloud!.applyRaid(choice);
      this.adoptServerSave(r.save);
      return true;
    } catch (e) {
      this.onNetError(e);
      return false;
    }
  }

  /** Abre um baú (online o sorteio é do servidor, com semente secreta). */
  async openChestAction(uid: string): Promise<ChestResult> {
    if (!this.online) return this.act('openChest', { uid });
    await this.netQueue;
    const r = await this.cloud!.openChest(uid);
    this.adoptServerSave(r.save);
    return r.result;
  }

  async buyChestAction(type: ChestType): Promise<{ ok: true; uid: string } | { ok: false; reason: string }> {
    if (!this.online) return this.act('buyChest', { type });
    await this.netQueue;
    try {
      const r = await this.cloud!.action('buyChest', { type });
      this.adoptServerSave(r.save);
      return r.result;
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : 'Erro no servidor' };
    }
  }

  /** Alvos do Mapa de Invasão: rivais-bot (offline) ou matchmaking do servidor. */
  async invasionTargets(force = false): Promise<OnlineTarget[]> {
    if (!this.online) {
      if (force) {
        const r = this.act('refreshTargets', {});
        if (!r.ok) throw new Error(r.reason);
      }
      return this.act('targets', {}).map((city) => ({ key: `b:${city.seed}`, isPlayer: false, city }));
    }
    await this.netQueue;
    const r = await this.cloud!.matchmaking(force);
    this.adoptServerSave(r.save);
    return r.targets;
  }

  /** Resgata uma recompensa (missão, login, baú grátis, liga, passe, evento, álbum). */
  async claim<K extends ClaimKind>(kind: K, args: ActionArgs<(typeof CLAIMS)[K]>): Promise<ActionResult<(typeof CLAIMS)[K]>> {
    const name = CLAIMS[kind];
    if (!this.online) return this.act(name, args);
    await this.netQueue;
    try {
      const r = await this.cloud!.claimReward({ kind, ...(args as object) });
      this.adoptServerSave(r.save);
      return r.result as ActionResult<(typeof CLAIMS)[K]>;
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : 'Erro no servidor' } as ActionResult<(typeof CLAIMS)[K]>;
    }
  }

  /** Virada de dia/semana/temporada: missões novas, login, liga, evento e passe. */
  private checkRollover(): void {
    const now = Date.now();
    const s = this.save;
    if (s.missions.day === dayKey(now) && s.league.week === weekKey(now) && s.pass.season === seasonOf(now, ECONOMY.pass.seasonDays)) return;
    if (this.online) void this.resync().then(() => showDailyIfNeeded(this));
    else {
      this.act('rollover', {});
      showDailyIfNeeded(this);
    }
  }

  /** Batalha do evento semanal (regras especiais). */
  startEvent(): void {
    const now = Date.now();
    const ev = currentEvent(now);
    void this.startRaid(eventTarget(this.save, now), 'event', { event: ev.rules, title: ev.title });
  }

  // ------------------------------------------------------------ cidade

  private onSelect(id: string | null): void {
    if (this.city.mode === 'view') this.panel.show(id);
    else this.panel.show(null);
    this.editBar.setSelection(!!id);
  }

  private commitMove(id: string, x: number, z: number, rot: number): boolean {
    return this.act('move', { id, x, z, rot }).ok;
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
    const r = this.act('store', { id });
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
    const r = info.storageId
      ? this.act('place', { storageId: info.storageId, x: info.x, z: info.z, rot: info.rot })
      : this.act('build', { type: info.type, x: info.x, z: info.z, rot: info.rot });
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
    const r = this.act('upgrade', { id });
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
    const r = this.act('speedup', { id });
    if (!r.ok) return this.ui.toast(r.reason, 'error', 'gem');
    this.city.celebrate(id);
    audio.play('upgradeDone');
  }

  collect(id: string): void {
    const amount = this.act('collect', { id });
    if (amount > 0) {
      this.city.coinBurst(id, amount);
      audio.play('coins');
      vibrate(10);
      this.ui.toast(`+${formatNumber(amount)} moedas`, 'gold', 'coin');
    }
  }

  repair(id: string): void {
    const r = this.act('repair', { id });
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
              this.act('element', { element: el });
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
      case 'raided':
        showRaidChoice(this);
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
    if (tab === 'more') {
      openMore(this);
      this.hud.setActive('city');
      return;
    }
    this.hud.setActive('city');
  }

  openTraining(): void {
    openTraining(this);
  }

  openLab(): void {
    openLab(this);
  }

  // ------------------------------------------------------------ batalha

  /** Invade uma cidade (rival, vingança ou evento). Online, o servidor sorteia a semente. */
  async startRaid(target: BotCity, kind: BattleKind = 'raid', extra: { revengeId?: string; event?: EventRules; title?: string; targetKey?: string; difficulty?: string; tutorial?: boolean } = {}): Promise<void> {
    let seed: number;
    let city = target;
    let event = extra.event;
    if (this.online && (kind === 'raid' || kind === 'revenge' || kind === 'event' || kind === 'training')) {
      try {
        await this.netQueue;
        const r = await this.cloud!.startBattle({ kind, targetKey: extra.targetKey, revengeId: extra.revengeId, difficulty: extra.difficulty });
        this.adoptServerSave(r.save);
        seed = r.seed;
        city = r.target;
        event = r.event ?? undefined;
      } catch (e) {
        this.ui.toast(e instanceof Error ? e.message : 'Erro no servidor', 'error');
        return;
      }
    } else seed = this.act('battleSeed', {});
    const save = this.save;
    const setup = raidSetupFor(save, city, seed, event);
    this.battleCtx = { target: city, kind, squad: battleSquad(save, event?.element).ids, revengeId: extra.revengeId };
    this.launchBattle({
      setup,
      playerTeam: 0,
      kind,
      title: { name: extra.title ?? city.ownerName, sub: `${city.name} • Núcleo ${city.coreLevel}`, element: city.element },
      timeOfDay: this.city.clock.t,
      tutorial: extra.tutorial || save.stats.battles < 3 ? 1 : 0,
    });
  }

  /** Treino contra cidade-teste (sem troféus; um pouco de XP e moedas). */
  startTraining(difficulty: string, tutorial = false): void {
    const target = trainingTarget(this.save, difficulty, this.online ? 1 : this.act('battleSeed', {}));
    void this.startRaid(target, 'training', { difficulty, tutorial, title: target.ownerName });
  }

  /** Duelo de treino contra um bot (treino livre: nada se perde, nada se ganha). */
  startBotDuel(difficulty: string): void {
    const save = this.save;
    const seed = (Date.now() ^ 0x5eed) >>> 0;
    const bot = trainingBot(save, difficulty, seed);
    const me = battleSquad(save);
    const a = buildSquad(me.ids, me.collection, save.city.research).specs;
    const b = buildSquad(bot.squad, bot.levels, undefined).specs;
    const setup = buildDuelSetup({
      seed,
      level: Math.max(1, Math.min(10, coreLevel(save.city))),
      a: { name: save.profile.name, element: save.city.element, squad: a, research: save.city.research },
      b: { name: 'Bot de treino', element: ELEMENTS[seed % ELEMENTS.length], squad: b, bot: { skill: bot.skill } },
    });
    this.battleCtx = null;
    this.launchBattle({ setup, playerTeam: 0, kind: 'training', title: { name: 'Bot de treino', sub: 'Duelo livre • sem prêmios', element: setup.teams[1].element }, timeOfDay: this.city.clock.t });
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

  /** Revidar quem saqueou (48 h). Online, o servidor manda a cidade real do rival. */
  startRevenge(revengeId: string): void {
    const target = revengeCity(this, revengeId);
    if (!target) return this.ui.toast('Vingança indisponível', 'error');
    void this.startRaid(target, 'revenge', { revengeId, title: `Vingança: ${target.ownerName}` });
  }

  openRevengeWall(): void {
    openRevengeWall(this);
  }

  /** Replay de um ataque contra a cidade do jogador (visto do lado da defesa). */
  watchDefenseReplay(e: DefenseLogEntry): void {
    const rep = decodeReplay(e.replay);
    if (!rep) return this.ui.toast('Replay indisponível', 'error');
    this.battleCtx = null;
    const atk = rep.setup.teams[0];
    this.launchBattle({
      setup: rep.setup,
      playerTeam: 1,
      kind: 'defense',
      replay: rep.commands,
      title: { name: atk.name, sub: e.won ? 'Sua defesa segurou!' : 'Sua cidade caiu', element: atk.element },
      timeOfDay: this.city.clock.t,
    });
  }

  /** Depois de reconstruir: câmera volta, festa e o baú do pacote. */
  afterRebuild(): void {
    this.city.refresh();
    this.city.resetCamera();
    const core = this.save.city.buildings.find((b) => b.type === 'core');
    if (core) this.city.celebrate(core.id);
    audio.play('upgradeDone');
    this.ui.toast('Cidade nova! O Pacote de Recomeço está nos seus baús.', 'gold', 'gift');
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

  private async onBattleEnd(result: BattleResult, sim: BattleSim, params: BattleParams): Promise<void> {
    const ctx = this.battleCtx;
    this.battleCtx = null;
    let rewards: BattleRewards | null = null;
    if (ctx && params.kind !== 'replay' && params.kind !== 'defense') {
      const kind = ctx.kind === 'event' ? 'event' : ctx.kind === 'revenge' ? 'revenge' : ctx.kind === 'training' ? 'training' : 'raid';
      if (this.online && (kind === 'raid' || kind === 'revenge' || kind === 'event' || kind === 'training')) {
        // o servidor re-simula com a semente e as jogadas: o resultado dele é o oficial
        try {
          const r = await this.cloud!.validateBattle(
            sim.log.filter((c) => c.team === 0),
            result.hash,
          );
          this.adoptServerSave(r.save);
          rewards = r.rewards;
          if (r.desync) console.warn('Kaelora: resultado local diferente do servidor (vale o do servidor)');
        } catch (e) {
          this.ui.toast(`Não deu para validar no servidor: ${e instanceof Error ? e.message : e}`, 'error');
        }
      } else {
        rewards = this.act('battleEnd', { kind, target: ctx.target, result, squad: ctx.squad, revengeId: ctx.revengeId });
      }
      if (rewards) this.queueLevelUps(rewards.levelsGained);
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
    if (!isUnlocked(this.save, 'loja')) return this.ui.toast(`A Loja libera no nível de conta ${unlockLevel('loja')}`, 'info', 'lock');
    openShop(this);
  }
  openProfile(): void {
    openProfile(this);
  }

  /** Oferta do dia (pode trazer baú: online o servidor decide o baú). */
  async buyDealAction(): Promise<ActionResult<'buyDeal'>> {
    if (!this.online) return this.act('buyDeal', {});
    await this.netQueue;
    try {
      const r = await this.cloud!.action('buyDeal', {});
      this.adoptServerSave(r.save);
      return r.result;
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : 'Erro no servidor' };
    }
  }
  openRanking(): void {
    if (!isUnlocked(this.save, 'ligas')) return this.ui.toast(`Ligas liberam no nível de conta ${unlockLevel('ligas')}`, 'info', 'lock');
    openLeague(this);
  }
  openMissions(): void {
    openDaily(this);
  }
  openEvents(): void {
    openEvents(this);
  }
  openPass(): void {
    openPass(this);
  }
  openDuel(): void {
    this.ui.toast('O Duelo ao vivo chega já já!', 'info', 'versus');
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

