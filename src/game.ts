import { Vector3 } from 'three';
import type { PerspectiveCamera, Scene } from 'three';
import { advanceEnemy, createActor, drivePlayer } from './actors';
import type { Actor } from './actors';
import { Combat } from './combat';
import type { Contact } from './combat';
import { DEFAULT_EFFECTS } from './effect-math';
import type { EffectOptions } from './effect-math';
import { DIFFICULTIES, encounterSpawns, waveSize } from './challenges';
import type { Difficulty } from './challenges';
import { MISSIONS } from './data/missions';
import type { MissionSpec } from './data/missions';
import { TANKS } from './data/tanks';
import type { TankSpec } from './data/tanks';
import { Effects } from './effects';
import type { InputFrame } from './input';
import { angleDelta, blocked, wallFraction } from './math';
import type { WorldData } from './render/world';
import { disposeTank, showTankDamage, launchTurret, updateTurretFlight, isTurretLaunched } from './render/tank';
import { shouldCookOff } from './effect-math';
import type { Impact } from './armor';
import { createObjectiveState, updateObjective } from './objectives';
import { createTraining, updateTraining } from './training';
import type { TrainingState } from './training';
import { fireSolution, imminentThreats, LandmarkTour } from './field';
import { intercept, launchPose } from './ballistics';
import { REALISM_SAMPLE } from './realism';
import { Arcade, STRIKE_COOLDOWN, STRIKE_SHELLS, comboMultiplier } from './arcade';
import type { Prop } from './arcade';
import { PROP_TABLE } from './game-events-v19';
import type { BreakKind, ExplosionEvent, ExplosionKind } from './game-events-v19';
import { HITSTOP_LIMITS, HitStopBudget } from './camera-fx';

/**
 * Campaign balance guard: v1.8 had no explosive props, so in the campaign they must not change difficulty.
 * Prop/strike damage to enemies is halved and capped per sortie, props never hurt the player, repair packs are
 * smaller and capped, and at most three pickups appear. Other modes keep the full arcade values.
 */
export const CAMPAIGN_GUARD = { propDamageScale: .5, propDamageCap: .15, repairFraction: .15, repairCap: .3, pickups: 3 } as const;

export type GameMode = 'drive' | 'battle' | 'campaign' | 'survival';
export type GamePhase = 'garage' | 'playing' | 'paused' | 'victory' | 'defeat';
export type CameraMode = 'chase' | 'driver' | 'gunner';
export interface GameEvents {
  readonly shot: () => void; readonly hit: (damage: number, killed: boolean, enemy: boolean, impact?: Impact) => void;
  readonly cannon?: (position: Vector3, enemy: boolean, calibre: number) => void; readonly ready?: () => void;
  readonly contact?: (contact: Contact) => void;
  readonly trained?: () => void;
  readonly shake?: (amount: number) => void; readonly popup?: (text: string, kind: 'kill' | 'prop' | 'pickup' | 'strike') => void;
  readonly explosion?: (event: ExplosionEvent) => void; readonly flyby?: (position: Vector3, speed: number, calibre: number) => void;
  readonly killcam?: (position: Vector3) => void; readonly propBreak?: (kind: BreakKind, position: Vector3) => void;
  readonly pulse?: (strength: number, seconds: number) => void; readonly lowFlash?: (enabled: boolean) => void;
  readonly finish: (victory: boolean) => void; readonly notify: (message: string) => void;
}
function firstTank(): TankSpec {
  const tank = TANKS[0]; if (!tank) throw new RangeError('Tank catalogue is empty'); return tank;
}
export class Game {
  phase: GamePhase = 'garage'; mode: GameMode = 'campaign'; cameraMode: CameraMode = 'chase';
  player: Actor; readonly enemies: Actor[] = []; elapsed = 0; kills = 0; shots = 0; hits = 0;
  mission: MissionSpec | undefined; scope = false; totalEnemies = 0;
  difficulty: Difficulty = 'standard'; wave = 0; intermission = 0; seed = 1;
  objective = createObjectiveState(); supply: 'repair' | 'reload' = 'repair';
  damageBearing = 0; damageTimer = 0; observing = false; observationYaw = 0;
  training: TrainingState | null = null;
  tour = new LandmarkTour();
  report = { dealt: 0, received: 0, flankingHits: 0, distance: 0 };
  repairingTracks = false;
  waypoint: { x: number; z: number } | null = null;
  challenge: 'none' | 'precision' | 'mobile' | 'armor' = 'none';
  readonly journal: { time: number; message: string }[] = [];
  readonly arcade: Arcade;
  hitStop = 0;
  /** Campaign guard counters (see CAMPAIGN_GUARD). */
  propDamage = 0; propDamageCap = 0; repairGiven = 0; pickupsDropped = 0;
  private readonly stopBudget = new HitStopBudget();
  private readonly blasts: { t: number; x: number; z: number; radius: number; damage: number; friendly: boolean; prop: Prop | undefined; kind?: ExplosionKind; power?: number }[] = [];
  private rng = 1;
  private readonly objectivePosition = new Vector3();
  private dustTimer = 0;
  private effectOptions: EffectOptions = { ...DEFAULT_EFFECTS };
  private readonly exhaust = new Vector3();
  private readonly actors: Actor[] = [];
  private readonly effects: Effects; private readonly combat: Combat;
  constructor(private readonly scene: Scene, readonly world: WorldData, private readonly events: GameEvents) {
    this.player = createActor(firstTank(), 0, 100); scene.add(this.player.visual.root);
    this.effects = new Effects(scene); this.arcade = new Arcade(scene);
    this.effects.lightPulse = (strength, seconds) => events.pulse?.(strength, seconds);
    this.combat = new Combat(scene, this.effects, { shot: () => { this.shots++; this.log('主炮發射'); events.shot(); },
      cannon: (position, enemy, calibre) => events.cannon?.(position, enemy, calibre),
      contact: contact => events.contact?.(contact),
      flyby: (position, speed, calibre) => events.flyby?.(position, speed, calibre),
      prop: (id, position, byPlayer) => { const prop = this.arcade.prop(id); if (prop) this.blastProp(prop, byPlayer, position); },
      hit: (damage, killed, enemy, impact) => { if (enemy) { this.hits++; if (killed) this.kills++;
          this.report.dealt += damage; if (impact.face !== 'front') this.report.flankingHits++; }
        else { this.damageBearing = impact.bearing; this.damageTimer = 2.5; this.report.received += damage; }
        if (enemy && killed) { this.onKill(impact.position.x, impact.position.z); this.cookOff(impact); }
        else if (!enemy) events.shake?.(Math.min(1, .35 + damage / 120));
        this.log(`${enemy ? killed ? '擊破敵車' : '命中敵車' : '裝甲受擊'} · ${damage}`);
        events.hit(damage, killed, enemy, impact); } });
  }
  select(spec: TankSpec): void {
    this.scene.remove(this.player.visual.root);
    disposeTank(this.player.visual);
    this.player = createActor(spec, 0, 100); this.scene.add(this.player.visual.root);
  }
  start(mode: GameMode, missionIndex: number, difficulty: Difficulty = 'standard', seed = Math.floor(Math.random() * 0xffffffff)): void {
    this.clearEnemies(); this.combat.clear(); this.effects.clear(); this.arcade.clear(); this.select(this.player.spec);
    this.mode = mode; this.mission = MISSIONS[missionIndex]; this.elapsed = 0; this.kills = 0;
    this.shots = 0; this.hits = 0; this.cameraMode = 'chase'; this.scope = false;
    this.difficulty = difficulty; this.seed = seed >>> 0; this.wave = mode === 'survival' ? 1 : 0;
    this.intermission = 0; this.totalEnemies = 0;
    this.objective = createObjectiveState(); this.supply = 'repair'; this.damageTimer = 0;
    this.observing = false; this.observationYaw = 0; this.dustTimer = 0;
    this.training = null;
    this.waypoint = null; this.journal.length = 0; this.challenge = 'none';
    this.tour = new LandmarkTour(); this.report = { dealt: 0, received: 0, flankingHits: 0, distance: 0 }; this.repairingTracks = false;
    const mission = this.mission;
    if (mode === 'campaign' && mission) this.player.visual.root.position.set(mission.spawn[0], 0, mission.spawn[1]);
    const spots = REALISM_SAMPLE && mode !== 'drive' ? [[-3.5, 30], [4.5, -2]] as const : mode === 'battle' || mode === 'survival'
      ? encounterSpawns(this.seed, mode === 'battle' ? 4 : waveSize(this.wave), this.player.visual.root.position, this.world.obstacles)
      : mission?.targets ?? [];
    if (mode !== 'drive') this.spawnEnemies(spots, mode === 'campaign' ? missionIndex + 4 : this.seed % TANKS.length);
    this.blasts.length = 0; this.hitStop = 0; this.rng = (this.seed ^ 0x51ed270b) >>> 0 || 1;
    this.stopBudget.reset(); this.repairGiven = 0; this.pickupsDropped = 0; this.propDamage = 0;
    this.propDamageCap = Math.round(this.enemies.reduce((sum, enemy) => sum + enemy.maxHp, 0) * CAMPAIGN_GUARD.propDamageCap);
    const spawn = this.player.visual.root.position;
    const lanes = this.enemies.map(enemy => [enemy.visual.root.position.x, enemy.visual.root.position.z] as const);
    this.arcade.populate(this.seed, spawn, this.world.obstacles, REALISM_SAMPLE ? 7 : 12, REALISM_SAMPLE ? 4 : 7,
      { lanes, opening: !REALISM_SAMPLE, near: spawn.z < 60 ? [25, 38] : [28, 48] });
    this.phase = 'playing';
    this.events.notify(REALISM_SAMPLE ? mode === 'drive' ? '自由試車 · 茶餐廳前方街口可練習駕駛與射擊' : '街口接敵 · 清除前方兩輛敵車，裝填時留意掩護' : mode === 'drive' ? '自由駕駛開始 · 無限彈藥，探索九龍街道' : '演習開始 · 紅色標記為敵方坦克');
  }
  garage(): void { this.clearEnemies(); this.combat.clear(); this.effects.clear(); this.arcade.clear(); this.blasts.length = 0; this.select(this.player.spec); this.intermission = 0; this.training = null; this.phase = 'garage'; }
  beginTraining(): void {
    if (this.phase === 'playing' && this.mode === 'drive') this.training = createTraining(this.player, this.shots);
  }
  toggleTour(): boolean {
    if (this.phase !== 'playing' || this.mode !== 'drive' || this.training) return false;
    this.tour.active = !this.tour.active; this.tour.dwell = 0;
    return true;
  }
  pause(): void { if (this.phase === 'playing') this.phase = 'paused'; }
  setWaypoint(x: number, z: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 210 || Math.abs(z) > 210 || blocked(x, z, this.world.obstacles)) return false;
    this.waypoint = { x, z }; return true;
  }
  private log(message: string): void {
    this.journal.push({ time: this.elapsed, message });
    if (this.journal.length > 40) this.journal.shift();
  }
  resume(): void { if (this.phase === 'paused') this.phase = 'playing'; }
  cycleCamera(): void {
    const modes: readonly CameraMode[] = ['chase', 'driver', 'gunner'];
    this.cameraMode = modes[(modes.indexOf(this.cameraMode) + 1) % modes.length] ?? 'chase';
  }
  update(dt: number, input: InputFrame): void {
    if (this.phase !== 'playing') return;
    this.effects.observe(this.player.visual.root.position);
    this.elapsed += dt; this.scope = input.scope && !input.observe;
    this.damageTimer = Math.max(0, this.damageTimer - dt);
    if (input.observe) {
      if (!this.observing) this.observationYaw = this.player.aim;
      this.observationYaw -= input.aimX * dt * 1.1 + (input.pointerX ?? 0);
    }
    this.observing = input.observe ?? false;
    if (input.toggleCamera) this.cycleCamera();
    const actors = this.actors;
    actors.length = 0; actors.push(this.player, ...this.enemies);
    for (const actor of actors) { actor.reducedMotion = this.effectOptions.reducedMotion;
      if (!actor.alive) actor.visual.wreckAge += dt; }
    const previousCooldown = this.player.cooldown;
    const previousX = this.player.visual.root.position.x, previousZ = this.player.visual.root.position.z;
    drivePlayer(this.player, this.observing ? { ...input, aimX: 0, aimY: 0, pointerX: 0, pointerY: 0 } : input, dt, this.world.obstacles, actors);
    this.report.distance += Math.hypot(this.player.visual.root.position.x - previousX, this.player.visual.root.position.z - previousZ);
    if (this.waypoint && Math.hypot(this.player.visual.root.position.x - this.waypoint.x, this.player.visual.root.position.z - this.waypoint.z) < 10) {
      this.waypoint = null; this.events.notify('已抵達自訂航點');
    }
    this.repairingTracks = Math.abs(this.player.speed) < .4 && (input.brake || Math.abs(input.throttle) < .04);
    if (this.mode === 'drive' && !this.training) {
      const visited = this.tour.update(this.player, dt);
      if (visited) this.events.notify(`已到訪 ${visited} · ${this.tour.visited.size} / 6${this.tour.visited.size === 6 ? ' · 九龍巡遊完成！' : ''}`);
    }
    if (previousCooldown > 0 && this.player.cooldown === 0) this.events.ready?.();
    if (input.strike) this.callStrike();
    if (input.fire) this.combat.fire(this.player, this.world.obstacles);
    if (this.training && updateTraining(this.training, this.player, this.shots, dt)) {
      if (this.training.step === 4) this.events.trained?.();
      this.events.notify(this.training.step === 4 ? '基礎訓練完成 · 可繼續探索，或返回車庫開始戰役' : `訓練步驟 ${this.training.step} / 4 完成`);
    }
    const p = this.player.visual.root.position;
    const goal = this.mode === 'campaign' ? this.mission?.objective : undefined;
    const orders = goal && goal.kind !== 'clear' ? this.objectivePosition.set(goal.center[0], 0, goal.center[1]) : undefined;
    for (const [slot, enemy] of this.enemies.entries()) {
      if (!enemy.alive) continue;
      advanceEnemy(enemy, this.player, dt, this.world.obstacles, actors, {
        slot, difficulty: this.difficulty, tactical: this.mode !== 'campaign' || this.mission?.id !== 1,
        ...(orders ? { objective: orders } : {}),
      });
      const e = enemy.visual.root.position;
      const desired = REALISM_SAMPLE ? intercept(enemy, this.player).aim : Math.atan2(-(p.x - e.x), -(p.z - e.z));
      const clear = wallFraction(e.x, e.z, p.x - e.x, p.z - e.z, this.world.obstacles) === 1;
      if (clear && e.distanceTo(p) < 200 && Math.abs(angleDelta(enemy.aim, desired)) < 0.045) this.combat.fire(enemy, this.world.obstacles);
    }
    const waveDamage = this.mode === 'survival' ? Math.min(1.7, 1 + (this.wave - 1) * .08) : 1;
    this.combat.update(dt, actors, this.world.obstacles,
      (this.mode === 'campaign' ? (this.mission?.enemyDamage ?? 24) / 100 : .32) * DIFFICULTIES[this.difficulty].damage * waveDamage, this.arcade);
    this.updateArcade(dt);
    this.dustTimer += dt;
    if (this.dustTimer >= .15) {
      this.dustTimer = 0;
      for (const actor of actors) if (actor.alive && Math.abs(actor.speed) > 3) this.effects.dust(actor.visual.root.position, actor.yaw, actor.speed, actor.leftTrack <= 0, actor.rightTrack <= 0);
      for (const prop of this.arcade.props) {
        const burning = prop.alive ? prop.fuse === true : (prop.burn ?? 0) > 0;
        if (burning) this.effects.damage(this.exhaust.set(prop.x, 1.4 + (prop.flight ? prop.root.position.y : 0), prop.z), 0, prop.alive ? 0 : (prop.burnTotal ?? 10) - (prop.burn ?? 0));
      }
      for (const actor of actors) {
        showTankDamage(actor.visual, actor.hp / actor.maxHp);
        if (actor.hp < actor.maxHp * .65) {
          this.exhaust.set(Math.sin(actor.yaw) * 2, 2.1, Math.cos(actor.yaw) * 2).add(actor.visual.root.position);
          this.effects.damage(this.exhaust, actor.hp / actor.maxHp, actor.visual.wreckAge);
        }
      }
    }
    for (const enemy of this.enemies) if (!enemy.alive && isTurretLaunched(enemy.visual)) updateTurretFlight(enemy.visual, dt);
    this.effects.update(dt);
    if (goal) updateObjective(this.objective, goal, this.player, this.enemies, dt);
    if (!this.player.alive) this.finish(false);
    else if (this.mode === 'survival') this.updateSurvival(dt);
    else if (this.mode === 'campaign' && this.mission) {
      if (this.elapsed >= this.mission.timeLimit || this.objective.integrity <= 0) this.finish(false);
      else if (goal?.kind === 'clear' ? this.kills === this.totalEnemies : goal && this.objective.progress >= goal.seconds) this.finish(true);
    } else if (this.mode === 'battle' && this.kills === this.totalEnemies) this.finish(true);
  }
  private random(): number { this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0; return this.rng / 4294967296; }
  tickRealtime(dt: number): void { this.hitStop = Math.max(0, this.hitStop - dt); }
  get timeScale(): number { return this.hitStop > 0 && !this.effectOptions.reducedMotion ? HITSTOP_LIMITS.scale : 1; }
  /** Ammo-rack cook-off: a turret-ring / rear kill (deterministic, ~50%) blows the rack and throws the turret. */
  private cookOff(impact: Impact): void {
    let index = -1, best = 12;
    for (const [i, enemy] of this.enemies.entries()) {
      if (enemy.alive || enemy.visual.wreckAge > .05 || isTurretLaunched(enemy.visual)) continue;
      const d = enemy.visual.root.position.distanceTo(impact.position);
      if (d < best) { best = d; index = i; }
    }
    const victim = this.enemies[index];
    if (!victim || !shouldCookOff(this.seed, index, impact.zone, impact.face)) return;
    const at = victim.visual.root.position;
    launchTurret(victim.visual, (this.seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
    this.explode(at.x, at.z, 9, 60, false, true, 'ammo', 1.3);
  }
  private onKill(x: number, z: number): void {
    const result = this.arcade.kill(150), multiplier = comboMultiplier(result.combo);
    this.events.popup?.(`擊破 +${result.points}${multiplier > 1 ? ` · 連殺 ×${multiplier}` : ''}`, 'kill');
    if (this.mode !== 'campaign' || this.pickupsDropped < CAMPAIGN_GUARD.pickups) {
      this.pickupsDropped++;
      this.arcade.dropPickup(this.kills % 2 === 0 || this.player.hp < this.player.maxHp * .6 ? 'repair' : 'rapid', x, z);
    }
    this.hitStop = Math.max(this.hitStop, this.stopBudget.grant(this.elapsed, 'kill'));
    this.events.shake?.(.7); this.events.killcam?.(new Vector3(x, 1.5, z));
  }
  private blastProp(prop: Prop, byPlayer: boolean, at?: Vector3, forced = false): void {
    if (!prop.alive) return;
    const spec = PROP_TABLE[prop.kind];
    if (prop.kind === 'tanker' && !forced) {
      if (prop.fuse) return;
      prop.fuse = true; // visible leak and fire first, then the big blast 2-3 s later
      this.blasts.push({ t: 2 + (prop.id % 3) * .4, x: prop.x, z: prop.z, radius: 0, damage: 0, friendly: false, prop });
      this.events.popup?.('油罐車起火 · 即將爆炸', 'prop');
      return;
    }
    this.arcade.detonate(prop);
    const result = byPlayer ? this.arcade.kill(spec.score) : undefined;
    if (result) this.events.popup?.(`${spec.label} +${result.points}`, 'prop');
    const x = at?.x ?? prop.x, z = at?.z ?? prop.z;
    this.explode(x, z, spec.radius, spec.damage, false, byPlayer, spec.explosion, spec.power);
    if (prop.kind === 'lpg') this.blasts.push({ t: .6 + (prop.id % 5) * .1, x: prop.x, z: prop.z, radius: 7, damage: 40, friendly: false, prop: undefined, kind: 'lpg', power: .7 });
    for (const other of this.arcade.props) {
      if (!other.alive || Math.hypot(other.x - prop.x, other.z - prop.z) > (prop.kind === 'tanker' ? 14 : 12)) continue;
      this.blasts.push({ t: .12 + this.blasts.length % 6 * .1, x: other.x, z: other.z, radius: 0, damage: 0, friendly: false, prop: other });
    }
  }
  private explode(x: number, z: number, radius: number, damage: number, friendly: boolean, byPlayer: boolean, kind: ExplosionKind = 'barrel', power = 1): void {
    const at = new Vector3(x, 0, z);
    this.effects.explosion(kind, at, power);
    this.events.explosion?.({ kind, position: at.clone().setY(1), power, byPlayer });
    this.hitStop = Math.max(this.hitStop, this.stopBudget.grant(this.elapsed, 'explosion'));
    const guarded = this.mode === 'campaign';
    for (const actor of [this.player, ...this.enemies]) {
      if (!actor.alive || (friendly && !actor.enemy) || (guarded && !actor.enemy)) continue;
      const p = actor.visual.root.position, d = Math.hypot(p.x - x, p.z - z);
      if (d >= radius) continue;
      let dealt = Math.max(1, Math.min(actor.hp, Math.round(damage * (1 - d / radius * .7) * (actor.enemy ? 1 : .45) * (actor.enemy ? 1 : DIFFICULTIES[this.difficulty].damage))));
      if (guarded) {
        dealt = Math.min(dealt, Math.floor((this.propDamageCap - this.propDamage) / 1), Math.max(1, Math.round(dealt * CAMPAIGN_GUARD.propDamageScale)));
        if (dealt < 1) continue;
        this.propDamage += dealt;
      }
      actor.hp -= dealt;
      const killed = actor.hp <= 0;
      if (killed) { actor.hp = 0; actor.alive = false; actor.speed = 0; actor.visual.wreckAge = 0;
        actor.visual.root.rotation.z = .055; actor.visual.root.position.y = -.2; }
      if (actor.enemy) {
        this.hits++; this.report.dealt += dealt; if (killed) { this.kills++; this.onKill(p.x, p.z); }
        this.log(`${killed ? '爆炸擊破' : '爆炸波及'} · ${dealt}`);
        this.events.hit(dealt, killed, true, { zone: 'hull', face: 'side', bearing: 0, position: p.clone() });
      } else {
        this.damageBearing = Math.atan2(x - p.x, z - p.z); this.damageTimer = 2.5; this.report.received += dealt;
        this.log(`爆炸波及 · ${dealt}`);
        this.events.hit(dealt, false, false, { zone: 'hull', face: 'side', bearing: this.damageBearing, position: p.clone() });
      }
    }
  }
  /** Calls a covering barrage onto the nearest enemy ahead of the turret (or empty ground ahead). */
  callStrike(): boolean {
    if (this.phase !== 'playing' || this.arcade.strikeCooldown > 0) return false;
    const p = this.player.visual.root.position;
    let target: { x: number; z: number } | undefined, best = 1e9;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const e = enemy.visual.root.position, d = Math.hypot(e.x - p.x, e.z - p.z);
      const bearing = Math.abs(angleDelta(this.player.aim, Math.atan2(-(e.x - p.x), -(e.z - p.z))));
      if (d < 170 && bearing < .95 && d < best) { best = d; target = { x: e.x, z: e.z }; }
    }
    target ??= { x: p.x - Math.sin(this.player.aim) * 55, z: p.z - Math.cos(this.player.aim) * 55 };
    this.arcade.strikeCooldown = STRIKE_COOLDOWN; this.arcade.strikesCalled++;
    for (let i = 0; i < STRIKE_SHELLS; i++) {
      const angle = this.random() * Math.PI * 2, spread = i === 0 ? 0 : 3 + this.random() * 7;
      this.blasts.push({ t: 1.6 + i * .27, x: target.x + Math.sin(angle) * spread, z: target.z + Math.cos(angle) * spread, radius: 9, damage: 95, friendly: true, prop: undefined, kind: 'strike', power: 1 });
    }
    this.effects.burst(new Vector3(target.x, 0, target.z), false);
    this.events.popup?.('炮擊支援已呼叫 · 2 秒後落彈', 'strike');
    return true;
  }
  private updateArcade(dt: number): void {
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const blast = this.blasts[i]; if (!blast) continue;
      blast.t -= dt; if (blast.t > 0) continue;
      this.blasts.splice(i, 1);
      if (blast.prop) this.blastProp(blast.prop, true, undefined, true);
      else {
        this.explode(blast.x, blast.z, blast.radius, blast.damage, blast.friendly, true, blast.kind ?? 'strike', blast.power ?? 1);
        for (const prop of this.arcade.props) if (prop.alive && Math.hypot(prop.x - blast.x, prop.z - blast.z) < blast.radius) this.blastProp(prop, true);
      }
    }
    const p = this.player.visual.root.position;
    if (Math.abs(this.player.speed) > 5) for (const prop of this.arcade.props) {
      if (prop.alive && Math.hypot(prop.x - p.x, prop.z - p.z) < prop.radius + 3.2) this.blastProp(prop, true);
    }
    for (const kind of this.arcade.update(dt, p, this.player.alive)) {
      if (kind === 'repair') {
        const guarded = this.mode === 'campaign';
        const heal = guarded ? Math.max(0, Math.min(Math.round(this.player.maxHp * CAMPAIGN_GUARD.repairFraction),
          Math.round(this.player.maxHp * CAMPAIGN_GUARD.repairCap) - this.repairGiven)) : Math.round(this.player.maxHp * .3);
        this.repairGiven += heal;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
        this.player.leftTrack = 0; this.player.rightTrack = 0;
        this.events.popup?.(`修復包 · 車體 +${guarded ? Math.round(heal / this.player.maxHp * 100) : 30}% · 履帶修好`, 'pickup');
      } else { this.player.rapidShots = Math.max(this.player.rapidShots, 4); this.player.cooldown = Math.min(this.player.cooldown, .4);
        this.events.popup?.('快裝彈藥 · 四發快速裝填', 'pickup'); }
    }
  }
  private finish(victory: boolean): void { this.phase = victory ? 'victory' : 'defeat'; this.events.finish(victory); }
  private spawnEnemies(spots: readonly (readonly [number, number])[], variant: number): void {
    for (const [index, spot] of spots.entries()) {
      const spec = REALISM_SAMPLE ? firstTank() : TANKS[(index * 3 + variant) % TANKS.length] ?? this.player.spec;
      const actor = createActor(spec, spot[0], spot[1], true);
      const waveHealth = this.mode === 'survival' ? Math.min(1.8, 1 + (this.wave - 1) * .06) : 1;
      actor.hp = actor.maxHp = Math.round(actor.maxHp * DIFFICULTIES[this.difficulty].health * waveHealth);
      this.enemies.push(actor); this.scene.add(actor.visual.root);
    }
    this.totalEnemies += spots.length;
  }
  private updateSurvival(dt: number): void {
    if (this.intermission > 0) {
      this.intermission = Math.max(0, this.intermission - dt);
      if (this.intermission === 0) {
        this.clearEnemies(); this.combat.clear(); this.wave++;
        if (this.supply === 'repair') {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + Math.round(this.player.maxHp * .35));
          this.player.leftTrack = 0; this.player.rightTrack = 0;
        } else this.player.rapidShots = 4;
        this.player.cooldown = 0;
        this.spawnEnemies(encounterSpawns(this.seed + this.wave * 997, waveSize(this.wave),
          this.player.visual.root.position, this.world.obstacles), (this.seed + this.wave * 5) % TANKS.length);
        this.events.notify(`第 ${this.wave} 波到達 · ${this.supply === 'repair' ? '已修復 35% 車體及履帶' : '已補給四發快裝炮彈'}`);
      }
    } else if (this.enemies.every(enemy => !enemy.alive)) {
      this.combat.clear(); this.intermission = 8; this.supply = 'repair';
      this.events.notify(`第 ${this.wave} 波完成 · 選擇修復或四發快裝補給`);
    }
  }
  chooseSupply(choice: 'repair' | 'reload'): boolean {
    if (this.phase !== 'playing' || this.mode !== 'survival' || this.intermission <= 0) return false;
    this.supply = choice; return true;
  }
  private clearEnemies(): void { for (const enemy of this.enemies) { this.scene.remove(enemy.visual.root); disposeTank(enemy.visual); } this.enemies.length = 0; }
  configureEffects(options: EffectOptions): void { this.effectOptions = { ...options }; this.effects.configure(options); this.combat.lowFlash(options.lowFlash); this.events.lowFlash?.(options.lowFlash); }
  touchEffects(mobile: boolean): void { if (this.effectOptions.mobile !== mobile) this.configureEffects({ ...this.effectOptions, mobile }); }
  prepareEffects(camera: PerspectiveCamera, height: number): void { this.effects.prepare(camera, height, !this.observing && (this.scope || this.cameraMode !== 'chase')); }
  effectStats(): ReturnType<Effects['stats']> & { projectiles: number } { return { ...this.effects.stats(), projectiles: this.combat.stats().active }; }
  dispose(): void { this.clearEnemies(); this.combat.dispose(); this.effects.dispose(); this.arcade.dispose(); this.player.visual.root.removeFromParent(); disposeTank(this.player.visual); }
  get fireSolution(): ReturnType<typeof fireSolution> { return fireSolution(this.player, this.enemies, this.world.obstacles); }
  get target(): Actor | undefined { return this.fireSolution.target; }
  get threats(): number { return imminentThreats(this.player, this.enemies, this.world.obstacles); }
  getAimPoint(target: Vector3): Vector3 {
    if (REALISM_SAMPLE) { const pose = launchPose(this.player); return target.copy(pose.origin).addScaledVector(pose.direction, 100); }
    return target.set(-Math.sin(this.player.aim) * Math.cos(this.player.pitch) * 100, 2.5 + Math.sin(this.player.pitch) * 100,
      -Math.cos(this.player.aim) * Math.cos(this.player.pitch) * 100).add(this.player.visual.root.position);
  }
  get score(): number {
    const accuracyBonus = this.shots ? this.hits / this.shots * 500 : 0;
    return Math.round((this.kills * 500 + Math.max(0, this.player.hp / this.player.maxHp) * 1000 + accuracyBonus +
      (this.mode === 'survival' ? Math.max(0, this.wave - 1) * 750 : Math.max(0, 300 - this.elapsed) * 5) + this.arcade.bonus) * DIFFICULTIES[this.difficulty].score);
  }
}
