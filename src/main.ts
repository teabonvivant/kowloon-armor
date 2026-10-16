import { GameAudio } from './audio';
import { Game } from './game';
import { updateEnemyMarkers, updateHud } from './hud';
import { Input } from './input';
import { Interface } from './interface';
import { required } from './ui-kit';
import { View } from './view';
import { ArcadeHud } from './arcade-hud';
import { SimulationClock } from './simulation-clock';

function boot(): void {
  const canvas = required('#world', HTMLCanvasElement);
  const view = new View(canvas), audio = new GameAudio(), input = new Input(canvas);
  const game = new Game(view.scene, view.world, { shot: () => { view.recoil(); view.shake(.55); view.punch(3.4); arcadeHud.flash(); },
    shake: amount => view.shake(amount), popup: (text, kind) => arcadeHud.popup(text, kind),
    cannon: (position, enemy, calibre) => { audio.fire(position, calibre, !enemy); if (enemy) { const d = position.distanceTo(game.player.visual.root.position); if (d < 70) view.shake(.3 * (1 - d / 70)); } }, ready: () => audio.ready(), trained: () => ui.completeTraining(),
    contact: contact => audio.impact(contact.position, contact.destroyed, contact.kind, contact.calibre),
    hit: (damage, killed, enemy, impact) => ui.hit(damage, killed, enemy, impact),
    finish: victory => ui.finish(victory), notify: message => ui.notify(message) });
  const ui = new Interface(game, input, view, audio);
  const arcadeHud = new ArcadeHud(game);
  let last = performance.now(), uiElapsed = 0;
  const clock = new SimulationClock();
  document.getElementById('boot')?.remove();
  document.addEventListener('graphics-lost', () => { ui.pause(); ui.notify('繪圖裝置已重設，請重新開啟遊戲。'); });
  window.addEventListener('pagehide', event => { audio.stop(); if (!event.persisted) { game.dispose(); audio.dispose(); view.renderer.dispose(); } });
  function frame(now: number): void {
    if (document.hidden) { audio.stop(); last = now; clock.reset(); requestAnimationFrame(frame); return; }
    const frameSeconds = (now - last) / 1000;
    const dt = Math.min(frameSeconds, .1); last = now; uiElapsed += dt;
    view.sampleFrame(frameSeconds, game.phase === 'playing');
    game.touchEffects(input.touch.enabled);
    audio.listen(game.player.visual.root.position, game.observing ? game.observationYaw : game.cameraMode === 'driver' && !game.scope ? game.player.yaw : game.player.aim, game.world.obstacles);
    audio.perspective(!game.observing && (game.scope || game.cameraMode !== 'chase'));
    if (game.phase === 'playing') {
      game.tickRealtime(dt);
      clock.advance(dt * game.timeScale, step => {
        const control = input.sample(step);
        if (control.pause) ui.pause();
        game.update(step, control);
        return game.phase === 'playing';
      });
      if (game.phase === 'playing') {
        audio.engine(Math.abs(game.player.speed));
        const nearby = game.enemies.reduce((threat, enemy) => enemy.alive ? Math.max(threat, 1 - enemy.visual.root.position.distanceTo(game.player.visual.root.position) / 180) : threat, 0);
        audio.atmosphere(Math.max(nearby, game.damageTimer > 0 ? 1 : 0), dt);
      } else audio.stop();
    } else { clock.reset(); audio.idle(); }
    view.render(game, dt);
    if (uiElapsed > .1) {
      uiElapsed = 0;
      if (game.phase !== 'garage') {
        updateHud(game); arcadeHud.update();
        updateEnemyMarkers(game, view.camera);
        const resolution = document.getElementById('render-scale');
        if (resolution) resolution.textContent = `3D ${Math.round(view.renderScale * 100)}%`;
        const meter = document.getElementById('performance-meter');
        if (meter) {
          meter.hidden = !view.diagnosticsEnabled;
          if (view.diagnosticsEnabled) {
            const frames = view.frameDiagnostics.summary(), render = view.renderer.info.render;
            meter.textContent = `中位 ${frames.median.toFixed(1)} / P95 ${frames.p95.toFixed(1)} ms\n${render.calls} calls · ${Math.round(render.triangles / 1000)}k 三角形 · ${frames.count} 幀`;
          }
        }
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
  if (bootScreen) { bootScreen.innerHTML = '<span class="boot-mark">K / A</span><h1>無法啟動 3D 場景</h1><p>需要支援 WebGL 2 的瀏覽器及圖形加速。請更新瀏覽器，或改用支援的裝置開啟。</p><p id="boot-error"></p>';
    const detail = document.getElementById('boot-error'); if (detail) detail.textContent = error.message; }
  console.error(error);
}
