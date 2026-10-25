import { audio } from '../core/audio.ts';
import { h } from './dom.ts';
import { icon, type IconName } from './icons.ts';

export interface ModalHandle {
  close(): void;
  el: HTMLElement;
}

/**
 * Camadas da interface sobre o canvas:
 * rótulos do mundo < HUD < telas cheias < modais < avisos < efeitos.
 */
export class UI {
  readonly hud: HTMLElement;
  readonly screens: HTMLElement;
  readonly modals: HTMLElement;
  readonly toasts: HTMLElement;
  readonly fx: HTMLElement;
  private screenStack: { el: HTMLElement; onClose?: () => void; opaque: boolean }[] = [];
  /** Avisado quando muda se há tela opaca cobrindo o 3D. */
  onOpaqueChange: ((covered: boolean) => void) | null = null;

  private notifyOpaque(): void {
    this.onOpaqueChange?.(this.screenStack.some((s) => s.opaque));
  }

  constructor(readonly root: HTMLElement) {
    this.hud = h('div', { class: 'layer layer-hud' });
    this.screens = h('div', { class: 'layer layer-screens' });
    this.modals = h('div', { class: 'layer layer-modals' });
    this.toasts = h('div', { class: 'toasts' });
    this.fx = h('div', { class: 'layer layer-fx' });
    root.append(this.hud, this.screens, this.modals, this.toasts, this.fx);
    // Som de toque em qualquer botão da UI.
    root.addEventListener(
      'pointerdown',
      (e) => {
        audio.unlock();
        const t = e.target as HTMLElement;
        const btn = t.closest('button');
        if (btn && !btn.disabled && !btn.classList.contains('silent')) audio.play('tap');
      },
      true,
    );
  }

  setHud(el: HTMLElement | null): void {
    this.hud.replaceChildren(...(el ? [el] : []));
  }

  /** Abre uma tela cheia por cima do HUD (com animação de entrada). */
  openScreen(el: HTMLElement, onClose?: () => void, opaque = true): void {
    el.classList.add('screen', 'screen-enter');
    this.screens.appendChild(el);
    this.screenStack.push({ el, onClose, opaque });
    requestAnimationFrame(() => el.classList.remove('screen-enter'));
    // só esconde o 3D depois da animação de entrada
    setTimeout(() => this.notifyOpaque(), 260);
    audio.play('open');
  }

  closeScreen(): void {
    const top = this.screenStack.pop();
    if (!top) return;
    top.el.classList.add('screen-leave');
    audio.play('close');
    setTimeout(() => top.el.remove(), 200);
    top.onClose?.();
    this.notifyOpaque();
  }

  closeAllScreens(): void {
    while (this.screenStack.length) {
      const top = this.screenStack.pop()!;
      top.el.remove();
      top.onClose?.();
    }
    this.notifyOpaque();
  }

  get hasScreen(): boolean {
    return this.screenStack.length > 0;
  }

  modal(content: HTMLElement, opts: { onClose?: () => void; dismissable?: boolean; closeButton?: boolean } = {}): ModalHandle {
    const dismissable = opts.dismissable ?? true;
    const overlay = h('div', { class: 'overlay' });
    content.classList.add('modal');
    if (opts.closeButton ?? dismissable) {
      const x = h('button', { class: 'close-btn', 'aria-label': 'Fechar' }, icon('close'));
      x.addEventListener('click', () => handle.close());
      content.appendChild(x);
    }
    overlay.appendChild(content);
    let closed = false;
    const handle: ModalHandle = {
      el: content,
      close: () => {
        if (closed) return;
        closed = true;
        overlay.classList.add('closing');
        audio.play('close');
        setTimeout(() => overlay.remove(), 180);
        opts.onClose?.();
      },
    };
    if (dismissable)
      overlay.addEventListener('pointerdown', (e) => {
        if (e.target === overlay) handle.close();
      });
    this.modals.appendChild(overlay);
    audio.play('open');
    return handle;
  }

  closeAllModals(): void {
    this.modals.replaceChildren();
  }

  confirm(title: string, text: string, ok = 'Confirmar', cancel = 'Cancelar', danger = false): Promise<boolean> {
    return new Promise((resolve) => {
      let answered = false;
      const done = (v: boolean) => {
        if (answered) return;
        answered = true;
        m.close();
        resolve(v);
      };
      const body = h(
        'div',
        { class: 'panel confirm-box' },
        h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, title)),
        h('div', { class: 'panel-body col' }, h('p', { class: 'confirm-text' }, text), h('div', { class: 'row confirm-actions' }, h('button', { class: 'btn dark', onClick: () => done(false) }, cancel), h('button', { class: `btn ${danger ? 'red' : 'green'}`, onClick: () => done(true) }, ok))),
      );
      const m = this.modal(body, { onClose: () => done(false) });
    });
  }

  toast(text: string, kind: 'info' | 'error' | 'good' | 'gold' = 'info', ico?: IconName): void {
    const el = h('div', { class: `toast ${kind}` }, ico ? icon(ico) : null, h('span', { class: 'stroke-sm' }, text));
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    if (kind === 'error') audio.play('error');
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 230);
    }, 2200);
  }

  /** Clarão de tela inteira (impactos, revelações). */
  flash(color = '#ffffff', ms = 260, opacity = 0.85): void {
    const el = h('div', { class: 'screen-flash', style: { background: color, opacity: String(opacity), animationDuration: `${ms}ms` } });
    this.fx.appendChild(el);
    setTimeout(() => el.remove(), ms + 30);
  }
}
