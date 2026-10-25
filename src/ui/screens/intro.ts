import { ELEMENT_COLORS } from '../../render/colors.ts';
import type { Element } from '../../meta/types.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { ELEMENT_NAMES } from '../panels/buildingPanel.ts';

const ELEMENT_BLURB: Record<Element, string> = {
  solar: 'Fogo do sol tropical. Vence Raiz.',
  raiz: 'Selva viva e resistente. Vence Maré.',
  mare: 'Força das ondas. Vence Solar.',
  volt: 'Eletricidade pura. Vence Cristal.',
  cristal: 'Luz lapidada. Vence Sombra.',
  sombra: 'O lado escuro do néon. Vence Volt.',
};

/** Splash com logo animado. Resolve quando o carregamento termina. */
export function showSplash(parent: HTMLElement): { setProgress(p: number): void; done(): Promise<void> } {
  const letters = 'KAELORA'.split('').map((ch, i) => h('span', { class: 'logo-letter', style: { animationDelay: `${120 + i * 70}ms` } }, ch));
  const bar = h('i');
  const el = h(
    'div',
    { class: 'splash screen' },
    h('div', { class: 'splash-rays' }),
    h('img', { class: 'splash-emblem', src: 'icons/icon-512.png', alt: '' }),
    h('div', { class: 'logo' }, ...letters),
    h('div', { class: 'splash-sub' }, 'KLIPZA STUDIO'),
    h('div', { class: 'splash-bar bar cyan' }, bar),
    h('div', { class: 'splash-tip dim' }, 'Construa. Monte o esquadrão. Invada.'),
  );
  parent.appendChild(el);
  return {
    setProgress(p: number) {
      bar.style.width = `${Math.round(p * 100)}%`;
    },
    done() {
      return new Promise((resolve) => {
        el.classList.add('splash-out');
        setTimeout(() => {
          el.remove();
          resolve();
        }, 420);
      });
    },
  };
}

/** Primeira vez: nome do comandante e elemento da ilha. */
export function showLogin(parent: HTMLElement, opts: { cloud: boolean }): Promise<{ name: string; element: Element; cloud: boolean }> {
  return new Promise((resolve) => {
    let element: Element = 'mare';
    const input = h('input', { class: 'input login-name', maxlength: 16, placeholder: 'Seu nome de comandante', autocomplete: 'nickname', enterkeyhint: 'go' }) as HTMLInputElement;
    const blurb = h('div', { class: 'login-blurb dim' });
    const grid = h('div', { class: 'element-grid' });
    const renderEls = () => {
      grid.replaceChildren(
        ...(Object.keys(ELEMENT_NAMES) as Element[]).map((el) =>
          h(
            'button',
            {
              class: `element-pick ${el === element ? 'active' : ''}`,
              style: { '--elc': ELEMENT_COLORS[el].css } as unknown as Partial<CSSStyleDeclaration>,
              onClick: () => {
                element = el;
                renderEls();
              },
            },
            h('span', { class: 'el-gem' }),
            h('span', { class: 'stroke-sm' }, ELEMENT_NAMES[el]),
          ),
        ),
      );
      blurb.textContent = ELEMENT_BLURB[element];
    };
    renderEls();
    const go = (cloud: boolean) => {
      const name = input.value.trim() || 'Comandante';
      el.classList.add('screen-leave');
      setTimeout(() => el.remove(), 220);
      resolve({ name, element, cloud });
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') go(false);
    });
    const el = h(
      'div',
      { class: 'login screen' },
      h('div', { class: 'splash-rays' }),
      h(
        'div',
        { class: 'panel login-card' },
        h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Bem-vindo a Kaelora!')),
        h(
          'div',
          { class: 'panel-body login-body' },
          h('div', { class: 'col login-left' }, h('label', { class: 'dim' }, 'Como quer ser chamado?'), input, h('label', { class: 'dim' }, 'Elemento do Núcleo da sua ilha'), grid, blurb),
          h(
            'div',
            { class: 'col login-right' },
            h('button', { class: 'btn green big', onClick: () => go(false) }, icon('play'), 'Jogar'),
            opts.cloud ? h('button', { class: 'btn blue', onClick: () => go(true) }, icon('ranking'), 'Jogar online') : h('div', { class: 'faint login-note' }, 'Seu progresso fica salvo neste aparelho.'),
          ),
        ),
      ),
    );
    parent.appendChild(el);
  });
}
