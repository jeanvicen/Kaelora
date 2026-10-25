import '@fontsource-variable/fredoka';
import './ui/styles/base.css';
import './ui/styles/components.css';
import './ui/styles/hud.css';
import './ui/styles/screens.css';
import { App } from './app.ts';
import { initInstallPrompt } from './core/device.ts';

initInstallPrompt();

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const app = new App(canvas, ui);
app.boot().catch((err) => {
  console.error(err);
  ui.innerHTML = `<div class="fatal panel"><div class="panel-title">Ops! Algo deu errado.</div><p>${String(err?.message ?? err)}</p><button class="btn" onclick="location.reload()">Recarregar</button></div>`;
});

// Acesso para depuração no console do navegador.
(window as unknown as { kaelora: App }).kaelora = app;
