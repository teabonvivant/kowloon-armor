import { Vector3 } from 'three';
import type { Scene } from 'three';
import { advanceEnemy, createActor, drivePlayer } from './actors';
import type { Actor } from './actors';
import { Combat } from './combat';
import { DIFFICULTIES, encounterSpawns, waveSize } from './challenges';
import type { Difficulty } from './challenges';
import { MISSIONS } from './data/missions';
import type { MissionSpec } from './data/missions';
import { TANKS } from './data/tanks';
import type { TankSpec } from './data/tanks';
import { Effects } from './effects';
import type { InputFrame } from './input';
import { angleDelta, wallFraction } from './math';
import type { WorldData } from './render/world';
import { disposeTank } from './render/tank';
import type { Impact } from './armor';
import { createObjectiveState, updateObjective } from './objectives';

export type GameMode = 'drive' | 'battle' | 'campaign' | 'survival';
export type GamePhase = 'garage' | 'playing' | 'paused' | 'victory' | 'defeat';
export type CameraMode = 'chase' | 'driver' | 'gunner';
export interface GameEvents {
  readonly shot: () => void; readonly hit: (damage: number, killed: boolean, enemy: boolean, impact?: Impact) => void;
  readonly cannon?: (position: Vector3, enemy: boolean) => void; readonly ready?: () => void;
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
  private readonly objectivePosition = new Vector3();
  private dustTimer = 0;
  private readonly actors: Actor[] = [];
  private readonly effects: Effects; private readonly combat: Combat;
  constructor(private readonly scene: Scene, readonly world: WorldData, private readonly events: GameEvents) {
    this.player = createActor(firstTank(), 0, 100); scene.add(this.player.visual.root);
    this.effects = new Effects(scene);
    this.combat = new Combat(scene, this.effects, { shot: () => { this.shots++; events.shot(); },
      cannon: (position, enemy) => events.cannon?.(position, enemy),
      hit: (damage, killed, enemy, impact) => { if (enemy) { this.hits++; if (killed) this.kills++; }
        else { this.damageBearing = impact.bearing; this.damageTimer = 2.5; }
        events.hit(damage, killed, enemy, impact); } });
  }
  select(spec: TankSpec): void {
    this.scene.remove(this.player.visual.root);
    disposeTank(this.player.visual);
    this.player = createActor(spec, 0, 100); this.scene.add(this.player.visual.root);
  }
  start(mode: GameMode, missionIndex: number, difficulty: Difficulty = 'standard', seed = Math.floor(Math.random() * 0xffffffff)): void {
    this.clearEnemies(); this.combat.clear(); this.effects.clear(); this.select(this.player.spec);
    this.mode = mode; this.mission = MISSIONS[missionIndex]; this.elapsed = 0; this.kills = 0;
    this.shots = 0; this.hits = 0; this.cameraMode = 'chase'; this.scope = false;
    this.difficulty = difficulty; this.seed = seed >>> 0; this.wave = mode === 'survival' ? 1 : 0;
    this.intermission = 0; this.totalEnemies = 0;
    this.objective = createObjectiveState(); this.supply = 'repair'; this.damageTimer = 0;
    this.observing = false; this.observationYaw = 0; this.dustTimer = 0;
    const mission = this.mission;
    if (mode === 'campaign' && mission) this.player.visual.root.position.set(mission.spawn[0], 0, mission.spawn[1]);
    const spots = mode === 'battle' || mode === 'survival'
      ? encounterSpawns(this.seed, mode === 'battle' ? 4 : waveSize(this.wave), this.player.visual.root.position, this.world.obstacles)
      : mission?.targets ?? [];
    if (mode !== 'drive') this.spawnEnemies(spots, mode === 'campaign' ? missionIndex + 4 : this.seed % TANKS.length);
    this.phase = 'playing';
    this.events.notify(mode === 'drive' ? '自由駕駛開始 · 無限彈藥，探索九龍街道' : '演習開始 · 紅色標記為敵方坦克');
  }
  garage(): void { this.clearEnemies(); this.combat.clear(); this.effects.clear(); this.select(this.player.spec); this.intermission = 0; this.phase = 'garage'; }
  pause(): void { if (this.phase === 'playing') this.phase = 'paused'; }
  resume(): void { if (this.phase === 'paused') this.phase = 'playing'; }
  cycleCamera(): void {
    const modes: readonly CameraMode[] = ['chase', 'driver', 'gunner'];
    this.cameraMode = modes[(modes.indexOf(this.cameraMode) + 1) % modes.length] ?? 'chase';
  }
  update(dt: number, input: InputFrame): void {
    if (this.phase !== 'playing') return;
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
    const previousCooldown = this.player.cooldown;
    drivePlayer(this.player, this.observing ? { ...input, aimX: 0, aimY: 0, pointerX: 0, pointerY: 0 } : input, dt, this.world.obstacles, actors);
    if (previousCooldown > 0 && this.player.cooldown === 0) this.events.ready?.();
    if (input.fire) this.combat.fire(this.player, this.world.obstacles);
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
      const desired = Math.atan2(-(p.x - e.x), -(p.z - e.z));
      const clear = wallFraction(e.x, e.z, p.x - e.x, p.z - e.z, this.world.obstacles) === 1;
      if (clear && e.distanceTo(p) < 200 && Math.abs(angleDelta(enemy.aim, desired)) < 0.045) this.combat.fire(enemy, this.world.obstacles);
    }
    const waveDamage = this.mode === 'survival' ? Math.min(1.7, 1 + (this.wave - 1) * .08) : 1;
    this.combat.update(dt, actors, this.world.obstacles,
      (this.mode === 'campaign' ? (this.mission?.enemyDamage ?? 24) / 100 : .32) * DIFFICULTIES[this.difficulty].damage * waveDamage);
    this.dustTimer += dt;
    if (this.dustTimer >= .15) {
      this.dustTimer = 0;
      for (const actor of actors) if (actor.alive && Math.abs(actor.speed) > 3) this.effects.dust(actor.visual.root.position, actor.yaw, actor.speed);
    }
    this.effects.update(dt);
    if (goal) updateObjective(this.objective, goal, this.player, this.enemies, dt);
    if (!this.player.alive) this.finish(false);
    else if (this.mode === 'survival') this.updateSurvival(dt);
    else if (this.mode === 'campaign' && this.mission) {
      if (this.elapsed >= this.mission.timeLimit || this.objective.integrity <= 0) this.finish(false);
      else if (goal?.kind === 'clear' ? this.kills === this.totalEnemies : goal && this.objective.progress >= goal.seconds) this.finish(true);
    } else if (this.mode === 'battle' && this.kills === this.totalEnemies) this.finish(true);
  }
  private finish(victory: boolean): void { this.phase = victory ? 'victory' : 'defeat'; this.events.finish(victory); }
  private spawnEnemies(spots: readonly (readonly [number, number])[], variant: number): void {
    for (const [index, spot] of spots.entries()) {
      const spec = TANKS[(index * 3 + variant) % TANKS.length] ?? this.player.spec;
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
  get target(): Actor | undefined {
    const p = this.player.visual.root.position;
    return this.enemies.find(enemy => {
      if (!enemy.alive) return false;
      const e = enemy.visual.root.position;
      const yaw = Math.atan2(-(e.x - p.x), -(e.z - p.z));
      return Math.abs(angleDelta(this.player.aim, yaw)) < 0.06 &&
        wallFraction(p.x, p.z, e.x - p.x, e.z - p.z, this.world.obstacles) === 1;
    });
  }
  getAimPoint(target: Vector3): Vector3 {
    return target.set(-Math.sin(this.player.aim) * Math.cos(this.player.pitch) * 100, 2.5 + Math.sin(this.player.pitch) * 100,
      -Math.cos(this.player.aim) * Math.cos(this.player.pitch) * 100).add(this.player.visual.root.position);
  }
  get score(): number {
    const accuracyBonus = this.shots ? this.hits / this.shots * 500 : 0;
    return Math.round((this.kills * 500 + Math.max(0, this.player.hp / this.player.maxHp) * 1000 + accuracyBonus +
      (this.mode === 'survival' ? Math.max(0, this.wave - 1) * 750 : Math.max(0, 300 - this.elapsed) * 5)) * DIFFICULTIES[this.difficulty].score);
  }
}
