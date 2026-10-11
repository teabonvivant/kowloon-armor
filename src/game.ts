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

export type GameMode = 'drive' | 'battle' | 'campaign' | 'survival';
export type GamePhase = 'garage' | 'playing' | 'paused' | 'victory' | 'defeat';
export type CameraMode = 'chase' | 'driver' | 'gunner';
export interface GameEvents {
  readonly shot: () => void; readonly hit: (damage: number, killed: boolean, enemy: boolean) => void;
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
  private readonly actors: Actor[] = [];
  private readonly effects: Effects; private readonly combat: Combat;
  constructor(private readonly scene: Scene, readonly world: WorldData, private readonly events: GameEvents) {
    this.player = createActor(firstTank(), 0, 100); scene.add(this.player.visual.root);
    this.effects = new Effects(scene);
    this.combat = new Combat(scene, this.effects, { shot: () => { this.shots++; events.shot(); },
      hit: (damage, killed, enemy) => { if (enemy) { this.hits++; if (killed) this.kills++; }
        events.hit(damage, killed, enemy); } });
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
    this.elapsed += dt; this.scope = input.scope;
    if (input.toggleCamera) this.cycleCamera();
    const actors = this.actors;
    actors.length = 0; actors.push(this.player, ...this.enemies);
    drivePlayer(this.player, input, dt, this.world.obstacles, actors);
    if (input.fire) this.combat.fire(this.player, this.world.obstacles);
    const p = this.player.visual.root.position;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      advanceEnemy(enemy, this.player, dt, this.world.obstacles, actors);
      const e = enemy.visual.root.position;
      const desired = Math.atan2(-(p.x - e.x), -(p.z - e.z));
      const clear = wallFraction(e.x, e.z, p.x - e.x, p.z - e.z, this.world.obstacles) === 1;
      if (clear && e.distanceTo(p) < 200 && Math.abs(angleDelta(enemy.aim, desired)) < 0.045) this.combat.fire(enemy, this.world.obstacles);
    }
    const waveDamage = this.mode === 'survival' ? Math.min(1.7, 1 + (this.wave - 1) * .08) : 1;
    this.combat.update(dt, actors, this.world.obstacles,
      (this.mode === 'campaign' ? (this.mission?.enemyDamage ?? 24) / 100 : .32) * DIFFICULTIES[this.difficulty].damage * waveDamage);
    this.effects.update(dt);
    if (!this.player.alive) this.finish(false);
    else if (this.mode === 'survival') this.updateSurvival(dt);
    else if (this.mode !== 'drive' && this.kills === this.totalEnemies) this.finish(true);
    else if (this.mode === 'campaign' && this.mission && this.elapsed >= this.mission.timeLimit) this.finish(false);
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
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + Math.round(this.player.maxHp * .2));
        this.spawnEnemies(encounterSpawns(this.seed + this.wave * 997, waveSize(this.wave),
          this.player.visual.root.position, this.world.obstacles), (this.seed + this.wave * 5) % TANKS.length);
        this.events.notify(`第 ${this.wave} 波到達 · 已補充 20% 車體耐久`);
      }
    } else if (this.enemies.every(enemy => !enemy.alive)) {
      this.combat.clear(); this.intermission = 8;
      this.events.notify(`第 ${this.wave} 波完成 · 8 秒後增援，趁機轉移位置`);
    }
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
