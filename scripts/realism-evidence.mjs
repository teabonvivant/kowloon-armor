import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const folder = 'docs/evidence/realism';
await mkdir(folder,{ recursive: true });
const fps = 12, width = 768, height = 432;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const errors = [], renderTimes = [];
try {
  const context = await browser.newContext({ viewport: { width,height },deviceScaleFactor: 1 });
  await context.setOffline(true);
  const page = await context.newPage(); page.setDefaultTimeout(120000);
  page.on('pageerror',error => errors.push(error.message));
  await page.goto(pathToFileURL(resolve(folder,'sample-harness.html')).href);
  await page.evaluate(() => {
    const { ui,game,view,audio,timeline,record } = window.qa;
    window.__recording = { accumulator: 0,frame: 0,victoryFrame: null,time: 0,timerId: 0,timers: new Map(),animations: new Map() };
    window.setTimeout = (callback,delay = 0,...args) => { const state = window.__recording,id = ++state.timerId; state.timers.set(id,{ callback,args,time: state.time + delay / 1000 }); return id; };
    window.clearTimeout = id => window.__recording.timers.delete(id);
    audio.setMusicVolume(0); ui.start(); audio.setVolume(0); timeline.length = 0;
    view.reduceMotion(false); view.render(game,2); view.renderer.getContext().finish();
    record('engine',{ speed: 0 });
  });
  const encoder = spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate',String(fps),'-f','image2pipe','-vcodec','mjpeg','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','21','-pix_fmt','yuv420p',`${folder}/gameplay-silent.mp4`],{ stdio: ['pipe','ignore','pipe'] });
  let encoderErrors = ''; encoder.stderr.on('data',chunk => { encoderErrors += chunk.toString(); });
  const completion = once(encoder,'close');
  let frame = 0, latest;
  while (frame < 45 * fps) {
    latest = await page.evaluate(({ fps }) => {
      const { game,view,intercept,updateHud,updateEnemyMarkers,record } = window.qa, state = window.__recording;
      state.time = state.frame / fps;
      for (const [id,timer] of state.timers) if (timer.time <= state.time) { state.timers.delete(id); if (typeof timer.callback === 'function') timer.callback(...timer.args); }
      state.accumulator += 1 / fps;
      while (state.accumulator >= 1 / 60 && game.phase === 'playing') {
        const target = game.enemies.find(enemy => enemy.alive), solution = intercept(game.player,target);
        const difference = Math.atan2(Math.sin(solution.aim - game.player.aim),Math.cos(solution.aim - game.player.aim));
        const pointerX = -Math.max(-1.4 / 60,Math.min(1.4 / 60,difference));
        game.update(1 / 60,{ throttle: game.elapsed < 2 ? .5 : 0,steer: 0,brake: game.elapsed >= 2,aimX: 0,aimY: 0,pointerX,pointerY: solution.pitch - game.player.pitch,fire: game.elapsed > 3.5 && Math.abs(difference) < .008,scope: false,toggleCamera: false,pause: false });
        state.accumulator -= 1 / 60;
      }
      if (state.frame % 4 === 0 && game.phase === 'playing') record('engine',{ speed: Math.abs(game.player.speed) });
      const start = performance.now(); updateHud(game); view.render(game,1 / fps); updateEnemyMarkers(game,view.camera); view.renderer.getContext().finish();
      const milliseconds = performance.now() - start;
      for (const animation of document.getAnimations()) {
        if (!state.animations.has(animation)) { state.animations.set(animation,state.time); animation.pause(); }
        animation.currentTime = (state.time - state.animations.get(animation)) * 1000;
      }
      if (game.phase !== 'playing' && state.victoryFrame === null) { state.victoryFrame = state.frame; record('stop'); }
      state.frame++;
      return { phase: game.phase,seconds: game.elapsed,shots: game.shots,hits: game.hits,kills: game.kills,hp: game.player.hp,distance: game.report.distance,milliseconds,done: state.victoryFrame !== null && state.frame - state.victoryFrame > fps * 1.5 };
    },{ fps });
    renderTimes.push(latest.milliseconds);
    const screenshot = await page.screenshot({ type: 'jpeg',quality: 90 });
    if (!encoder.stdin.write(screenshot)) await once(encoder.stdin,'drain');
    if (frame % (fps * 2) === 0) console.log(`frame ${frame}: ${latest.seconds.toFixed(2)} s, ${latest.shots} shots, ${latest.kills} destroyed, ${latest.phase}, render ${latest.milliseconds.toFixed(0)} ms`);
    frame++;
    if (latest.done) break;
  }
  encoder.stdin.end();
  const [exitCode] = await completion; assert.equal(exitCode,0,encoderErrors); assert.equal(latest.phase,'victory'); assert.deepEqual(errors,[]);
  const timeline = await page.evaluate(() => ({ events: window.qa.timeline,obstacles: window.qa.game.world.obstacles }));
  const sorted = [...renderTimes].sort((first,second) => first - second);
  await writeFile(`${folder}/gameplay-timeline.json`,JSON.stringify({ ...timeline,duration: frame / fps,fps,frames: frame,resolution: `${width}x${height}`,outcome: latest,renderMilliseconds: { median: sorted[Math.floor(sorted.length / 2)],p95: sorted[Math.floor(sorted.length * .95)] },method: 'Every frame is rendered from the complete source game at 12 fps with fixed 1/60-second simulation steps and automated input-only aiming/driving. No health, enemy, damage or reload overrides. UI timeout/animation clocks follow the recording clock. This is timing-correct offline frame rendering with intentionally low capture frame rate, not real-time device performance or 60 FPS proof. Distributed standalone artifact and higher-resolution screenshots are separately tested. Audio events use the same simulation clock; event listener pose is captured at emission.' },null,2));
  await page.screenshot({ path: `${folder}/gameplay-end.png`,animations: 'disabled' });
  console.log(JSON.stringify({ frames: frame,duration: frame / fps,...latest,errors }));
} finally { await browser.close(); }
