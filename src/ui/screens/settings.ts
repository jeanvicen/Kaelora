import type { App } from '../../app.ts';
import { audio } from '../../core/audio.ts';
import { canInstall, isIOS, isStandalone, onInstallAvailability, promptInstall, requestNotifications, toggleFullscreen } from '../../core/device.ts';
import { deleteSave, exportSave, importSave } from '../../core/save.ts';
import type { GraphicsPreset, Settings } from '../../meta/types.ts';
import { h } from '../dom.ts';
import { icon, type IconName } from '../icons.ts';

function row(ic: IconName | null, label: string, control: HTMLElement, hint?: string): HTMLElement {
  return h('div', { class: 'set-row' }, ic ? icon(ic) : null, h('div', { class: 'set-label' }, label, hint ? h('small', { class: 'faint' }, hint) : null), control);
}

/** Configurações: som, música, gráficos, vibração, idioma, conta e instalação. */
export function openSettings(app: App): void {
  const s = app.store.data.settings;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    app.store.update('settings', (d) => (d.settings[k] = v));
    app.applySettings();
  };
  const slider = (k: 'sound' | 'music') => {
    const el = h('input', { class: 'slider', type: 'range', min: 0, max: 100, value: String(Math.round(s[k] * 100)) }) as HTMLInputElement;
    el.addEventListener('input', () => set(k, Number(el.value) / 100));
    el.addEventListener('change', () => k === 'sound' && audio.play('coin'));
    return el;
  };
  const toggle = (k: 'vibration' | 'shake' | 'dayNight' | 'skipChestIntro') => {
    const el = h('button', { class: `switch ${s[k] ? 'on' : ''}`, 'aria-pressed': String(!!s[k]) });
    el.addEventListener('click', () => {
      const v = !app.store.data.settings[k];
      set(k, v);
      el.classList.toggle('on', v);
    });
    return el;
  };
  const presets: [GraphicsPreset, string][] = [
    ['baixo', 'Baixo'],
    ['medio', 'Médio'],
    ['alto', 'Alto'],
  ];
  const seg = h('div', { class: 'segmented' });
  const renderSeg = () =>
    seg.replaceChildren(
      ...presets.map(([id, label]) =>
        h(
          'button',
          {
            class: app.store.data.settings.graphics === id ? 'active' : '',
            onClick: () => {
              set('graphics', id);
              app.game.renderer.applyPreset(id);
              renderSeg();
              app.ui.toast(`Gráficos: ${label}`, 'good');
            },
          },
          label,
        ),
      ),
    );
  renderSeg();

  const installBtn = h('button', { class: 'btn green small' }, icon('install'), 'Instalar');
  const refreshInstall = () => {
    installBtn.classList.toggle('hidden', isStandalone() || (!canInstall() && !isIOS()));
  };
  installBtn.addEventListener('click', async () => {
    if (isIOS() && !canInstall()) {
      app.ui.modal(
        h(
          'div',
          { class: 'panel confirm-box' },
          h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Instalar no iPhone')),
          h('div', { class: 'panel-body col' }, h('p', null, '1. Toque em Compartilhar (quadrado com seta) no Safari.'), h('p', null, '2. Escolha "Adicionar à Tela de Início".'), h('p', null, '3. Abra o Kaelora pelo ícone novo, em tela cheia.')),
        ),
      );
      return;
    }
    const ok = await promptInstall();
    if (ok) app.ui.toast('Kaelora instalado!', 'good');
    refreshInstall();
  });
  const off = onInstallAvailability(refreshInstall);
  refreshInstall();

  const account = h(
    'div',
    { class: 'row wrap-row' },
    h(
      'button',
      {
        class: 'btn blue small',
        onClick: async () => {
          const code = exportSave(app.store.data);
          try {
            await navigator.clipboard.writeText(code);
            app.ui.toast('Código do save copiado!', 'good');
          } catch {
            app.ui.modal(h('div', { class: 'panel confirm-box' }, h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Seu código de save')), h('div', { class: 'panel-body' }, h('textarea', { class: 'save-code', readonly: true }, code))));
          }
        },
      },
      'Exportar save',
    ),
    h(
      'button',
      {
        class: 'btn dark small',
        onClick: () => {
          const ta = h('textarea', { class: 'save-code', placeholder: 'Cole aqui o código do save' }) as HTMLTextAreaElement;
          const m = app.ui.modal(
            h(
              'div',
              { class: 'panel confirm-box' },
              h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Importar save')),
              h(
                'div',
                { class: 'panel-body col' },
                ta,
                h(
                  'button',
                  {
                    class: 'btn green',
                    onClick: async () => {
                      const data = importSave(ta.value);
                      if (!data) return app.ui.toast('Código inválido', 'error');
                      app.store.replace(data, 'import');
                      await app.store.flush();
                      m.close();
                      location.reload();
                    },
                  },
                  'Importar',
                ),
              ),
            ),
          );
        },
      },
      'Importar',
    ),
    h(
      'button',
      {
        class: 'btn red small',
        onClick: async () => {
          const ok = await app.ui.confirm('Apagar tudo?', 'Seu progresso neste aparelho será apagado para sempre.', 'Apagar', 'Cancelar', true);
          if (!ok) return;
          await deleteSave();
          location.reload();
        },
      },
      'Apagar progresso',
    ),
  );

  const body = h(
    'div',
    { class: 'panel settings' },
    h('div', { class: 'panel-head' }, icon('gear'), h('div', { class: 'panel-title' }, 'Configurações')),
    h(
      'div',
      { class: 'panel-body scroll-y settings-body' },
      row('sound', 'Efeitos sonoros', slider('sound')),
      row('music', 'Música', slider('music')),
      row('gear', 'Gráficos', seg, 'Baixo roda liso em celulares mais simples'),
      row('bolt', 'Vibração', toggle('vibration')),
      row('target', 'Tremor de câmera', toggle('shake')),
      row('clock', 'Ciclo de dia e noite', toggle('dayNight')),
      row('chest', 'Pular animação de baú', toggle('skipChestIntro'), 'Só depois de ver a primeira vez'),
      row('book', 'Idioma', h('div', { class: 'chip' }, 'Português (Brasil)')),
      row('fullscreen', 'Tela cheia', h('button', { class: 'btn blue small', onClick: () => void toggleFullscreen() }, 'Alternar')),
      row(
        'calendar',
        'Notificações',
        h(
          'button',
          {
            class: 'btn blue small',
            onClick: async () => app.ui.toast((await requestNotifications()) ? 'Notificações ligadas!' : 'Notificações bloqueadas no navegador', 'info'),
          },
          'Permitir',
        ),
        'Baú pronto, cidade atacada, escudo acabando',
      ),
      row('install', 'App', installBtn, isStandalone() ? 'Você já está no app instalado' : 'Instale para jogar em tela cheia e offline'),
      row('user', 'Conta', account, 'Jogador: ' + app.store.data.profile.name),
      h('div', { class: 'credits faint' }, 'Kaelora • Klipza Studio • Modelos, sons e músicas gerados por código'),
    ),
  );
  app.ui.modal(body, { onClose: off });
}
