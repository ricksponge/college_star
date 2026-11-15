import type { IQuestion } from '../types/cctp';
import {
  avoidObstacles,
  clampScalar,
  clampVectorMagnitude,
  distance2D,
  evade,
  findBestCoverSpot,
  flee,
  hideBehindWalls,
  integrateSteering,
  patrolAndInterpose,
  resolveObstacleCollisions,
  seek,
  separation,
  type IArenaBounds,
  type IBushZone,
  type ICoverSpotResult,
  type IIncomingProjectile,
  type ISteeringAgent,
  type ISteeringEnvironment,
  type ISteeringWeights,
  type IVector2D,
} from './SteeringBehaviors';

/**
 * Contrôleur IA 60 FPS pour les Drones-Réponses QCM :
 * - TACTICIAN (bonne réponse) : cherche buissons/abris, esquive projectiles, fuit si menacé, reste visible périodiquement.
 * - DECOY (mauvaises réponses) : patrouille en formation, interposition sur la ligne de tir vers le Tacticien, séparation de groupe.
 *
 * Référence projet : Brawl Collège — Issue #30 (Agent 6 : AI-BOTS)
 */

export type AnswerDroneRole = 'TACTICIAN' | 'DECOY';

export type AnswerDroneIntention =
  | 'seekingBush'
  | 'hidingBehindWall'
  | 'evading'
  | 'interposing'
  | 'patrolling'
  | 'peeking';

export interface IAnswerDroneEntity extends ISteeringAgent {
  id: string;
  label: string;
  is_correct: boolean;
  role: AnswerDroneRole;
  hp: number;
  maxHp: number;
  baseMaxSpeed: number;
  headingRad: number;
  intention: AnswerDroneIntention;
  isHiddenInBush: boolean;
  frozenMs: number;
  slowedMs: number;
  highlightedMs: number;
  /** Compteur interne de temps passé en abri pour le cycle de visibilité périodique */
  coverHoldSec: number;
  /** Durée restante de sortie brève (peek) hors de l'abri */
  peekRemainingSec: number;
  /** Waypoints de patrouille propres au drone */
  patrolWaypoints: IVector2D[];
  /** Dernier point d'abri ciblé */
  coverTargetPos: IVector2D | null;
}

export interface IAnswerDroneStateSnapshot {
  id: string;
  label: string;
  role: AnswerDroneRole;
  is_correct: boolean;
  position: IVector2D;
  velocity: IVector2D;
  headingRad: number;
  intention: AnswerDroneIntention;
  isHiddenInBush: boolean;
  hp: number;
  maxHp: number;
}

export interface IAnswerDroneDirectorOptions {
  calmMode?: boolean;
  speedMultiplier?: number;
  weights?: Partial<ISteeringWeights>;
  tacticianPanicRadius?: number;
  coverHoldMaxSec?: number;
  peekDurationSec?: number;
}

export interface IDroneSpawnOptions {
  hp?: number;
  radius?: number;
  tacticianSpeed?: number;
  decoySpeed?: number;
  maxForce?: number;
}

const CALM_MODE_SPEED_FACTOR = 0.8; // -20% selon spécification CCTP
const SLOWED_STATUS_FACTOR = 0.5; // -50% (Gadget Zack Pause Récré)

const DEFAULT_DRONE_WEIGHTS: ISteeringWeights = {
  seek: 1.0,
  flee: 1.45,
  arrive: 1.0,
  evade: 2.0,
  hide: 1.35,
  separation: 1.45,
  interpose: 1.35,
  patrol: 0.9,
  obstacleAvoidance: 1.75,
};

function buildFormationWaypoints(
  centerX: number,
  centerY: number,
  slotIndex: number,
  totalSlots: number,
  bounds: IArenaBounds
): IVector2D[] {
  const phase = (slotIndex / Math.max(1, totalSlots)) * Math.PI * 2;
  const rx = Math.min(185, (bounds.maxX - bounds.minX) * 0.25);
  const ry = Math.min(130, (bounds.maxY - bounds.minY) * 0.24);
  const points: IVector2D[] = [];

  for (let i = 0; i < 4; i += 1) {
    const a = phase + (i * Math.PI) / 2;
    const x = clampScalar(centerX + Math.cos(a) * rx, bounds.minX + 52, bounds.maxX - 52);
    const y = clampScalar(centerY + Math.sin(a) * ry, bounds.minY + 52, bounds.maxY - 52);
    points.push({ x, y });
  }
  return points;
}

/**
 * Crée une entité Drone-Réponse configurée pour l'IA Tacticien ou Leurre.
 */
export function createAnswerDroneEntity(params: {
  id: string;
  label: string;
  is_correct: boolean;
  x: number;
  y: number;
  hp?: number;
  radius?: number;
  maxSpeed?: number;
  maxForce?: number;
  patrolWaypoints?: IVector2D[];
}): IAnswerDroneEntity {
  const role: AnswerDroneRole = params.is_correct ? 'TACTICIAN' : 'DECOY';
  const baseMaxSpeed = params.maxSpeed ?? (role === 'TACTICIAN' ? 245 : 195);
  const hp = params.hp ?? (role === 'TACTICIAN' ? 1100 : 950);

  return {
    id: params.id,
    label: params.label,
    is_correct: params.is_correct,
    role,
    position: { x: params.x, y: params.y },
    velocity: { x: 0, y: 0 },
    radius: params.radius ?? 24,
    maxSpeed: baseMaxSpeed,
    baseMaxSpeed,
    maxForce: params.maxForce ?? 780,
    headingRad: Math.PI * 0.5,
    angularSmoothing: 11,
    hp,
    maxHp: hp,
    intention: role === 'TACTICIAN' ? 'hidingBehindWall' : 'patrolling',
    isHiddenInBush: false,
    frozenMs: 0,
    slowedMs: 0,
    highlightedMs: 0,
    coverHoldSec: 0,
    peekRemainingSec: 0,
    patrolWaypoints: params.patrolWaypoints ?? [],
    coverTargetPos: null,
  };
}

/**
 * Directeur d'IA 60 FPS orchestrant l'ensemble des Drones-Réponses actifs.
 */
export class AnswerDroneDirector {
  private drones: IAnswerDroneEntity[] = [];
  private calmMode: boolean;
  private speedMultiplier: number;
  private readonly weights: ISteeringWeights;
  private readonly tacticianPanicRadius: number;
  private readonly coverHoldMaxSec: number;
  private readonly peekDurationSec: number;
  private elapsedTimeSec = 0;

  // Buffers scratch pré-alloués pour zéro allocation GC en boucle 60 FPS
  private readonly scratchEvade: IVector2D = { x: 0, y: 0 };
  private readonly scratchFlee: IVector2D = { x: 0, y: 0 };
  private readonly scratchHide: IVector2D = { x: 0, y: 0 };
  private readonly scratchPeek: IVector2D = { x: 0, y: 0 };
  private readonly scratchInterpose: IVector2D = { x: 0, y: 0 };
  private readonly scratchSep: IVector2D = { x: 0, y: 0 };
  private readonly scratchAvoid: IVector2D = { x: 0, y: 0 };
  private readonly scratchTotalForce: IVector2D = { x: 0, y: 0 };
  private readonly scratchPeekTarget: IVector2D = { x: 0, y: 0 };
  private readonly scratchCenterTarget: IVector2D = { x: 0, y: 0 };
  private readonly scratchCover: ICoverSpotResult = {
    found: false,
    kind: 'NONE',
    position: { x: 0, y: 0 },
    score: -Infinity,
  };
  private readonly workingBushes: IBushZone[] = [];
  private readonly aliveDronesBuffer: IAnswerDroneEntity[] = [];
  private readonly snapshotsBuffer: IAnswerDroneStateSnapshot[] = [];

  constructor(options: IAnswerDroneDirectorOptions = {}) {
    this.calmMode = options.calmMode ?? false;
    this.speedMultiplier = clampScalar(options.speedMultiplier ?? 1.0, 0.5, 1.8);
    this.weights = { ...DEFAULT_DRONE_WEIGHTS, ...options.weights };
    this.tacticianPanicRadius = options.tacticianPanicRadius ?? 195;
    this.coverHoldMaxSec = options.coverHoldMaxSec ?? 4.0;
    this.peekDurationSec = options.peekDurationSec ?? 1.35;
  }

  public setCalmMode(enabled: boolean): void {
    this.calmMode = enabled;
  }

  public isCalmMode(): boolean {
    return this.calmMode;
  }

  public setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = clampScalar(multiplier, 0.5, 1.8);
  }

  public setDrones(drones: IAnswerDroneEntity[]): void {
    this.drones = drones;
  }

  public getDrones(): readonly IAnswerDroneEntity[] {
    return this.drones;
  }

  public addDrone(drone: IAnswerDroneEntity): void {
    this.drones.push(drone);
  }

  public removeDrone(id: string): void {
    this.drones = this.drones.filter((d) => d.id !== id);
  }

  /**
   * Génère et enregistre les drones à partir d'une question QCM IQuestion.
   */
  public spawnFromQuestion(
    question: IQuestion,
    env: ISteeringEnvironment,
    options: IDroneSpawnOptions = {}
  ): IAnswerDroneEntity[] {
    const bounds = env.bounds;
    const centerX = (bounds.minX + bounds.maxX) * 0.5;
    const topY = bounds.minY + (bounds.maxY - bounds.minY) * 0.28;
    const spanW = (bounds.maxX - bounds.minX) * 0.72;
    const count = Math.max(1, question.targets.length);
    let decoyIdx = 0;
    const decoyCount = Math.max(
      1,
      question.targets.filter((t) => !t.is_correct).length
    );

    const created: IAnswerDroneEntity[] = question.targets.map((target, index) => {
      const ratio = count === 1 ? 0.5 : index / (count - 1);
      const x = centerX - spanW * 0.5 + spanW * ratio;
      const y = topY + (index % 2 === 0 ? -24 : 26);

      let waypoints: IVector2D[] = [];
      if (!target.is_correct) {
        waypoints = buildFormationWaypoints(
          centerX,
          bounds.minY + (bounds.maxY - bounds.minY) * 0.36,
          decoyIdx,
          decoyCount,
          bounds
        );
        decoyIdx += 1;
      }

      return createAnswerDroneEntity({
        id: `${question.id}_drone_${index}`,
        label: target.label,
        is_correct: target.is_correct,
        x,
        y,
        hp: options.hp,
        radius: options.radius,
        maxSpeed: target.is_correct ? options.tacticianSpeed : options.decoySpeed,
        maxForce: options.maxForce,
        patrolWaypoints: waypoints,
      });
    });

    this.drones = created;
    return created;
  }

  /**
   * Met à jour tous les drones actifs à 60 FPS et retourne leur snapshot d'état/intention.
   */
  public update(
    dtSec: number,
    playerPos: IVector2D,
    projectiles: readonly IIncomingProjectile[],
    env: ISteeringEnvironment
  ): IAnswerDroneStateSnapshot[] {
    const dt = clampScalar(dtSec, 0, 0.05);
    this.elapsedTimeSec = (env.timeSec ?? this.elapsedTimeSec) + dt;

    this.syncWorkingBushes(env.bushes);
    this.aliveDronesBuffer.length = 0;

    let tactician: IAnswerDroneEntity | null = null;
    for (let i = 0; i < this.drones.length; i += 1) {
      const d = this.drones[i];
      if (d.hp > 0) {
        this.aliveDronesBuffer.push(d);
        if (d.role === 'TACTICIAN' && tactician === null) {
          tactician = d;
        }
      }
    }

    const neighbors = env.neighbors ?? this.aliveDronesBuffer;
    const arenaCenterX = (env.bounds.minX + env.bounds.maxX) * 0.5;
    const arenaCenterY = (env.bounds.minY + env.bounds.maxY) * 0.5;
    this.scratchCenterTarget.x = arenaCenterX;
    this.scratchCenterTarget.y = arenaCenterY;

    const protectedPos = tactician ? tactician.position : this.scratchCenterTarget;

    // Traiter d'abord les Tacticiens pour qu'ils réservent leurs buissons en priorité
    for (let i = 0; i < this.aliveDronesBuffer.length; i += 1) {
      const drone = this.aliveDronesBuffer[i];
      if (drone.role === 'TACTICIAN') {
        this.updateSingleDrone(
          drone,
          dt,
          playerPos,
          protectedPos,
          projectiles,
          env,
          neighbors
        );
      }
    }

    // Ensuite les Leurres en formation & interposition
    for (let i = 0; i < this.aliveDronesBuffer.length; i += 1) {
      const drone = this.aliveDronesBuffer[i];
      if (drone.role === 'DECOY') {
        this.updateSingleDrone(
          drone,
          dt,
          playerPos,
          protectedPos,
          projectiles,
          env,
          neighbors
        );
      }
    }

    // Construire les snapshots de retour en réutilisant le buffer
    this.snapshotsBuffer.length = 0;
    for (let i = 0; i < this.aliveDronesBuffer.length; i += 1) {
      const d = this.aliveDronesBuffer[i];
      this.snapshotsBuffer.push({
        id: d.id,
        label: d.label,
        role: d.role,
        is_correct: d.is_correct,
        position: { x: d.position.x, y: d.position.y },
        velocity: { x: d.velocity.x, y: d.velocity.y },
        headingRad: d.headingRad,
        intention: d.intention,
        isHiddenInBush: d.isHiddenInBush,
        hp: d.hp,
        maxHp: d.maxHp,
      });
    }

    return this.snapshotsBuffer;
  }

  private syncWorkingBushes(bushes: readonly IBushZone[]): void {
    this.workingBushes.length = 0;
    for (let i = 0; i < bushes.length; i += 1) {
      const b = bushes[i];
      this.workingBushes.push({
        id: b.id ?? `bush_${i}`,
        x: b.x,
        y: b.y,
        radius: b.radius,
        occupiedByAgentId: b.occupiedByAgentId ?? null,
        coverScore: b.coverScore,
      });
    }
  }

  private updateSingleDrone(
    drone: IAnswerDroneEntity,
    dt: number,
    playerPos: IVector2D,
    protectedPos: IVector2D,
    projectiles: readonly IIncomingProjectile[],
    env: ISteeringEnvironment,
    neighbors: readonly ISteeringAgent[]
  ): void {
    const dtMs = dt * 1000;
    if (drone.highlightedMs > 0) {
      drone.highlightedMs = Math.max(0, drone.highlightedMs - dtMs);
    }
    if (drone.slowedMs > 0) {
      drone.slowedMs = Math.max(0, drone.slowedMs - dtMs);
    }
    if (drone.frozenMs > 0) {
      drone.frozenMs = Math.max(0, drone.frozenMs - dtMs);
      drone.velocity.x = 0;
      drone.velocity.y = 0;
      this.refreshBushOccupancy(drone);
      return;
    }

    const baseSpeed = drone.baseMaxSpeed > 0 ? drone.baseMaxSpeed : drone.maxSpeed;
    const calmFactor = this.calmMode ? CALM_MODE_SPEED_FACTOR : 1.0;
    const slowFactor = drone.slowedMs > 0 ? SLOWED_STATUS_FACTOR : 1.0;
    const effectiveSpeed = baseSpeed * this.speedMultiplier * calmFactor * slowFactor;
    drone.maxSpeed = effectiveSpeed;

    if (drone.role === 'TACTICIAN') {
      this.computeTacticianSteering(drone, dt, playerPos, projectiles, env, neighbors);
    } else {
      this.computeDecoySteering(drone, playerPos, protectedPos, projectiles, env, neighbors);
    }

    integrateSteering(drone, this.scratchTotalForce, dt, env.bounds);
    resolveObstacleCollisions(drone, env.obstacles, env.bounds);
    this.refreshBushOccupancy(drone);

    // Restaure maxSpeed nominal pour prévenir toute dérive si lu en externe
    drone.maxSpeed = baseSpeed;
  }

  private computeTacticianSteering(
    drone: IAnswerDroneEntity,
    dt: number,
    playerPos: IVector2D,
    projectiles: readonly IIncomingProjectile[],
    env: ISteeringEnvironment,
    neighbors: readonly ISteeringAgent[]
  ): void {
    evade(drone, projectiles, 0.58, this.scratchEvade);
    flee(drone, playerPos, this.tacticianPanicRadius, this.scratchFlee);
    separation(drone, neighbors, 76, this.scratchSep);
    avoidObstacles(drone, env.obstacles, 84, this.scratchAvoid);

    const evadeMagSq =
      this.scratchEvade.x * this.scratchEvade.x + this.scratchEvade.y * this.scratchEvade.y;
    const fleeMagSq =
      this.scratchFlee.x * this.scratchFlee.x + this.scratchFlee.y * this.scratchFlee.y;

    const cover = findBestCoverSpot(
      drone,
      playerPos,
      env.obstacles,
      this.workingBushes,
      42,
      env.bounds,
      this.scratchCover
    );

    if (cover.found) {
      if (!drone.coverTargetPos) {
        drone.coverTargetPos = { x: cover.position.x, y: cover.position.y };
      } else {
        drone.coverTargetPos.x = cover.position.x;
        drone.coverTargetPos.y = cover.position.y;
      }
      if (cover.kind === 'BUSH' && cover.bushId) {
        this.claimBush(cover.bushId, drone.id);
      }
    }

    // Cycle de visibilité périodique : ne reste pas indéfiniment caché hors de vue
    const distToCover = cover.found ? distance2D(drone.position, cover.position) : Infinity;
    const isSheltered = drone.isHiddenInBush || distToCover < 42;
    const underImmediateThreat = evadeMagSq > 400 || fleeMagSq > 900;

    if (underImmediateThreat) {
      drone.peekRemainingSec = 0;
      drone.coverHoldSec = 0;
    } else if (drone.peekRemainingSec > 0) {
      drone.peekRemainingSec = Math.max(0, drone.peekRemainingSec - dt);
    } else if (isSheltered) {
      drone.coverHoldSec += dt;
      if (drone.coverHoldSec >= this.coverHoldMaxSec) {
        drone.coverHoldSec = 0;
        drone.peekRemainingSec = this.peekDurationSec;
      }
    } else {
      drone.coverHoldSec = Math.max(0, drone.coverHoldSec - dt * 0.5);
    }

    let primaryX = 0;
    let primaryY = 0;

    if (drone.peekRemainingSec > 0 && !underImmediateThreat) {
      // Sortie latérale contrôlée vers le centre / flanc visible de l'arène
      const centerX = (env.bounds.minX + env.bounds.maxX) * 0.5;
      const centerY = (env.bounds.minY + env.bounds.maxY) * 0.5;
      const toPlayerX = playerPos.x - drone.position.x;
      const toPlayerY = playerPos.y - drone.position.y;
      const len = Math.hypot(toPlayerX, toPlayerY) || 1;
      const sideSign = Math.sin(this.elapsedTimeSec * 1.3) >= 0 ? 1 : -1;

      this.scratchPeekTarget.x = clampScalar(
        drone.position.x * 0.45 + centerX * 0.55 + (-toPlayerY / len) * 95 * sideSign,
        env.bounds.minX + 64,
        env.bounds.maxX - 64
      );
      this.scratchPeekTarget.y = clampScalar(
        drone.position.y * 0.45 + centerY * 0.55 + (toPlayerX / len) * 95 * sideSign,
        env.bounds.minY + 64,
        env.bounds.maxY - 64
      );

      seek(drone, this.scratchPeekTarget, this.scratchPeek);
      primaryX = this.scratchPeek.x * this.weights.seek;
      primaryY = this.scratchPeek.y * this.weights.seek;
      drone.intention = 'peeking';
    } else {
      hideBehindWalls(
        drone,
        playerPos,
        env.obstacles,
        this.workingBushes,
        42,
        this.scratchHide,
        env.bounds
      );
      primaryX = this.scratchHide.x * this.weights.hide;
      primaryY = this.scratchHide.y * this.weights.hide;

      if (evadeMagSq > 400) {
        drone.intention = 'evading';
      } else if (fleeMagSq > 900) {
        drone.intention = 'evading';
      } else if (cover.found && cover.kind === 'BUSH') {
        drone.intention = 'seekingBush';
      } else {
        drone.intention = 'hidingBehindWall';
      }
    }

    // Rappel doux anti-coincement dans les coins quand l'agent fuit le long d'un bord
    let cornerEscapeX = 0;
    let cornerEscapeY = 0;
    const edgeMargin = 58;
    const nearEdge =
      drone.position.x < env.bounds.minX + edgeMargin ||
      drone.position.x > env.bounds.maxX - edgeMargin ||
      drone.position.y < env.bounds.minY + edgeMargin ||
      drone.position.y > env.bounds.maxY - edgeMargin;

    if (nearEdge && fleeMagSq > 400) {
      const cx = (env.bounds.minX + env.bounds.maxX) * 0.5;
      const cy = (env.bounds.minY + env.bounds.maxY) * 0.5;
      const toCenterLen = Math.hypot(cx - drone.position.x, cy - drone.position.y) || 1;
      cornerEscapeX = ((cx - drone.position.x) / toCenterLen) * drone.maxForce * 0.48;
      cornerEscapeY = ((cy - drone.position.y) / toCenterLen) * drone.maxForce * 0.48;
    }

    const totalX =
      primaryX +
      this.scratchEvade.x * this.weights.evade +
      this.scratchFlee.x * this.weights.flee +
      this.scratchSep.x * 0.65 +
      this.scratchAvoid.x * this.weights.obstacleAvoidance +
      cornerEscapeX;

    const totalY =
      primaryY +
      this.scratchEvade.y * this.weights.evade +
      this.scratchFlee.y * this.weights.flee +
      this.scratchSep.y * 0.65 +
      this.scratchAvoid.y * this.weights.obstacleAvoidance +
      cornerEscapeY;

    clampVectorMagnitude(totalX, totalY, drone.maxForce, this.scratchTotalForce);
  }

  private computeDecoySteering(
    drone: IAnswerDroneEntity,
    playerPos: IVector2D,
    protectedPos: IVector2D,
    projectiles: readonly IIncomingProjectile[],
    env: ISteeringEnvironment,
    neighbors: readonly ISteeringAgent[]
  ): void {
    if (drone.patrolWaypoints.length === 0) {
      const centerX = (env.bounds.minX + env.bounds.maxX) * 0.5;
      const centerY = env.bounds.minY + (env.bounds.maxY - env.bounds.minY) * 0.36;
      let decoyIndex = 0;
      let decoyTotal = 0;
      for (let i = 0; i < this.aliveDronesBuffer.length; i += 1) {
        const other = this.aliveDronesBuffer[i];
        if (other.role === 'DECOY') {
          if (other === drone) {
            decoyIndex = decoyTotal;
          }
          decoyTotal += 1;
        }
      }
      drone.patrolWaypoints = buildFormationWaypoints(
        centerX,
        centerY,
        decoyIndex,
        Math.max(1, decoyTotal),
        env.bounds
      );
    }

    patrolAndInterpose(
      drone,
      playerPos,
      protectedPos,
      drone.patrolWaypoints,
      this.elapsedTimeSec,
      this.scratchInterpose
    );
    separation(drone, neighbors, 94, this.scratchSep);
    // Esquive légère seulement (le Leurre reste dans la zone d'action sans fuir à l'autre bout)
    evade(drone, projectiles, 0.34, this.scratchEvade);
    avoidObstacles(drone, env.obstacles, 78, this.scratchAvoid);

    // Légère répulsion de contact uniquement si le joueur fonce littéralement dessus
    flee(drone, playerPos, 82, this.scratchFlee);

    const evadeMagSq =
      this.scratchEvade.x * this.scratchEvade.x + this.scratchEvade.y * this.scratchEvade.y;

    const lineDist = distance2D(playerPos, protectedPos);
    const distToPlayer = distance2D(drone.position, playerPos);
    const distToProtected = distance2D(drone.position, protectedPos);
    const nearFiringLine =
      lineDist > 20 && distToPlayer + distToProtected <= lineDist + 140;

    if (evadeMagSq > 1600) {
      drone.intention = 'evading';
    } else if (nearFiringLine || lineDist < 480) {
      drone.intention = 'interposing';
    } else {
      drone.intention = 'patrolling';
    }

    const totalX =
      this.scratchInterpose.x * this.weights.interpose +
      this.scratchSep.x * this.weights.separation +
      this.scratchEvade.x * 0.45 +
      this.scratchFlee.x * 0.45 +
      this.scratchAvoid.x * this.weights.obstacleAvoidance;

    const totalY =
      this.scratchInterpose.y * this.weights.interpose +
      this.scratchSep.y * this.weights.separation +
      this.scratchEvade.y * 0.45 +
      this.scratchFlee.y * 0.45 +
      this.scratchAvoid.y * this.weights.obstacleAvoidance;

    clampVectorMagnitude(totalX, totalY, drone.maxForce, this.scratchTotalForce);
  }

  private claimBush(bushId: string, agentId: string): void {
    for (let i = 0; i < this.workingBushes.length; i += 1) {
      if (this.workingBushes[i].id === bushId) {
        this.workingBushes[i].occupiedByAgentId = agentId;
        return;
      }
    }
  }

  private refreshBushOccupancy(drone: IAnswerDroneEntity): void {
    let inside = false;
    for (let i = 0; i < this.workingBushes.length; i += 1) {
      const bush = this.workingBushes[i];
      const d = Math.hypot(drone.position.x - bush.x, drone.position.y - bush.y);
      if (d <= bush.radius + drone.radius * 0.25) {
        inside = true;
        bush.occupiedByAgentId = drone.id;
        break;
      }
    }
    drone.isHiddenInBush = inside;
  }
}
