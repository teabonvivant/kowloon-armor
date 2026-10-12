import { GameAudio } from './audio';
import { Game } from './game';
import { updateEnemyMarkers, updateHud } from './hud';
import { Input } from './input';
import { Interface } from './interface';
import { required } from './ui-kit';
import { View } from './view';
import { SimulationClock } from './simulation-clock';

function boot(): void {
  const canvas = required('#world', HTMLCanvasElement);
  const view = new View(canvas), audio = new GameAudio(), input = new Input(canvas);
  const game = new Game(view.scene, view.world, { shot: () => view.recoil(),
    cannon: position => audio.fire(position), ready: () => audio.ready(), trained: () => ui.completeTraining(),
    hit: (damage, killed, enemy, impact) => ui.hit(damage, killed, enemy, impact),
    finish: victory => ui.finish(victory), notify: message => ui.notify(message) });
  const ui = new Interface(game, input, view, audio);
  let last = performance.now(), uiElapsed = 0;
  const clock = new SimulationClock();
  document.getElementById('boot')?.remove();
  document.addEventListener('graphics-lost', () => { ui.pause(); ui.notify('繪圖裝置已重設，請重新開啟遊戲。'); });
  function frame(now: number): void {
    if (document.hidden) { last = now; clock.reset(); requestAnimationFrame(frame); return; }
    const dt = Math.min((now - last) / 1000, .1); last = now; uiElapsed += dt;
    audio.listen(game.player.visual.root.position, game.observing ? game.observationYaw : game.cameraMode === 'driver' && !game.scope ? game.player.yaw : game.player.aim);
    if (game.phase === 'playing') {
      clock.advance(dt, step => {
        const control = input.sample(step);
        if (control.pause) ui.pause();
        game.update(step, control);
        return game.phase === 'playing';
      });
      audio.engine(Math.abs(game.player.speed));
    } else clock.reset();
    view.render(game, dt);
    if (uiElapsed > .1) {
      uiElapsed = 0;
      if (game.phase !== 'garage') {
        updateHud(game);
        updateEnemyMarkers(game, view.camera);
      } else {
        const status = document.getElementById('pad-status');
        if (status) status.textContent = input.devices.length ? `HOTAS 已連接 (${input.devices.length})` : 'HOTAS 控制設定';
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
try { boot(); }
catch (error) {
  if (!(error instanceof Error)) throw error;
  const bootScreen = document.getElementById('boot');
  if (bootScreen) { bootScreen.innerHTML = '<span class="boot-mark">K / A</span><h1>無法啟動 3D 場景</h1><p>請用 Windows Edge 或 Chrome 開啟，並在瀏覽器設定啟用圖形加速。</p><p id="boot-error"></p>';
    const detail = document.getElementById('boot-error'); if (detail) detail.textContent = error.message; }
  console.error(error);
}
