/**
 * Algorithmes vectoriels 2D de Steering Behaviors (Craig Reynolds) optimisés 60 FPS.
 * Conçus sans dépendances DOM/Three.js et sans allocations inutiles dans les boucles chaudes.
 *
 * Référence projet : Brawl Collège — Issue #30 (Agent 6 : AI-BOTS)
 */

export interface IVector2D {
  x: number;
  y: number;
}

export interface IArenaBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ISteeringAgent {
  id: string;
  position: IVector2D;
  velocity: IVector2D;
  radius: number;
  maxSpeed: number;
  maxForce: number;
  /** Orientation courante en radians (lissée lors de integrateSteering) */
  headingRad?: number;
  /** Masse inertielle (défaut 1.0) */
  mass?: number;
  /** Facteur de lissage angulaire en rad/s (défaut 12) */
  angularSmoothing?: number;
}

export interface IObstacleCircle {
  id?: string;
  x: number;
  y: number;
  radius: number;
  kind?: 'wall' | 'desk' | 'pillar' | 'crate';
}

export interface IBushZone {
  id?: string;
  x: number;
  y: number;
  radius: number;
  /** Identifiant de l'agent occupant actuellement le buisson (null/undefined si libre) */
  occupiedByAgentId?: string | null;
  /** Bonus tactique optionnel du buisson (défaut 1.0) */
  coverScore?: number;
}

export interface IIncomingProjectile {
  id?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** Ignoré lors de l'esquive si le projectile appartient au même camp */
  isFriendlyToAgent?: boolean;
  /** Pondération de menace (défaut 1.0) */
  dangerWeight?: number;
}

export interface ISteeringWeights {
  seek: number;
  flee: number;
  arrive: number;
  evade: number;
  hide: number;
  separation: number;
  interpose: number;
  patrol: number;
  obstacleAvoidance: number;
}

export interface ISteeringEnvironment {
  bounds: IArenaBounds;
  obstacles: readonly IObstacleCircle[];
  bushes: readonly IBushZone[];
  neighbors?: readonly ISteeringAgent[];
  timeSec?: number;
}

export interface ICoverSpotResult {
  found: boolean;
  kind: 'BUSH' | 'OBSTACLE' | 'NONE';
  position: IVector2D;
  bushId?: string;
  obstacleId?: string;
  score: number;
}

export interface IRectObstacleInput {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: 'wall' | 'desk' | 'bush' | 'goal_left' | 'goal_right' | 'safe_zone';
  label?: string;
}

export const DEFAULT_ARENA_BOUNDS: IArenaBounds = {
  minX: 28,
  minY: 56,
  maxX: 932,
  maxY: 612,
};

export const DEFAULT_STEERING_WEIGHTS: ISteeringWeights = {
  seek: 1.0,
  flee: 1.35,
  arrive: 1.0,
  evade: 1.85,
  hide: 1.25,
  separation: 1.4,
  interpose: 1.2,
  patrol: 0.85,
  obstacleAvoidance: 1.65,
};

const EPSILON = 1e-6;
const EPSILON_SQ = EPSILON * EPSILON;

// Vecteurs scratch internes pour éviter les allocations en boucle 60 FPS
const scratchDesired: IVector2D = { x: 0, y: 0 };
const scratchSpot: IVector2D = { x: 0, y: 0 };
const scratchWaypoints: IVector2D = { x: 0, y: 0 };
const scratchCoverResult: ICoverSpotResult = {
  found: false,
  kind: 'NONE',
  position: { x: 0, y: 0 },
  score: -Infinity,
};

/**
 * Construit les bornes d'arène à partir des dimensions totales et d'une marge.
 */
export function createArenaBounds(
  width = 960,
  height = 640,
  marginX = 28,
  marginTop = 56,
  marginBottom = 28
): IArenaBounds {
  return {
    minX: marginX,
    minY: marginTop,
    maxX: Math.max(marginX + 40, width - marginX),
    maxY: Math.max(marginTop + 40, height - marginBottom),
  };
}

/**
 * Convertit des obstacles rectangulaires (format IsometricRenderer / GameEngine)
 * en cercles d'obstacles et zones de buissons exploitables par le moteur de steering.
 */
export function convertRectObstaclesToSteering(
  rects: readonly IRectObstacleInput[]
): { obstacles: IObstacleCircle[]; bushes: IBushZone[] } {
  const obstacles: IObstacleCircle[] = [];
  const bushes: IBushZone[] = [];

  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    if (r.kind === 'bush') {
      bushes.push({
        id: `bush_${i}`,
        x: r.x + r.width * 0.5,
        y: r.y + r.height * 0.5,
        radius: Math.max(r.width, r.height) * 0.5,
      });
      continue;
    }

    if (r.kind !== 'wall' && r.kind !== 'desk') {
      continue;
    }

    const kind = r.kind === 'desk' ? 'desk' : 'wall';
    const minDim = Math.max(10, Math.min(r.width, r.height));
    const maxDim = Math.max(r.width, r.height);
    const radius = minDim * 0.5;
    const count = Math.max(1, Math.round(maxDim / minDim));

    if (count === 1) {
      obstacles.push({
        id: `${kind}_${i}_0`,
        x: r.x + r.width * 0.5,
        y: r.y + r.height * 0.5,
        radius,
        kind,
      });
    } else if (r.width >= r.height) {
      const span = Math.max(0, r.width - minDim);
      for (let k = 0; k < count; k += 1) {
        const t = count > 1 ? k / (count - 1) : 0.5;
        obstacles.push({
          id: `${kind}_${i}_${k}`,
          x: r.x + radius + span * t,
          y: r.y + r.height * 0.5,
          radius,
          kind,
        });
      }
    } else {
      const span = Math.max(0, r.height - minDim);
      for (let k = 0; k < count; k += 1) {
        const t = count > 1 ? k / (count - 1) : 0.5;
        obstacles.push({
          id: `${kind}_${i}_${k}`,
          x: r.x + r.width * 0.5,
          y: r.y + radius + span * t,
          radius,
          kind,
        });
      }
    }
  }

  return { obstacles, bushes };
}

export function clampScalar(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function normalizeAngleRad(angleRad: number): number {
  let a = angleRad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

export function lerpAngleRad(currentRad: number, targetRad: number, alpha: number): number {
  const diff = normalizeAngleRad(targetRad - currentRad);
  return normalizeAngleRad(currentRad + diff * clampScalar(alpha, 0, 1));
}

export function clampVectorMagnitude(
  x: number,
  y: number,
  maxMagnitude: number,
  out: IVector2D = { x: 0, y: 0 }
): IVector2D {
  if (maxMagnitude <= 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const magSq = x * x + y * y;
  if (magSq > maxMagnitude * maxMagnitude && magSq > EPSILON_SQ) {
    const scale = maxMagnitude / Math.sqrt(magSq);
    out.x = x * scale;
    out.y = y * scale;
  } else {
    out.x = x;
    out.y = y;
  }
  return out;
}

export function distanceSq2D(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function distance2D(a: IVector2D, b: IVector2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Teste si le segment [A, B] intersecte le cercle (cx, cy, radius).
 * Utilisé pour la vérification d'abri derrière obstacle et de ligne de tir.
 */
export function segmentIntersectsCircle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  radius: number
): boolean {
  const abx = bx - ax;
  const aby = by - ay;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq <= EPSILON_SQ) {
    return distanceSq2D(ax, ay, cx, cy) <= radius * radius;
  }
  const t = clampScalar(((cx - ax) * abx + (cy - ay) * aby) / abLenSq, 0, 1);
  const px = ax + abx * t;
  const py = ay + aby * t;
  return distanceSq2D(px, py, cx, cy) <= radius * radius;
}

/**
 * Vérifie si la ligne de tir entre two points est dégagée d'obstacles solides.
 */
export function hasLineOfSight(
  fromPos: IVector2D,
  toPos: IVector2D,
  obstacles: readonly IObstacleCircle[],
  clearancePadding = 2
): boolean {
  for (let i = 0; i < obstacles.length; i += 1) {
    const obs = obstacles[i];
    if (
      segmentIntersectsCircle(
        fromPos.x,
        fromPos.y,
        toPos.x,
        toPos.y,
        obs.x,
        obs.y,
        obs.radius + clearancePadding
      )
    ) {
      return false;
    }
  }
  return true;
}

function hashAgentAngle(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 360) * (Math.PI / 180);
}

/**
 * Seek (Poursuite) : accélère au maximum vers targetPos.
 */
export function seek(
  agent: ISteeringAgent,
  targetPos: IVector2D,
  out: IVector2D = { x: 0, y: 0 }
): IVector2D {
  const dx = targetPos.x - agent.position.x;
  const dy = targetPos.y - agent.position.y;
  const distSq = dx * dx + dy * dy;

  if (distSq <= EPSILON_SQ || agent.maxSpeed <= 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }

  const invDist = 1 / Math.sqrt(distSq);
  const desiredX = dx * invDist * agent.maxSpeed;
  const desiredY = dy * invDist * agent.maxSpeed;

  return clampVectorMagnitude(
    desiredX - agent.velocity.x,
    desiredY - agent.velocity.y,
    agent.maxForce,
    out
  );
}

/**
 * Flee (Fuite) : s'éloigne de threatPos si la menace est dans panicRadius.
 */
export function flee(
  agent: ISteeringAgent,
  threatPos: IVector2D,
  panicRadius = 260,
  out: IVector2D = { x: 0, y: 0 }
): IVector2D {
  const dx = agent.position.x - threatPos.x;
  const dy = agent.position.y - threatPos.y;
  const distSq = dx * dx + dy * dy;

  if (panicRadius > 0 && distSq > panicRadius * panicRadius) {
    out.x = 0;
    out.y = 0;
    return out;
  }

  if (agent.maxSpeed <= 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }

  let dirX: number;
  let dirY: number;
  let dist = 0;

  if (distSq <= EPSILON_SQ) {
    const fallbackAngle = agent.headingRad ?? hashAgentAngle(agent.id);
    dirX = Math.cos(fallbackAngle);
    dirY = Math.sin(fallbackAngle);
  } else {
    dist = Math.sqrt(distSq);
    dirX = dx / dist;
    dirY = dy / dist;
  }

  // Adoucissement sur les 20% externes du rayon de panique pour éviter les oscillations de bord
  let urgency = 1;
  if (panicRadius > 0) {
    const softEdge = panicRadius * 0.8;
    if (dist > softEdge) {
      urgency = clampScalar((panicRadius - dist) / (panicRadius - softEdge), 0.15, 1);
    }
  }

  const desiredX = dirX * agent.maxSpeed * urgency;
  const desiredY = dirY * agent.maxSpeed * urgency;

  return clampVectorMagnitude(
    desiredX - agent.velocity.x,
    desiredY - agent.velocity.y,
    agent.maxForce,
    out
  );
}

/**
 * Arrive (Arrivée douce) : ralentit progressivement à l'intérieur de slowingRadius.
 */
export function arrive(
  agent: ISteeringAgent,
  targetPos: IVector2D,
  slowingRadius = 110,
  out: IVector2D = { x: 0, y: 0 }
): IVector2D {
  const dx = targetPos.x - agent.position.x;
  const dy = targetPos.y - agent.position.y;
  const distSq = dx * dx + dy * dy;

  if (distSq <= 1e-4 || agent.maxSpeed <= 0) {
    return clampVectorMagnitude(-agent.velocity.x, -agent.velocity.y, agent.maxForce, out);
  }

  const dist = Math.sqrt(distSq);
  const safeSlowRadius = Math.max(1, slowingRadius);
  const rampedSpeed = agent.maxSpeed * (dist / safeSlowRadius);
  const clippedSpeed = Math.min(rampedSpeed, agent.maxSpeed);

  const desiredX = (dx / dist) * clippedSpeed;
  const desiredY = (dy / dist) * clippedSpeed;

  return clampVectorMagnitude(
    desiredX - agent.velocity.x,
    desiredY - agent.velocity.y,
    agent.maxForce,
    out
  );
}

/**
 * Evade (Esquive de projectiles) :
 * Prédiction linéaire de la trajectoire de chaque projectile entrant sur [0, lookaheadSec]
 * et calcul d'une esquive orthogonale vers le côté le plus sûr.
 */
export function evade(
  agent: ISteeringAgent,
  projectiles: readonly IIncomingProjectile[],
  lookaheadSec = 0.55,
  out: IVector2D = { x: 0, y: 0 }
): IVector2D {
  if (projectiles.length === 0 || lookaheadSec <= 0 || agent.maxSpeed <= 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }

  let accumX = 0;
  let accumY = 0;
  let totalWeight = 0;

  for (let i = 0; i < projectiles.length; i += 1) {
    const p = projectiles[i];
    if (p.isFriendlyToAgent) continue;

    const pSpeedSq = p.vx * p.vx + p.vy * p.vy;
    if (pSpeedSq <= EPSILON_SQ) continue;

    const rx = agent.position.x - p.x;
    const ry = agent.position.y - p.y;
    const forwardDot = rx * p.vx + ry * p.vy;
    const safetyRadius = agent.radius + p.radius + 28;

    // Ignorer un projectile déjà passé qui s'éloigne (sauf chevauchement immédiat)
    if (forwardDot < 0 && rx * rx + ry * ry > safetyRadius * safetyRadius) {
      continue;
    }

    const tClosest = clampScalar(forwardDot / pSpeedSq, 0, lookaheadSec);
    const closestX = p.x + p.vx * tClosest;
    const closestY = p.y + p.vy * tClosest;

    const offsetX = agent.position.x - closestX;
    const offsetY = agent.position.y - closestY;
    const missDistSq = offsetX * offsetX + offsetY * offsetY;

    if (missDistSq >= safetyRadius * safetyRadius) {
      continue;
    }

    const missDist = Math.sqrt(missDistSq);
    const pSpeed = Math.sqrt(pSpeedSq);
    const ux = p.vx / pSpeed;
    const uy = p.vy / pSpeed;

    // Normale orthogonale (-uy, ux) à la trajectoire du projectile
    const orthoX = -uy;
    const orthoY = ux;
    const sideProjection = rx * orthoX + ry * orthoY;

    // Choisir le côté orthogonal qui éloigne de l'axe de tir
    let sign = sideProjection >= 0 ? 1 : -1;
    if (Math.abs(sideProjection) < 1e-2) {
      sign = Math.cos(hashAgentAngle(agent.id)) >= 0 ? 1 : -1;
    }

    const timeUrgency = 1 - (tClosest / lookaheadSec) * 0.55;
    const distUrgency = 1 - missDist / safetyRadius;
    const weight = Math.max(0.15, timeUrgency * distUrgency) * (p.dangerWeight ?? 1);

    // Légère composante de recul si le projectile est quasi sur l'agent
    const dodgeX = orthoX * sign - ux * 0.18;
    const dodgeY = orthoY * sign - uy * 0.18;
    const dodgeLen = Math.hypot(dodgeX, dodgeY) || 1;

    accumX += (dodgeX / dodgeLen) * weight;
    accumY += (dodgeY / dodgeLen) * weight;
    totalWeight += weight;
  }

  if (totalWeight <= EPSILON) {
    out.x = 0;
    out.y = 0;
    return out;
  }

  const accumLenSq = accumX * accumX + accumY * accumY;
  if (accumLenSq <= EPSILON_SQ) {
    out.x = 0;
    out.y = 0;
    return out;
  }

  const invLen = 1 / Math.sqrt(accumLenSq);
  const desiredX = accumX * invLen * agent.maxSpeed;
  const desiredY = accumY * invLen * agent.maxSpeed;

  return clampVectorMagnitude(
    desiredX - agent.velocity.x,
    desiredY - agent.velocity.y,
    agent.maxForce,
    out
  );
}

/**
 * Évalue et identifie le meilleur point d'abri :
 * - point d'ombre derrière un obstacle (par rapport à threatPos)
 * - ou buisson IBushZone libre pondéré par proximité et sécurité.
 */
export function findBestCoverSpot(
  agent: ISteeringAgent,
  threatPos: IVector2D,
  obstacles: readonly IObstacleCircle[],
  bushes: readonly IBushZone[],
  standoffDist = 42,
  bounds?: IArenaBounds,
  out: ICoverSpotResult = {
    found: false,
    kind: 'NONE',
    position: { x: 0, y: 0 },
    score: -Infinity,
  }
): ICoverSpotResult {
  out.found = false;
  out.kind = 'NONE';
  out.score = -Infinity;
  out.bushId = undefined;
  out.obstacleId = undefined;

  const minX = bounds ? bounds.minX + agent.radius + 6 : -Infinity;
  const maxX = bounds ? bounds.maxX - agent.radius - 6 : Infinity;
  const minY = bounds ? bounds.minY + agent.radius + 6 : -Infinity;
  const maxY = bounds ? bounds.maxY - agent.radius - 6 : Infinity;

  // 1. Points d'ombre derrière chaque obstacle
  for (let i = 0; i < obstacles.length; i += 1) {
    const obs = obstacles[i];
    const tx = obs.x - threatPos.x;
    const ty = obs.y - threatPos.y;
    const tDistSq = tx * tx + ty * ty;
    if (tDistSq <= EPSILON_SQ) continue;

    const tDist = Math.sqrt(tDistSq);
    const ux = tx / tDist;
    const uy = ty / tDist;
    const hideDist = obs.radius + agent.radius + standoffDist;

    let spotX = obs.x + ux * hideDist;
    let spotY = obs.y + uy * hideDist;

    let outOfBoundsPenalty = 0;
    if (spotX < minX || spotX > maxX || spotY < minY || spotY > maxY) {
      spotX = clampScalar(spotX, minX, maxX);
      spotY = clampScalar(spotY, minY, maxY);
      outOfBoundsPenalty = 160;
    }

    // Vérifier que le spot reste bien occulté par l'obstacle
    const blockedByObs = segmentIntersectsCircle(
      threatPos.x,
      threatPos.y,
      spotX,
      spotY,
      obs.x,
      obs.y,
      obs.radius
    );

    const agentDist = Math.hypot(spotX - agent.position.x, spotY - agent.position.y);
    const threatSpotDist = Math.hypot(spotX - threatPos.x, spotY - threatPos.y);
    const coverBonus = (blockedByObs ? 140 : 20) + obs.radius * 1.4;
    const score =
      coverBonus + Math.min(260, threatSpotDist * 0.45) - agentDist * 0.72 - outOfBoundsPenalty;

    if (score > out.score) {
      out.found = true;
      out.kind = 'OBSTACLE';
      out.position.x = spotX;
      out.position.y = spotY;
      out.obstacleId = obs.id ?? `obs_${i}`;
      out.bushId = undefined;
      out.score = score;
    }
  }

  // 2. Buissons libres (IBushZone)
  for (let i = 0; i < bushes.length; i += 1) {
    const bush = bushes[i];
    if (bush.occupiedByAgentId && bush.occupiedByAgentId !== agent.id) {
      continue;
    }

    const spotX = clampScalar(bush.x, minX, maxX);
    const spotY = clampScalar(bush.y, minY, maxY);
    const agentDist = Math.hypot(spotX - agent.position.x, spotY - agent.position.y);
    const threatDist = Math.hypot(spotX - threatPos.x, spotY - threatPos.y);

    // Un buisson avec la menace juste dedans ou collée perd fortement son intérêt furtif
    const compromisedPenalty = threatDist < bush.radius + 95 ? 280 : 0;
    const stealthBonus = 185 * (bush.coverScore ?? 1) + Math.min(240, threatDist * 0.42);
    const score = stealthBonus - agentDist * 0.68 - compromisedPenalty;

    if (score > out.score) {
      out.found = true;
      out.kind = 'BUSH';
      out.position.x = spotX;
      out.position.y = spotY;
      out.bushId = bush.id ?? `bush_${i}`;
      out.obstacleId = undefined;
      out.score = score;
    }
  }

  return out;
}

/**
 * HideBehindWalls : calcule le meilleur abri (ombre de mur ou buisson libre)
 * et dirige l'agent vers ce point via Arrive.
 */
export function hideBehindWalls(
  agent: ISteeringAgent,
  threatPos: IVector2D,
  obstacles: readonly IObstacleCircle[],
  bushes: readonly IBushZone[],
  standoffDist = 42,
  out: IVector2D = { x: 0, y: 0 },
  bounds?: IArenaBounds
): IVector2D {
  const cover = findBestCoverSpot(
    agent,
    threatPos,
    obstacles,
    bushes,
    standoffDist,
    bounds,
    scratchCoverResult
  );

  if (!cover.found) {
    return flee(agent, threatPos, 320, out);
  }

  return arrive(agent, cover.position, 72, out);
}

/**
 * Separation (Séparation de groupe) : repousse les voisins trop proches.
 */
export function separation(
  agent: ISteeringAgent,
  neighbors: readonly ISteeringAgent[],
  separationRadius = 85,
  out: IVector2D = { x: 0, y: 0 }
): IVector2D {
  if (neighbors.length === 0 || agent.maxSpeed <= 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }

  let pushX = 0;
  let pushY = 0;
  let count = 0;

  for (let i = 0; i < neighbors.length; i += 1) {
    const other = neighbors[i];
    if (other.id === agent.id) continue;

    const effectiveRadius = Math.max(separationRadius, agent.radius + other.radius + 10);
    const dx = agent.position.x - other.position.x;
    const dy = agent.position.y - other.position.y;
    const distSq = dx * dx + dy * dy;

    if (distSq >= effectiveRadius * effectiveRadius) continue;

    count += 1;
    if (distSq <= EPSILON_SQ) {
      const angle = hashAgentAngle(`${agent.id}_${other.id}`);
      pushX += Math.cos(angle);
      pushY += Math.sin(angle);
    } else {
      const dist = Math.sqrt(distSq);
      const strength = (effectiveRadius - dist) / effectiveRadius;
      pushX += (dx / dist) * (0.4 + strength * 1.4);
      pushY += (dy / dist) * (0.4 + strength * 1.4);
    }
  }

  if (count === 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }

  const pushLenSq = pushX * pushX + pushY * pushY;
  if (pushLenSq <= EPSILON_SQ) {
    out.x = 0;
    out.y = 0;
    return out;
  }

  const invLen = 1 / Math.sqrt(pushLenSq);
  const desiredX = pushX * invLen * agent.maxSpeed;
  const desiredY = pushY * invLen * agent.maxSpeed;

  return clampVectorMagnitude(
    desiredX - agent.velocity.x,
    desiredY - agent.velocity.y,
    agent.maxForce,
    out
  );
}

/**
 * PatrolAndInterpose :
 * Combine la patrouille sur waypoints avec l'interposition dynamique sur la ligne de tir
 * entre playerPos et protectedPos (ex: un Leurre protégeant le Tacticien).
 */
export function patrolAndInterpose(
  agent: ISteeringAgent,
  playerPos: IVector2D,
  protectedPos: IVector2D,
  waypoints: readonly IVector2D[],
  timeSec: number,
  out: IVector2D = { x: 0, y: 0 }
): IVector2D {
  if (agent.maxSpeed <= 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }

  const lineX = playerPos.x - protectedPos.x;
  const lineY = playerPos.y - protectedPos.y;
  const lineDistSq = lineX * lineX + lineY * lineY;
  const lineDist = Math.sqrt(lineDistSq);

  // Point d'interposition devant la cible protégée sur l'axe vers le joueur
  let interposeX = protectedPos.x;
  let interposeY = protectedPos.y;

  if (lineDist > 1e-3) {
    const ux = lineX / lineDist;
    const uy = lineY / lineDist;
    const blockDist = clampScalar(lineDist * 0.42, Math.min(72, lineDist * 0.5), 175);
    const phase = hashAgentAngle(agent.id);
    const weaveOffset = Math.sin(timeSec * 2.4 + phase) * 34;

    interposeX = protectedPos.x + ux * blockDist + -uy * weaveOffset;
    interposeY = protectedPos.y + uy * blockDist + ux * weaveOffset;
  } else {
    const angle = timeSec * 1.8 + hashAgentAngle(agent.id);
    interposeX = protectedPos.x + Math.cos(angle) * 90;
    interposeY = protectedPos.y + Math.sin(angle) * 90;
  }

  if (waypoints.length > 0) {
    const segmentDuration = 2.6;
    const totalTime = Math.max(0, timeSec);
    const wpIndex = Math.floor(totalTime / segmentDuration) % waypoints.length;
    const nextWpIndex = (wpIndex + 1) % waypoints.length;
    const frac = (totalTime % segmentDuration) / segmentDuration;
    const wpA = waypoints[wpIndex];
    const wpB = waypoints[nextWpIndex];

    scratchWaypoints.x = wpA.x + (wpB.x - wpA.x) * frac;
    scratchWaypoints.y = wpA.y + (wpB.y - wpA.y) * frac;

    // Plus le joueur menace la cible protégée, plus l'interposition prend le dessus sur la patrouille
    const interposeBlend = lineDist < 480 ? 0.72 : 0.45;
    scratchSpot.x = interposeX * interposeBlend + scratchWaypoints.x * (1 - interposeBlend);
    scratchSpot.y = interposeY * interposeBlend + scratchWaypoints.y * (1 - interposeBlend);
  } else {
    scratchSpot.x = interposeX;
    scratchSpot.y = interposeY;
  }

  return arrive(agent, scratchSpot, 78, out);
}

/**
 * Évitement préventif des obstacles circulaires sur la trajectoire de l'agent.
 */
export function avoidObstacles(
  agent: ISteeringAgent,
  obstacles: readonly IObstacleCircle[],
  lookaheadDist = 85,
  out: IVector2D = { x: 0, y: 0 }
): IVector2D {
  out.x = 0;
  out.y = 0;
  if (obstacles.length === 0 || agent.maxSpeed <= 0) {
    return out;
  }

  const speed = Math.hypot(agent.velocity.x, agent.velocity.y);
  let dirX: number;
  let dirY: number;
  if (speed > 4) {
    dirX = agent.velocity.x / speed;
    dirY = agent.velocity.y / speed;
  } else {
    const angle = agent.headingRad ?? 0;
    dirX = Math.cos(angle);
    dirY = Math.sin(angle);
  }

  const dynamicLookahead = Math.max(
    agent.radius * 2,
    lookaheadDist * clampScalar(speed / agent.maxSpeed, 0.35, 1.15)
  );
  const feelerX = agent.position.x + dirX * dynamicLookahead;
  const feelerY = agent.position.y + dirY * dynamicLookahead;

  let steerX = 0;
  let steerY = 0;
  let nearestThreatDist = Infinity;

  for (let i = 0; i < obstacles.length; i += 1) {
    const obs = obstacles[i];
    const safeR = obs.radius + agent.radius + 14;

    if (
      !segmentIntersectsCircle(
        agent.position.x,
        agent.position.y,
        feelerX,
        feelerY,
        obs.x,
        obs.y,
        safeR
      )
    ) {
      continue;
    }

    const dx = agent.position.x - obs.x;
    const dy = agent.position.y - obs.y;
    const dist = Math.hypot(dx, dy);
    if (dist < nearestThreatDist) {
      nearestThreatDist = dist;

      // Combine répulsion radiale + déviation latérale pour contourner l'obstacle sans rester bloqué
      const nx = dist > EPSILON ? dx / dist : -dirY;
      const ny = dist > EPSILON ? dy / dist : dirX;
      const cross = dirX * (obs.y - agent.position.y) - dirY * (obs.x - agent.position.x);
      const tangentSign = cross >= 0 ? -1 : 1;
      const tx = -dirY * tangentSign;
      const ty = dirX * tangentSign;

      const urgency = clampScalar(1.35 - dist / (safeR + dynamicLookahead), 0.35, 1.5);
      steerX = (nx * 0.55 + tx * 0.85) * agent.maxSpeed * urgency;
      steerY = (ny * 0.55 + ty * 0.85) * agent.maxSpeed * urgency;
    }
  }

  if (!Number.isFinite(nearestThreatDist)) {
    return out;
  }

  return clampVectorMagnitude(
    steerX - agent.velocity.x * 0.35,
    steerY - agent.velocity.y * 0.35,
    agent.maxForce,
    out
  );
}

/**
 * Résout les pénétrations physiques d'un agent dans les obstacles circulaires et les bornes.
 */
export function resolveObstacleCollisions(
  agent: ISteeringAgent,
  obstacles: readonly IObstacleCircle[],
  bounds?: IArenaBounds
): void {
  for (let i = 0; i < obstacles.length; i += 1) {
    const obs = obstacles[i];
    const minDist = obs.radius + agent.radius;
    const dx = agent.position.x - obs.x;
    const dy = agent.position.y - obs.y;
    const distSq = dx * dx + dy * dy;

    if (distSq >= minDist * minDist) continue;

    const dist = Math.sqrt(distSq);
    const nx = dist > EPSILON ? dx / dist : 1;
    const ny = dist > EPSILON ? dy / dist : 0;

    agent.position.x = obs.x + nx * minDist;
    agent.position.y = obs.y + ny * minDist;

    // Annuler uniquement la composante de vitesse entrant dans l'obstacle (glissade fluide)
    const vn = agent.velocity.x * nx + agent.velocity.y * ny;
    if (vn < 0) {
      agent.velocity.x -= vn * nx;
      agent.velocity.y -= vn * ny;
    }
  }

  if (bounds) {
    const minX = bounds.minX + agent.radius;
    const maxX = Math.max(minX, bounds.maxX - agent.radius);
    const minY = bounds.minY + agent.radius;
    const maxY = Math.max(minY, bounds.maxY - agent.radius);

    if (agent.position.x < minX) {
      agent.position.x = minX;
      if (agent.velocity.x < 0) agent.velocity.x = 0;
    } else if (agent.position.x > maxX) {
      agent.position.x = maxX;
      if (agent.velocity.x > 0) agent.velocity.x = 0;
    }

    if (agent.position.y < minY) {
      agent.position.y = minY;
      if (agent.velocity.y < 0) agent.velocity.y = 0;
    } else if (agent.position.y > maxY) {
      agent.position.y = maxY;
      if (agent.velocity.y > 0) agent.velocity.y = 0;
    }
  }
}

/**
 * Intègre la force de steering sur dtSec, borne la vitesse/position et lisse headingRad.
 */
export function integrateSteering(
  agent: ISteeringAgent,
  steeringForce: IVector2D,
  dtSec: number,
  bounds?: IArenaBounds
): IVector2D {
  const dt = clampScalar(dtSec, 0, 0.05);
  if (dt <= 0) {
    return agent.position;
  }

  const mass = Math.max(0.1, agent.mass ?? 1);
  clampVectorMagnitude(steeringForce.x, steeringForce.y, agent.maxForce, scratchDesired);

  const nextVx = agent.velocity.x + (scratchDesired.x / mass) * dt;
  const nextVy = agent.velocity.y + (scratchDesired.y / mass) * dt;
  clampVectorMagnitude(nextVx, nextVy, agent.maxSpeed, agent.velocity);

  agent.position.x += agent.velocity.x * dt;
  agent.position.y += agent.velocity.y * dt;

  if (bounds) {
    const minX = bounds.minX + agent.radius;
    const maxX = Math.max(minX, bounds.maxX - agent.radius);
    const minY = bounds.minY + agent.radius;
    const maxY = Math.max(minY, bounds.maxY - agent.radius);

    if (agent.position.x < minX) {
      agent.position.x = minX;
      if (agent.velocity.x < 0) agent.velocity.x = 0;
    } else if (agent.position.x > maxX) {
      agent.position.x = maxX;
      if (agent.velocity.x > 0) agent.velocity.x = 0;
    }

    if (agent.position.y < minY) {
      agent.position.y = minY;
      if (agent.velocity.y < 0) agent.velocity.y = 0;
    } else if (agent.position.y > maxY) {
      agent.position.y = maxY;
      if (agent.velocity.y > 0) agent.velocity.y = 0;
    }
  }

  const speedSq = agent.velocity.x * agent.velocity.x + agent.velocity.y * agent.velocity.y;
  if (speedSq > 25) {
    const targetHeading = Math.atan2(agent.velocity.y, agent.velocity.x);
    const currentHeading = agent.headingRad ?? targetHeading;
    const smoothRate = Math.max(1, agent.angularSmoothing ?? 12);
    const alpha = 1 - Math.exp(-smoothRate * dt);
    agent.headingRad = lerpAngleRad(currentHeading, targetHeading, alpha);
  } else if (agent.headingRad === undefined) {
    agent.headingRad = 0;
  }

  return agent.position;
}
