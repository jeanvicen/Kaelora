import type { App } from '../../app.ts';
import { BUILDINGS } from '../../meta/buildings.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';

/**
 * Barra do modo edição: girar, guardar no estoque, abrir o estoque e concluir.
 * No posicionamento de algo novo vira: girar, cancelar, colocar.
 */
export class EditBar {
  readonly el: HTMLElement;
  private placeOk: HTMLButtonElement;
  private storageBtn: HTMLButtonElement;
  private selectionTools: HTMLElement;
  private placeTools: HTMLElement;
  private editTools: HTMLElement;
  private title: HTMLElement;

  constructor(private app: App) {
    this.placeOk = h('button', { class: 'btn green big', onClick: () => app.confirmPlacement() }, icon('check'), 'Colocar');
    this.storageBtn = h('button', { class: 'btn blue', onClick: () => this.openStorage() }, icon('store'), 'Estoque');
    this.selectionTools = h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn purple', onClick: () => app.rotateSelected() }, icon('rotate'), 'Girar'),
      h('button', { class: 'btn dark', onClick: () => app.storeSelected() }, icon('store'), 'Guardar'),
    );
    this.editTools = h('div', { class: 'row' }, this.storageBtn, this.selectionTools, h('button', { class: 'btn green', onClick: () => app.toggleEdit() }, icon('check'), 'Concluir'));
    this.placeTools = h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn purple', onClick: () => app.city.rotatePlacement() }, icon('rotate'), 'Girar'),
      h('button', { class: 'btn red', onClick: () => app.cancelPlacement() }, icon('close'), 'Cancelar'),
      this.placeOk,
    );
    this.title = h('div', { class: 'edit-title stroke' }, 'Modo edição');
    this.el = h(
      'div',
      { class: 'edit-layer hidden' },
      h('div', { class: 'edit-banner' }, this.title),
      h('div', { class: 'edit-bar' }, h('div', { class: 'edit-hint dim' }, 'Arraste para mover • a ordem na estrada segue a distância até a entrada'), h('div', { class: 'edit-tools' }, this.editTools, this.placeTools)),
    );
    app.store.on('change', () => this.refreshStorage());
  }

  show(mode: 'off' | 'edit' | 'place'): void {
    this.el.classList.toggle('hidden', mode === 'off');
    this.editTools.classList.toggle('hidden', mode !== 'edit');
    this.placeTools.classList.toggle('hidden', mode !== 'place');
    this.title.textContent = mode === 'place' ? 'Posicionar' : 'Modo edição';
    this.refreshStorage();
    this.setSelection(!!this.app.city.selected);
  }

  setSelection(on: boolean): void {
    this.selectionTools.classList.toggle('hidden', !on);
  }

  setPlacementValid(valid: boolean): void {
    this.placeOk.disabled = !valid;
  }

  private refreshStorage(): void {
    const n = this.app.store.data.city.storage.length;
    this.storageBtn.replaceChildren(icon('store'), `Estoque${n ? ` (${n})` : ''}`);
  }

  private openStorage(): void {
    const items = this.app.store.data.city.storage;
    const list = h('div', { class: 'shop-list scroll-x' });
    if (!items.length) list.appendChild(h('p', { class: 'dim empty-note' }, 'Nada guardado. Selecione uma construção e toque em "Guardar".'));
    for (const it of items) {
      const thumb = h('div', { class: 'sc-thumb' });
      void this.app.buildingThumb(it.type, it.level).then((url) => (thumb.style.backgroundImage = `url(${url})`));
      list.appendChild(
        h(
          'button',
          {
            class: 'shop-card',
            onClick: () => {
              m.close();
              this.app.startPlaceFromStorage(it.id);
            },
          },
          thumb,
          h('div', { class: 'sc-name stroke-sm' }, BUILDINGS[it.type].name),
          BUILDINGS[it.type].category === 'decor' ? null : h('div', { class: 'sc-count' }, `Nível ${it.level}`),
        ),
      );
    }
    const m = this.app.ui.modal(h('div', { class: 'panel build-shop' }, h('div', { class: 'panel-head' }, icon('store'), h('div', { class: 'panel-title' }, 'Estoque')), h('div', { class: 'panel-body' }, list)));
  }
}
