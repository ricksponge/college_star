import { BRAWLERS_ROSTER } from '../entities/Brawlers';
import type { BrawlerId, GameModeId, IBrawler } from '../types/cctp';
import {
  arrive,
  avoidObstacles,
  clampScalar,
  clampVectorMagnitude,
  distance2D,
  evade,
  hasLineOfSight,
  hideBehindWalls,
  integrateSteering,
  resolveObstacleCollisions,
  seek,
  segmentIntersectsCircle,
  separation,
  type IIncomingProjectile,
  type ISteeringAgent,
  type ISteeringEnvironment,
  type IVector2D,
} from './SteeringBehaviors';

/**
 * Contrôleur de Bots Alliés autonomes (3v3 & Co-op Boss Fight) — 60 FPS.
 * Exploite les profils BRAWLERS_ROSTER (TIMO, LEO, MAYA, ZACK) via une machine à états finis.
 *
 * Référence projet : Brawl Collège — Issue #30 (Agent 6 : AI-BOTS)
 */

export type AllyBotState =
  | 'PATROL_SUPPORT'
  | 'ENGAGE_TARGET'
  | 'COLLECT_CRYSTAL'
  | 'DODGE_BOSS_LASER'
  | 'ASSIST_ALLY'
  | 'RETREAT_HEAL';

export interface IAllyObservedEntity {
  id: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  radius: number;
  hp: number;
  maxHp: number;
  shieldHp?: number;
}

export interface IAllyTargetObservation {
  id: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  radius: number;
  isCorrect: boolean;
  hp: number;
  maxHp: number;
  highlightedMs?: number;
  frozenMs?: number;
  slowedMs?: number;
  isCrystal?: boolean;
  isBoss?: boolean;
}

export interface ICrystalDropObservation {
  id: string;
  x: number;
  y: number;
}

export interface IArenaBallObservation {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  correctGoalPos?: IVector2D;
}

export interface IBossLaserHazard {
  laserSweepY: number;
  safeCorridorIndex: number;
  corridorCount?: number;
  arenaWidth?: number;
  bossPos?: IVector2D;
  bossHp?: number;
  bossMaxHp?: number;
}

export interface IAllyBotWorldContext {
  modeId: GameModeId;
  player: IAllyObservedEntity;
  targets: readonly IAllyTargetObservation[];
  projectiles?: readonly IIncomingProjectile[];
  rivals?: readonly IAllyObservedEntity[];
  droppedCrystals?: readonly ICrystalDropObservation[];
  arenaBall?: IArenaBallObservation;
  bossHazard?: IBossLaserHazard;
  healingZones?: readonly IVector2D[];
  waveElapsedSec?: number;
  crystalsCollected?: number;
  remainingMatchSec?: number;
}

export interface IAllyBotCommand {
  botId: string;
  brawlerId: BrawlerId;
  state: AllyBotState;
  /** Position intégrée du bot après le pas de simulation */
  position: IVector2D;
  /** Direction normalisée de déplacement souhaitée (stick virtuel [-1, 1]) */
  moveVector: IVector2D;
  /** Vitesse réelle (px/s) */
  velocity: IVector2D;
  /** Angle de visée en radians */
  aimAngleRad: number;
  /** Identifiant de la cible prioritaire visée */
  lockedTargetId: string | null;
  /** Impulsion d'attaque de base (consomme 1 munition si true) */
  shouldFire: boolean;
  /** Impulsion de déclenchement du Super (consomme la jauge à 100%) */
  shouldUseSuper: boolean;
  /** Impulsion de déclenchement du Gadget (consomme 1 charge) */
  shouldUseGadget: boolean;
}

export interface IAllyBotAgentOptions {
  id: string;
  brawlerId: BrawlerId;
  x: number;
  y: number;
  level?: number;
  slotIndex?: number;
  initialSuperGaugePct?: number;
  radius?: number;
}

interface IBrawlerCombatProfile {
  optimalRangeRatio: number;
  projectileSpeed: number;
  fireIntervalSec: number;
  flankAngleOffset: number;
}

const BRAWLER_COMBAT_PROFILES: Record<BrawlerId, IBrawlerCombatProfile> = {
  TIMO: {
    optimalRangeRatio: 0.8,
    projectileSpeed: 680,
    fireIntervalSec: 0.68,
    flankAngleOffset: 0.15,
  },
  LEO: {
    optimalRangeRatio: 0.76,
    projectileSpeed: 540,
    fireIntervalSec: 0.78,
    flankAngleOffset: -0.22,
  },
  MAYA: {
    optimalRangeRatio: 0.56,
    projectileSpeed: 580,
    fireIntervalSec: 0.84,
    flankAngleOffset: 0,
  },
  ZACK: {
    optimalRangeRatio: 0.68,
    projectileSpeed: 710,
    fireIntervalSec: 0.55,
    flankAngleOffset: 0.48,
  },
};

const ARENA_SPEED_SCALE = 0.34; // Aligné sur GameEngine.ts : speed_value * 0.34
const AMMO_RECHARGE_PER_SEC = 0.72;
const RETREAT_ENTER_HP_RATIO = 0.28;
const RETREAT_EXIT_HP_RATIO = 0.48;

interface IResolvedAimTarget {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isBoss: boolean;
}

/**
 * Agent Bot Allié autonome doté d'une machine à états finis (FSM) à 6 états.
 */
export class AllyBotAgent implements ISteeringAgent {
  public readonly id: string;
  public readonly brawler: IBrawler;
  public readonly slotIndex: number;
  public readonly position: IVector2D;
  public readonly velocity: IVector2D;
  public readonly radius: number;
  public maxSpeed: number;
  public maxForce: number;
  public headingRad: number;
  public angularSmoothing = 14;

  public state: AllyBotState = 'PATROL_SUPPORT';
  public hp: number;
  public maxHp: number;
  public ammoBars: number;
  public superGaugePct: number;
  public gadgetChargesLeft: number;
  public aimAngleRad = -Math.PI * 0.5;
  public lockedTargetId: string | null = null;

  private fireCooldownSec = 0;
  private superCooldownSec = 0;
  private gadgetCooldownSec = 1.5;
  private elapsedSec = 0;

  // Buffers scratch internes sans allocation à 60 FPS
  private readonly scratchPrimary: IVector2D = { x: 0, y: 0 };
  private readonly scratchEvade: IVector2D = { x: 0, y: 0 };
  private readonly scratchSep: IVector2D = { x: 0, y: 0 };
  private readonly scratchAvoid: IVector2D = { x: 0, y: 0 };
  private readonly scratchGoalTarget: IVector2D = { x: 0, y: 0 };
  private readonly scratchTotalForce: IVector2D = { x: 0, y: 0 };
  private readonly scratchThreatPos: IVector2D = { x: 0, y: 0 };
  private readonly scratchTargetPos: IVector2D = { x: 0, y: 0 };

  constructor(options: IAllyBotAgentOptions) {
    this.id = options.id;
    this.brawler = BRAWLERS_ROSTER[options.brawlerId];
    this.slotIndex = options.slotIndex ?? 0;
    this.position = { x: options.x, y: options.y };
    this.velocity = { x: 0, y: 0 };
    this.radius = options.radius ?? 20;

    const level = Math.max(1, options.level ?? 1);
    this.maxHp = Math.round(this.brawler.base_hp * (1 + 0.08 * (level - 1)));
    this.hp = this.maxHp;

    this.maxSpeed = this.brawler.speed_value * ARENA_SPEED_SCALE;
    this.maxForce = this.maxSpeed * 4.4;
    this.headingRad = -Math.PI * 0.5;

    this.ammoBars = this.brawler.max_ammo_bars;
    this.superGaugePct = clampScalar(options.initialSuperGaugePct ?? 0, 0, 100);
    this.gadgetChargesLeft = this.brawler.gadget.charges_per_match;
  }

  /**
   * Crédite la jauge de Super selon la formule CCTP : 34% + 6% * V_reflexe.
   */
  public notifySuccessfulHit(isFastReflex = true): number {
    const gain = 34 + (isFastReflex ? 6 : 0);
    this.superGaugePct = Math.min(100, this.superGaugePct + gain);
    return this.superGaugePct;
  }

  public applyDamage(amount: number): void {
    this.hp = Math.max(0, this.hp - Math.max(0, amount));
  }

  public heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + Math.max(0, amount));
  }

  public update(
    dtSec: number,
    context: IAllyBotWorldContext,
    env: ISteeringEnvironment,
    allyAgents: readonly ISteeringAgent[] = []
  ): IAllyBotCommand {
    const dt = clampScalar(dtSec, 0, 0.05);
    this.elapsedSec += dt;

    this.ammoBars = Math.min(
      this.brawler.max_ammo_bars,
      this.ammoBars + dt * AMMO_RECHARGE_PER_SEC
    );
    this.fireCooldownSec = Math.max(0, this.fireCooldownSec - dt);
    this.superCooldownSec = Math.max(0, this.superCooldownSec - dt);
    this.gadgetCooldownSec = Math.max(0, this.gadgetCooldownSec - dt);

    const projectiles = context.projectiles ?? [];
    const target = this.selectPriorityCombatTarget(context);
    const endangeredAlly = this.findEndangeredAlly(context, allyAgents);
    const nearestCrystal = this.findNearestCrystal(context);
    const dangerLaser = this.shouldDodgeBossLaser(context, env);

    // 1. Transition FSM par ordre de priorité tactique
    const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    if (dangerLaser) {
      this.state = 'DODGE_BOSS_LASER';
    } else if (
      hpRatio < RETREAT_ENTER_HP_RATIO ||
      (this.state === 'RETREAT_HEAL' && hpRatio < RETREAT_EXIT_HP_RATIO)
    ) {
      this.state = 'RETREAT_HEAL';
    } else if (this.shouldAssistAlly(endangeredAlly, context)) {
      this.state = 'ASSIST_ALLY';
    } else if (
      context.modeId === 'CHASSE_AUX_BONNES_NOTES' &&
      nearestCrystal !== null &&
      this.shouldPrioritizeCrystal(nearestCrystal, context)
    ) {
      this.state = 'COLLECT_CRYSTAL';
    } else if (target !== null || this.hasBallPlay(context)) {
      this.state = 'ENGAGE_TARGET';
    } else {
      this.state = 'PATROL_SUPPORT';
    }

    // 2. Calcul des forces de steering selon l'état actif
    this.computeStateSteering(
      context,
      env,
      allyAgents,
      target,
      endangeredAlly,
      nearestCrystal,
      projectiles
    );

    integrateSteering(this, this.scratchTotalForce, dt, env.bounds);
    resolveObstacleCollisions(this, env.obstacles, env.bounds);

    // 3. Décisions de visée, tir, Super et Gadget
    const { shouldFire, aimAngleRad, lockedTargetId } = this.computeCombatAction(
      context,
      env,
      target
    );
    this.aimAngleRad = aimAngleRad;
    this.lockedTargetId = lockedTargetId;

    const shouldUseSuper = this.evaluateSuperTrigger(context, endangeredAlly, target);
    const shouldUseGadget = this.evaluateGadgetTrigger(context, target);

    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    const moveVector: IVector2D =
      speed > 6 && this.maxSpeed > 0
        ? {
            x: clampScalar(this.velocity.x / this.maxSpeed, -1, 1),
            y: clampScalar(this.velocity.y / this.maxSpeed, -1, 1),
          }
        : { x: 0, y: 0 };

    return {
      botId: this.id,
      brawlerId: this.brawler.id,
      state: this.state,
      position: { x: this.position.x, y: this.position.y },
      moveVector,
      velocity: { x: this.velocity.x, y: this.velocity.y },
      aimAngleRad: this.aimAngleRad,
      lockedTargetId: this.lockedTargetId,
      shouldFire,
      shouldUseSuper,
      shouldUseGadget,
    };
  }

  private shouldDodgeBossLaser(
    context: IAllyBotWorldContext,
    env: ISteeringEnvironment
  ): boolean {
    if (context.modeId !== 'CONSEIL_DE_CLASSE' || !context.bossHazard) {
      return false;
    }
    const hazard = context.bossHazard;
    const corridorCount = Math.max(1, hazard.corridorCount ?? 4);
    const arenaWidth = hazard.arenaWidth ?? env.bounds.maxX - env.bounds.minX + 56;
    const corridorWidth = arenaWidth / corridorCount;
    const safeIndex = clampScalar(hazard.safeCorridorIndex, 0, corridorCount - 1);
    const safeMinX = safeIndex * corridorWidth;
    const safeMaxX = (safeIndex + 1) * corridorWidth;

    const distToLaserY = Math.abs(this.position.y - hazard.laserSweepY);
    if (distToLaserY >= 200) {
      return false;
    }

    // Hystérésis de bordure pour éviter les oscillations en limite de couloir
    const inset = this.state === 'DODGE_BOSS_LASER' ? Math.min(corridorWidth * 0.25, this.radius + 14) : 0;
    return this.position.x < safeMinX + inset || this.position.x > safeMaxX - inset;
  }

  private findEndangeredAlly(
    context: IAllyBotWorldContext,
    allyAgents: readonly ISteeringAgent[]
  ): IAllyObservedEntity | null {
    let lowest: IAllyObservedEntity | null = null;
    let lowestRatio = 1;

    if (context.player.hp > 0 && context.player.maxHp > 0) {
      lowestRatio = context.player.hp / context.player.maxHp;
      lowest = context.player;
    }

    for (let i = 0; i < allyAgents.length; i += 1) {
      const candidate = allyAgents[i];
      if (candidate.id === this.id) continue;
      if (candidate instanceof AllyBotAgent && candidate.hp > 0 && candidate.maxHp > 0) {
        const ratio = candidate.hp / candidate.maxHp;
        if (ratio < lowestRatio) {
          lowestRatio = ratio;
          lowest = {
            id: candidate.id,
            x: candidate.position.x,
            y: candidate.position.y,
            vx: candidate.velocity.x,
            vy: candidate.velocity.y,
            radius: candidate.radius,
            hp: candidate.hp,
            maxHp: candidate.maxHp,
          };
        }
      }
    }

    return lowest;
  }

  private shouldAssistAlly(
    endangeredAlly: IAllyObservedEntity | null,
    context: IAllyBotWorldContext
  ): boolean {
    if (!endangeredAlly || endangeredAlly.maxHp <= 0) return false;
    const allyRatio = endangeredAlly.hp / endangeredAlly.maxHp;

    if (this.brawler.id === 'LEO' && this.superGaugePct >= 100 && allyRatio < 0.75) {
      return true;
    }
    if (this.brawler.id === 'MAYA' && this.superGaugePct >= 100 && allyRatio < 0.78) {
      return true;
    }
    if (allyRatio < 0.5) {
      return true;
    }

    // En Match des Accords, protège le joueur s'il est proche du ballon et contesté
    if (
      context.modeId === 'MATCH_DES_ACCORDS' &&
      context.arenaBall &&
      context.rivals &&
      context.rivals.length > 0
    ) {
      const playerToBall = Math.hypot(
        context.player.x - context.arenaBall.x,
        context.player.y - context.arenaBall.y
      );
      if (playerToBall < 110 && allyRatio < 0.7) {
        return true;
      }
    }

    return false;
  }

  private findNearestCrystal(
    context: IAllyBotWorldContext
  ): ICrystalDropObservation | null {
    const drops = context.droppedCrystals;
    if (!drops || drops.length === 0) return null;

    let best: ICrystalDropObservation | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < drops.length; i += 1) {
      const c = drops[i];
      const d = Math.hypot(c.x - this.position.x, c.y - this.position.y);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  }

  private shouldPrioritizeCrystal(
    crystal: ICrystalDropObservation,
    context: IAllyBotWorldContext
  ): boolean {
    const botDist = Math.hypot(crystal.x - this.position.x, crystal.y - this.position.y);
    const playerDist = Math.hypot(crystal.x - context.player.x, crystal.y - context.player.y);
    return botDist <= 380 || botDist <= playerDist + 40;
  }

  private hasBallPlay(context: IAllyBotWorldContext): boolean {
    return Boolean(
      context.modeId === 'MATCH_DES_ACCORDS' &&
        context.arenaBall &&
        context.arenaBall.correctGoalPos
    );
  }

  private selectPriorityCombatTarget(
    context: IAllyBotWorldContext
  ): IResolvedAimTarget | null {
    let bestCorrect: IResolvedAimTarget | null = null;
    let bestCorrectDist = Infinity;
    let bossTarget: IResolvedAimTarget | null = null;

    // 1. Cibles pédagogiques valides (isCorrect === true uniquement, jamais de leurre faux)
    for (let i = 0; i < context.targets.length; i += 1) {
      const t = context.targets[i];
      if (t.hp <= 0) continue;

      if (t.isBoss) {
        bossTarget = {
          id: t.id,
          x: t.x,
          y: t.y,
          vx: t.vx ?? 0,
          vy: t.vy ?? 0,
          radius: t.radius,
          isBoss: true,
        };
        continue;
      }

      if (!t.isCorrect) continue;
      const d = Math.hypot(t.x - this.position.x, t.y - this.position.y);
      const priorityBias = (t.highlightedMs ?? 0) > 0 ? -75 : 0;
      if (d + priorityBias < bestCorrectDist) {
        bestCorrectDist = d + priorityBias;
        bestCorrect = {
          id: t.id,
          x: t.x,
          y: t.y,
          vx: t.vx ?? 0,
          vy: t.vy ?? 0,
          radius: t.radius,
          isBoss: false,
        };
      }
    }

    if (bestCorrect) {
      return bestCorrect;
    }

    // 2. Rivaux adverses (en 3v3) ou Boss (en Conseil de Classe)
    if (context.rivals && context.rivals.length > 0) {
      let bestRival: IResolvedAimTarget | null = null;
      let bestRivalDist = Infinity;
      for (let i = 0; i < context.rivals.length; i += 1) {
        const r = context.rivals[i];
        if (r.hp <= 0) continue;
        const d = Math.hypot(r.x - this.position.x, r.y - this.position.y);
        if (d < bestRivalDist) {
          bestRivalDist = d;
          bestRival = {
            id: r.id,
            x: r.x,
            y: r.y,
            vx: r.vx ?? 0,
            vy: r.vy ?? 0,
            radius: r.radius,
            isBoss: false,
          };
        }
      }
      if (bestRival) return bestRival;
    }

    return bossTarget;
  }

  private computeStateSteering(
    context: IAllyBotWorldContext,
    env: ISteeringEnvironment,
    allyAgents: readonly ISteeringAgent[],
    target: IResolvedAimTarget | null,
    endangeredAlly: IAllyObservedEntity | null,
    nearestCrystal: ICrystalDropObservation | null,
    projectiles: readonly IIncomingProjectile[]
  ): void {
    this.scratchPrimary.x = 0;
    this.scratchPrimary.y = 0;
    evade(this, projectiles, 0.48, this.scratchEvade);
    separation(this, allyAgents, 78, this.scratchSep);
    avoidObstacles(this, env.obstacles, 82, this.scratchAvoid);

    const bounds = env.bounds;
    const centerX = (bounds.minX + bounds.maxX) * 0.5;
    const profile = BRAWLER_COMBAT_PROFILES[this.brawler.id];

    switch (this.state) {
      case 'DODGE_BOSS_LASER': {
        const hazard = context.bossHazard;
        if (hazard) {
          const corridorCount = Math.max(1, hazard.corridorCount ?? 4);
          const arenaWidth = hazard.arenaWidth ?? bounds.maxX - bounds.minX + 56;
          const corridorWidth = arenaWidth / corridorCount;
          const safeIdx = clampScalar(hazard.safeCorridorIndex, 0, corridorCount - 1);
          const safeCenterX = clampScalar(
            (safeIdx + 0.5) * corridorWidth,
            bounds.minX + this.radius + 8,
            bounds.maxX - this.radius - 8
          );
          const desiredY = clampScalar(
            this.position.y,
            bounds.minY + 135,
            bounds.maxY - 64
          );
          this.scratchGoalTarget.x = safeCenterX;
          this.scratchGoalTarget.y = desiredY;
          seek(this, this.scratchGoalTarget, this.scratchPrimary);
        }
        break;
      }

      case 'RETREAT_HEAL': {
        if (context.healingZones && context.healingZones.length > 0) {
          let bestHeal = context.healingZones[0];
          let bestDist = Infinity;
          for (let i = 0; i < context.healingZones.length; i += 1) {
            const hz = context.healingZones[i];
            const d = distance2D(this.position, hz);
            if (d < bestDist) {
              bestDist = d;
              bestHeal = hz;
            }
          }
          arrive(this, bestHeal, 55, this.scratchPrimary);
        } else {
          this.findNearestThreatPos(context, this.scratchThreatPos);
          if (env.obstacles.length > 0 || env.bushes.length > 0) {
            hideBehindWalls(
              this,
              this.scratchThreatPos,
              env.obstacles,
              env.bushes,
              40,
              this.scratchPrimary,
              bounds
            );
          } else {
            this.scratchGoalTarget.x = clampScalar(
              context.player.x + (this.slotIndex === 0 ? -75 : 75),
              bounds.minX + 44,
              bounds.maxX - 44
            );
            this.scratchGoalTarget.y = bounds.maxY - 68;
            arrive(this, this.scratchGoalTarget, 70, this.scratchPrimary);
          }
        }
        break;
      }

      case 'ASSIST_ALLY': {
        const ally = endangeredAlly ?? context.player;

        // Maya s'interpose devant l'allié vers la menace ; Léo/Timo/Zack flanquent près de l'allié
        this.findNearestThreatPos(context, this.scratchThreatPos);
        const dx = this.scratchThreatPos.x - ally.x;
        const dy = this.scratchThreatPos.y - ally.y;
        const len = Math.hypot(dx, dy) || 1;
        const offsetDist = this.brawler.id === 'MAYA' ? 56 : 82;
        const dirSign = this.brawler.id === 'MAYA' ? 1 : -0.4;

        this.scratchGoalTarget.x = clampScalar(
          ally.x + (dx / len) * offsetDist * dirSign,
          bounds.minX + 42,
          bounds.maxX - 42
        );
        this.scratchGoalTarget.y = clampScalar(
          ally.y + (dy / len) * offsetDist * dirSign,
          bounds.minY + 42,
          bounds.maxY - 42
        );
        arrive(this, this.scratchGoalTarget, 64, this.scratchPrimary);
        break;
      }

      case 'COLLECT_CRYSTAL': {
        if (nearestCrystal) {
          this.scratchGoalTarget.x = nearestCrystal.x;
          this.scratchGoalTarget.y = nearestCrystal.y;
          seek(this, this.scratchGoalTarget, this.scratchPrimary);
        }
        break;
      }

      case 'ENGAGE_TARGET': {
        const ball = context.arenaBall;
        const goal = ball?.correctGoalPos;
        if (
          context.modeId === 'MATCH_DES_ACCORDS' &&
          ball &&
          goal &&
          (!target ||
            Math.hypot(ball.x - this.position.x, ball.y - this.position.y) < 250)
        ) {
          const gx = goal.x - ball.x;
          const gy = goal.y - ball.y;
          const gLen = Math.hypot(gx, gy) || 1;
          // Se place juste derrière le ballon par rapport à la bonne cage pour dribbler vers le but
          const approachDist = ball.radius + this.radius + 14;
          const behindBallX = ball.x - (gx / gLen) * approachDist;
          const behindBallY = ball.y - (gy / gLen) * approachDist;
          const distBehind = Math.hypot(
            behindBallX - this.position.x,
            behindBallY - this.position.y
          );

          if (distBehind < 42) {
            this.scratchGoalTarget.x = goal.x;
            this.scratchGoalTarget.y = goal.y;
            seek(this, this.scratchGoalTarget, this.scratchPrimary);
          } else {
            this.scratchGoalTarget.x = clampScalar(
              behindBallX,
              bounds.minX + 36,
              bounds.maxX - 36
            );
            this.scratchGoalTarget.y = clampScalar(
              behindBallY,
              bounds.minY + 36,
              bounds.maxY - 36
            );
            arrive(this, this.scratchGoalTarget, 52, this.scratchPrimary);
          }
        } else if (target) {
          const desiredStandOff =
            this.brawler.basic_attack.range * profile.optimalRangeRatio;
          const dx = this.position.x - target.x;
          const dy = this.position.y - target.y;
          const dist = Math.hypot(dx, dy) || 1;
          const baseAngle = Math.atan2(dy, dx);
          const strafeWave =
            Math.sin(this.elapsedSec * 1.65 + this.slotIndex * 2.1) * 0.28 +
            profile.flankAngleOffset;
          const orbitAngle = baseAngle + strafeWave;

          let goalX = clampScalar(
            target.x + Math.cos(orbitAngle) * desiredStandOff,
            bounds.minX + 42,
            bounds.maxX - 42
          );
          let goalY = clampScalar(
            target.y + Math.sin(orbitAngle) * desiredStandOff,
            bounds.minY + 42,
            bounds.maxY - 42
          );

          // En Conseil de Classe, rester dans le couloir sûr quand le laser approche
          if (context.modeId === 'CONSEIL_DE_CLASSE' && context.bossHazard) {
            const hazard = context.bossHazard;
            const corridorCount = Math.max(1, hazard.corridorCount ?? 4);
            const arenaWidth = hazard.arenaWidth ?? bounds.maxX - bounds.minX + 56;
            const corridorWidth = arenaWidth / corridorCount;
            const safeIdx = clampScalar(hazard.safeCorridorIndex, 0, corridorCount - 1);
            const corridorMin = safeIdx * corridorWidth + this.radius + 10;
            const corridorMax = (safeIdx + 1) * corridorWidth - this.radius - 10;
            goalX = clampScalar(goalX, corridorMin, corridorMax);
            goalY = clampScalar(goalY, bounds.minY + 135, bounds.maxY - 56);
          }

          // Si ligne de tir bloquée par un mur (hors Léo), décale latéralement pour dégager le tir
          this.scratchTargetPos.x = target.x;
          this.scratchTargetPos.y = target.y;
          if (
            this.brawler.id !== 'LEO' &&
            dist < this.brawler.basic_attack.range * 1.2 &&
            !hasLineOfSight(this.position, this.scratchTargetPos, env.obstacles, 4)
          ) {
            const perpSign = this.slotIndex % 2 === 0 ? 1 : -1;
            goalX = clampScalar(
              this.position.x + (-dy / dist) * 110 * perpSign,
              bounds.minX + 42,
              bounds.maxX - 42
            );
            goalY = clampScalar(
              this.position.y + (dx / dist) * 110 * perpSign,
              bounds.minY + 42,
              bounds.maxY - 42
            );
          }

          this.scratchGoalTarget.x = goalX;
          this.scratchGoalTarget.y = goalY;
          arrive(this, this.scratchGoalTarget, 76, this.scratchPrimary);
        }
        break;
      }

      case 'PATROL_SUPPORT': {
        const flankSide = this.slotIndex % 2 === 0 ? -1 : 1;
        const patrolX = clampScalar(
          centerX * 0.45 +
            context.player.x * 0.55 +
            flankSide * 155 +
            Math.cos(this.elapsedSec * 1.1 + this.slotIndex) * 48,
          bounds.minX + 50,
          bounds.maxX - 50
        );
        const patrolY = clampScalar(
          context.player.y - 105 + Math.sin(this.elapsedSec * 1.4 + this.slotIndex) * 38,
          bounds.minY + 60,
          bounds.maxY - 70
        );
        this.scratchGoalTarget.x = patrolX;
        this.scratchGoalTarget.y = patrolY;
        arrive(this, this.scratchGoalTarget, 72, this.scratchPrimary);
        break;
      }
    }

    const evadeWeight = this.state === 'DODGE_BOSS_LASER' ? 1.1 : 1.75;
    const totalX =
      this.scratchPrimary.x * 1.25 +
      this.scratchEvade.x * evadeWeight +
      this.scratchSep.x * 1.35 +
      this.scratchAvoid.x * 1.65;
    const totalY =
      this.scratchPrimary.y * 1.25 +
      this.scratchEvade.y * evadeWeight +
      this.scratchSep.y * 1.35 +
      this.scratchAvoid.y * 1.65;

    clampVectorMagnitude(totalX, totalY, this.maxForce, this.scratchTotalForce);
  }

  private findNearestThreatPos(context: IAllyBotWorldContext, out: IVector2D): void {
    let bestDist = Infinity;
    out.x = 480;
    out.y = 140;

    if (context.bossHazard?.bossPos) {
      out.x = context.bossHazard.bossPos.x;
      out.y = context.bossHazard.bossPos.y;
      bestDist = Math.hypot(out.x - this.position.x, out.y - this.position.y);
    }

    if (context.rivals) {
      for (let i = 0; i < context.rivals.length; i += 1) {
        const r = context.rivals[i];
        if (r.hp <= 0) continue;
        const d = Math.hypot(r.x - this.position.x, r.y - this.position.y);
        if (d < bestDist) {
          bestDist = d;
          out.x = r.x;
          out.y = r.y;
        }
      }
    }

    for (let i = 0; i < context.targets.length; i += 1) {
      const t = context.targets[i];
      if (t.hp <= 0) continue;
      const d = Math.hypot(t.x - this.position.x, t.y - this.position.y);
      if (d < bestDist) {
        bestDist = d;
        out.x = t.x;
        out.y = t.y;
      }
    }
  }

  private computeCombatAction(
    context: IAllyBotWorldContext,
    env: ISteeringEnvironment,
    target: IResolvedAimTarget | null
  ): { shouldFire: boolean; aimAngleRad: number; lockedTargetId: string | null } {
    if (!target) {
      return {
        shouldFire: false,
        aimAngleRad: this.headingRad,
        lockedTargetId: null,
      };
    }

    const profile = BRAWLER_COMBAT_PROFILES[this.brawler.id];
    const dist = Math.hypot(target.x - this.position.x, target.y - this.position.y);
    const tof = clampScalar(dist / profile.projectileSpeed, 0, 0.45);
    const predictedX = target.x + target.vx * tof;
    const predictedY = target.y + target.vy * tof;
    const aimAngleRad = Math.atan2(
      predictedY - this.position.y,
      predictedX - this.position.x
    );

    if (
      this.state === 'RETREAT_HEAL' ||
      this.ammoBars < 1 ||
      this.fireCooldownSec > 0 ||
      dist > this.brawler.basic_attack.range * 1.05
    ) {
      return {
        shouldFire: false,
        aimAngleRad,
        lockedTargetId: target.id,
      };
    }

    // Léo lance sa fiole par-dessus les murs ; les autres vérifient la ligne de tir
    if (this.brawler.id !== 'LEO') {
      this.scratchTargetPos.x = predictedX;
      this.scratchTargetPos.y = predictedY;
      if (!hasLineOfSight(this.position, this.scratchTargetPos, env.obstacles, 3)) {
        return {
          shouldFire: false,
          aimAngleRad,
          lockedTargetId: target.id,
        };
      }

      // Ne jamais tirer à travers un leurre erroné interposé sur la trajectoire
      for (let i = 0; i < context.targets.length; i += 1) {
        const other = context.targets[i];
        if (other.id === target.id || other.hp <= 0 || other.isCorrect || other.isBoss) {
          continue;
        }
        if (
          segmentIntersectsCircle(
            this.position.x,
            this.position.y,
            predictedX,
            predictedY,
            other.x,
            other.y,
            other.radius + 6
          )
        ) {
          return {
            shouldFire: false,
            aimAngleRad,
            lockedTargetId: target.id,
          };
        }
      }
    }

    this.ammoBars = Math.max(0, this.ammoBars - 1);
    this.fireCooldownSec = profile.fireIntervalSec;

    return {
      shouldFire: true,
      aimAngleRad,
      lockedTargetId: target.id,
    };
  }

  private evaluateSuperTrigger(
    context: IAllyBotWorldContext,
    endangeredAlly: IAllyObservedEntity | null,
    target: IResolvedAimTarget | null
  ): boolean {
    if (this.superGaugePct < 100 || this.superCooldownSec > 0) {
      return false;
    }

    let trigger = false;

    switch (this.brawler.id) {
      case 'LEO': {
        const allyHurt =
          endangeredAlly !== null &&
          endangeredAlly.maxHp > 0 &&
          endangeredAlly.hp / endangeredAlly.maxHp < 0.74;
        const selfHurt = this.hp / Math.max(1, this.maxHp) < 0.68;
        const nearBoss = context.modeId === 'CONSEIL_DE_CLASSE' && target !== null;
        trigger = allyHurt || selfHurt || nearBoss;
        break;
      }
      case 'MAYA': {
        const distToPlayer = Math.hypot(
          context.player.x - this.position.x,
          context.player.y - this.position.y
        );
        const playerHurt =
          context.player.maxHp > 0 && context.player.hp / context.player.maxHp < 0.78;
        const closePressure =
          (context.projectiles?.length ?? 0) >= 2 || (context.rivals?.length ?? 0) >= 1;
        trigger = distToPlayer <= 260 && (playerHurt || closePressure || target !== null);
        break;
      }
      case 'TIMO': {
        if (target !== null) {
          const d = Math.hypot(target.x - this.position.x, target.y - this.position.y);
          trigger = d <= 620;
        }
        break;
      }
      case 'ZACK': {
        if (target !== null) {
          const d = Math.hypot(target.x - this.position.x, target.y - this.position.y);
          trigger = d > 190 || (context.remainingMatchSec ?? 999) <= 35;
        }
        break;
      }
    }

    if (trigger) {
      this.superGaugePct = 0;
      this.superCooldownSec = 1.5;
    }

    return trigger;
  }

  private evaluateGadgetTrigger(
    context: IAllyBotWorldContext,
    target: IResolvedAimTarget | null
  ): boolean {
    if (this.gadgetChargesLeft <= 0 || this.gadgetCooldownSec > 0) {
      return false;
    }

    let trigger = false;
    let aliveCorrectUnhighlighted = 0;
    let aliveWrongCount = 0;
    let unslowedCount = 0;

    for (let i = 0; i < context.targets.length; i += 1) {
      const t = context.targets[i];
      if (t.hp <= 0) continue;
      if (t.isCorrect) {
        if ((t.highlightedMs ?? 0) <= 0) aliveCorrectUnhighlighted += 1;
      } else if (!t.isBoss) {
        aliveWrongCount += 1;
      }
      if ((t.slowedMs ?? 0) <= 0) {
        unslowedCount += 1;
      }
    }

    switch (this.brawler.id) {
      case 'TIMO': {
        const waveAge = context.waveElapsedSec ?? 2;
        trigger = aliveCorrectUnhighlighted > 0 && waveAge >= 1.4;
        break;
      }
      case 'LEO': {
        trigger = aliveWrongCount >= 2;
        break;
      }
      case 'MAYA': {
        trigger = aliveCorrectUnhighlighted > 0 && target !== null;
        break;
      }
      case 'ZACK': {
        trigger = unslowedCount >= 2;
        break;
      }
    }

    if (trigger) {
      this.gadgetChargesLeft -= 1;
      this.gadgetCooldownSec = 6.5;
    }

    return trigger;
  }
}

/**
 * Directeur d'escouade gérant l'équipe de Bots Alliés en 3v3 et Co-op PVE Boss.
 */
export class AllyBotDirector {
  private bots: AllyBotAgent[] = [];
  private readonly commandsBuffer: IAllyBotCommand[] = [];

  public setBots(bots: AllyBotAgent[]): void {
    this.bots = bots;
  }

  public getBots(): readonly AllyBotAgent[] {
    return this.bots;
  }

  public clear(): void {
    this.bots = [];
  }

  /**
   * Instancie automatiquement une escouade de Bots Alliés complémentaires
   * au héros choisi par le joueur pour les modes 3v3 ou Co-op PVE Boss.
   */
  public createTeamForMode(
    modeId: GameModeId,
    humanBrawlerId: BrawlerId,
    spawnAnchor: IVector2D = { x: 480, y: 525 },
    allyLevel = 1
  ): AllyBotAgent[] {
    const allIds: BrawlerId[] = ['MAYA', 'LEO', 'TIMO', 'ZACK'];
    const candidates = allIds.filter((id) => id !== humanBrawlerId);

    const botCount =
      modeId === 'CHASSE_AUX_BONNES_NOTES' ||
      modeId === 'MATCH_DES_ACCORDS' ||
      modeId === 'CONSEIL_DE_CLASSE'
        ? 2
        : 0;

    const created: AllyBotAgent[] = [];
    for (let i = 0; i < botCount; i += 1) {
      const brawlerId = candidates[i % candidates.length];
      const offsetX = i === 0 ? -120 : 120;
      created.push(
        new AllyBotAgent({
          id: `ally_bot_${brawlerId.toLowerCase()}_${i + 1}`,
          brawlerId,
          x: spawnAnchor.x + offsetX,
          y: spawnAnchor.y,
          level: allyLevel,
          slotIndex: i,
        })
      );
    }

    this.bots = created;
    return created;
  }

  /**
   * Met à jour tous les Bots Alliés à 60 FPS et retourne la liste de leurs ordres d'action.
   */
  public update(
    dtSec: number,
    context: IAllyBotWorldContext,
    env: ISteeringEnvironment
  ): IAllyBotCommand[] {
    this.commandsBuffer.length = 0;
    for (let i = 0; i < this.bots.length; i += 1) {
      const bot = this.bots[i];
      if (bot.hp <= 0) continue;
      this.commandsBuffer.push(bot.update(dtSec, context, env, this.bots));
    }
    return this.commandsBuffer;
  }
}
