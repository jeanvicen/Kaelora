import * as THREE from 'three';
import { registerSW } from 'virtual:pwa-register';
import { audio } from './core/audio.ts';
import { enterFullscreenLandscape, setVibration, vibrate } from './core/device.ts';
import { Game } from './core/game.ts';
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
import type { BuildingType, Element, SaveData } from './meta/types.ts';
import { ELEMENT_COLORS } from './render/colors.ts';
import { createBuildingView } from './render/models/factory.ts';
import { detectPreset, presetConfig } from './render/renderer.ts';
import { Thumbnailer } from './render/thumbnailer.ts';
import { CityScene } from './scenes/city/CityScene.ts';
import { h } from './ui/dom.ts';
import { CityHud, type NavTab } from './ui/hud/cityHud.ts';
import { BuildingPanel, ELEMENT_NAMES } from './ui/panels/buildingPanel.ts';
import { openBuildShop } from './ui/panels/buildShop.ts';
import { EditBar } from './ui/panels/editBar.ts';
import { openSettings } from './ui/screens/settings.ts';
import { showLogin, showSplash } from './ui/screens/intro.ts';
import { UI } from './ui/ui.ts';

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

  /** Relógio de 1 s: conclui melhorias e atualiza o objetivo. */
  private tick(): void {
    const now = Date.now();
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
    if (tab === 'city') {
      this.ui.closeAllScreens();
      this.hud.setActive('city');
      return;
    }
    this.ui.toast('Chegando na próxima fase do desenvolvimento!', 'info', 'clock');
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

