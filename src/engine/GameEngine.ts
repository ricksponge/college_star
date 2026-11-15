import type {
  IAccessibilitySettings,
  IBrawler,
  ICombatImpactResult,
  IGameMode,
  IQuestion,
} from '../types/cctp';
import {
  computeCombatImpact,
  ERROR_PENALTY_COOLDOWN_MS,
  ERROR_SHIELD_DURATION_MS,
  REFLEX_BONUS_THRESHOLD_MS,
} from './CombatMath';
import {
  IsometricRenderer,
  type IRenderFlashBubble,
  type IRenderObstacle,
  type IRenderProjectile,
  type IRenderVec2,
} from './IsometricRenderer';
import { createModeSession, type ModeSession } from '../modes/ModesRegistry';
import { ChasseNotesSession } from '../modes/Mode1ChasseNotes';
import { MatchAccordsSession } from '../modes/Mode2MatchAccords';
import { InterroSurpriseSession } from '../modes/Mode3InterroSurprise';
import { ChangementSalleSession } from '../modes/Mode4ChangementSalle';
import { ConseilClasseSession } from '../modes/Mode5ConseilClasse';
import { soundManager } from '../services/SoundManager';
import { SuperSystem, type ITargetEntity } from './SuperSystem';
import { TwinStickController } from './TwinStickController';

export interface IHitTelemetryEvent {
  question: IQuestion;
  isCorrect: boolean;
  reactionTimeMs: number;
  impact: ICombatImpactResult;
}

export interface IGameEngineHudSnapshot {
  remainingSeconds: number;
  objectiveScore: number;
  hp: number;
  maxHp: number;
  ammoBars: number;
  superGaugePct: number;
  gadgetCharges: number;
  comboMultiplier: number;
  hudPrompt: string;
  lastDamageDealt: number;
}

export interface IMatchSummary {
  modeId: IGameMode['id'];
  brawlerId: IBrawler['id'];
  victory: boolean;
  objectiveScore: number;
  correctHits: number;
  totalShotsHit: number;
  starsEarned: number;
  durationPlayedSec: number;
  missedQuestions: IQuestion[];
  fastReflexHits: number;
}

export interface IGameEngineOptions {
  canvas: HTMLCanvasElement;
  brawler: IBrawler;
  mode: IGameMode;
  brawlerLevel?: number;
  targetSpeedMultiplier?: number;
  accessibility?: IAccessibilitySettings;
  requestNextQuestion: () => IQuestion;
  onHitTelemetry?: (event: IHitTelemetryEvent) => void;
  onHudStateChange?: (hud: IGameEngineHudSnapshot) => void;
  onMatchFinished?: (summary: IMatchSummary) => void;
}

interface IActiveProjectile extends IRenderProjectile {
  distanceTraveled: number;
  maxRange: number;
  isRebounding: boolean;
  hitTargetIds: Set<string>;
}

interface IInkPuddle {
  x: number;
  y: number;
  radius: number;
  remainingMs: number;
  tickMs: number;
}

interface IRivalBotState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  respawnMs: number;
  actionCooldownMs: number;
  label: string;
}

const ARENA_WIDTH = 960;
const ARENA_HEIGHT = 640;
const PLAYER_RADIUS = 20;

/**
 * Moteur de combat 60 FPS en vue isométrique 50° reliant :
 * - IsometricRenderer (#5)
 * - TwinStickController & CombatMath (#1)
 * - SuperSystem (#2)
 * - Roster des 4 Héros (#8)
 * - Les 5 Modes d'arène (#11-#15)
 */
export class GameEngine {
  private readonly renderer: IsometricRenderer;
  private readonly controller: TwinStickController;
  private readonly superSystem: SuperSystem;
  private readonly modeSession: ModeSession;
  private readonly brawler: IBrawler;
  private readonly mode: IGameMode;
  private readonly brawlerLevel: number;
  private targetSpeedMultiplier: number;
  private readonly accessibility: IAccessibilitySettings;
  private readonly requestNextQuestion: () => IQuestion;
  private readonly onHitTelemetry?: (event: IHitTelemetryEvent) => void;
  private readonly onHudStateChange?: (hud: IGameEngineHudSnapshot) => void;
  private readonly onMatchFinished?: (summary: IMatchSummary) => void;

  private rafId: number | null = null;
  private lastTimestamp = 0;
  private running = false;
  private finished = false;
  private forceVictory = false;

  private playerX = ARENA_WIDTH * 0.5;
  private playerY = ARENA_HEIGHT * 0.82;
  private playerHp: number;
  private respawnRemainingMs = 0;
  private isPlayerStealthed = false;
  private ammoBars = 3;
  private shieldHp = 0;
  private errorShieldRemainingMs = 0;
  private penaltyCooldownMs = 0;
  private laserHitCooldownMs = 0;
  private safeCorridorBoostCooldownMs = 0;
  private consecutiveCorrectHits = 0;
  private comboMultiplier = 1.0;

  private remainingSeconds: number;
  private objectiveScore = 0;
  private correctHits = 0;
  private fastReflexHits = 0;
  private totalShotsHit = 0;
  private lastDamageDealt = 0;
  private lastErrorPenaltyDamage = 0;
  private breathingTipShown = false;

  private currentQuestion!: IQuestion;
  private questionShownAtMs = 0;
  private hasFailedCurrentWave = false;
  private waveTelemetryRecorded = false;
  private currentHintText: string | null = null;
  private autoHintTriggeredForWave = false;
  private readonly missedQuestionsMap = new Map<string, IQuestion>();

  private targets: ITargetEntity[] = [];
  private readonly targetHitFlashMs = new Map<string, number>();
  private projectiles: IActiveProjectile[] = [];
  private inkPuddles: IInkPuddle[] = [];
  private obstacles: IRenderObstacle[] = [];
  private floatingBubbles: IRenderFlashBubble[] = [];

  private turretPos: IRenderVec2 | null = null;
  private turretRemainingMs = 0;
  private compassTargetPos: IRenderVec2 | null = null;
  private autoCompassPos: IRenderVec2 | null = null;
  private compassRemainingMs = 0;
  private shakeIntensity = 0;
  private lastKnownMaxHp: number;

  private rivalBot: IRivalBotState | null = null;

  constructor(options: IGameEngineOptions) {
    this.renderer = new IsometricRenderer(options.canvas);
    this.superSystem = new SuperSystem();
    this.brawler = options.brawler;
    this.mode = options.mode;
    this.brawlerLevel = Math.max(1, options.brawlerLevel ?? 1);
    this.targetSpeedMultiplier = options.targetSpeedMultiplier ?? 1.0;
    this.accessibility = {
      smart_auto_aim: options.accessibility?.smart_auto_aim ?? true,
      visual_gps_compass: options.accessibility?.visual_gps_compass ?? true,
      calm_mode: options.accessibility?.calm_mode ?? false,
      auto_hint_assist: options.accessibility?.auto_hint_assist ?? true,
      onboarding_seen: options.accessibility?.onboarding_seen ?? true,
    };
    this.requestNextQuestion = options.requestNextQuestion;
    this.onHitTelemetry = options.onHitTelemetry;
    this.onHudStateChange = options.onHudStateChange;
    this.onMatchFinished = options.onMatchFinished;

    this.modeSession = createModeSession(this.mode.id);
    this.lastKnownMaxHp = this.computePlayerMaxHp();
    this.playerHp = this.lastKnownMaxHp;
    this.remainingSeconds = this.mode.duration_seconds;

    this.controller = new TwinStickController(
      options.canvas,
      (sx, sy) => this.renderer.screenToWorld(sx, sy),
      () => ({ x: this.playerX, y: this.playerY }),
      (sx, sy) => this.findTargetAtScreenPos(sx, sy)
    );

    this.setupModeObstacles();
    this.initRivalBotIfNeeded();
  }

  public setTargetSpeedMultiplier(multiplier: number): void {
    this.targetSpeedMultiplier = Math.max(0.65, Math.min(1.65, multiplier));
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.renderer.resizeToContainer();
    this.controller.attach();
    this.superSystem.resetForMatch(3);
    this.spawnNextQuestionWave();
    this.errorShieldRemainingMs = 2200;

    const introMsg =
      this.mode.id === 'CHASSE_AUX_BONNES_NOTES'
        ? '🎯 Tire sur la bonne gemme pour collecter les cristaux !'
        : this.mode.id === 'MATCH_DES_ACCORDS'
          ? '⚽ Pousse le ballon dans la cage de la bonne réponse !'
          : this.mode.id === 'INTERRO_SURPRISE'
            ? '🎯 Tire sur la bonne réponse et reste dans la cour !'
            : this.mode.id === 'CHANGEMENT_DE_SALLE'
              ? '🏫 Rejoins la bonne salle de cours pour la capturer !'
              : '🎯 Esquive le laser dans le couloir vert et vise juste !';
    this.pushBubble(introMsg, this.playerX, this.playerY, 2400, true);

    window.addEventListener('resize', this.handleResize);
    this.lastTimestamp = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.controller.detach();
    this.renderer.dispose();
    window.removeEventListener('resize', this.handleResize);
  }

  public triggerSuperFromUI(): void {
    this.controller.requestSuper();
  }

  public triggerGadgetFromUI(): void {
    this.controller.requestGadget();
  }

  public triggerFreeHintFromUI(): void {
    if (this.finished) return;
    this.activateWaveHint(true);
  }

  private readonly handleResize = (): void => {
    this.renderer.resizeToContainer();
  };

  private computePlayerMaxHp(): number {
    const scaled = Math.round(this.brawler.base_hp * (1 + 0.08 * (this.brawlerLevel - 1)));
    const hpBonus =
      this.modeSession instanceof InterroSurpriseSession
        ? this.modeSession.getState().hpBonus
        : 0;
    return scaled + hpBonus;
  }

  private isFinalRush(): boolean {
    return this.remainingSeconds <= 30;
  }

  private getObjectiveMultiplier(): number {
    return this.isFinalRush() ? 2 : 1;
  }

  private pushBubble(text: string, x: number, y: number, remainingMs: number, isPositive: boolean): void {
    this.floatingBubbles.push({ text, x, y, remainingMs, isPositive });
    if (this.floatingBubbles.length > 4) {
      this.floatingBubbles.shift();
    }
  }

  private initRivalBotIfNeeded(): void {
    if (
      this.mode.id === 'CHASSE_AUX_BONNES_NOTES' ||
      this.mode.id === 'MATCH_DES_ACCORDS' ||
      this.mode.id === 'INTERRO_SURPRISE'
    ) {
      this.rivalBot = {
        x: ARENA_WIDTH * 0.5,
        y: 120,
        vx: 0,
        vy: 0,
        hp: 2600,
        maxHp: 2600,
        respawnMs: 0,
        actionCooldownMs: 4200,
        label: '🤖 Rival 6eB',
      };
    } else {
      this.rivalBot = null;
    }
  }

  private readonly loop = (now: number): void => {
    if (!this.running) return;
    const rawDt = (now - this.lastTimestamp) / 1000;
    const dt = Math.min(0.05, Math.max(0.001, rawDt));
    this.lastTimestamp = now;

    this.update(dt, now);
    this.draw(now);

    if (this.running) {
      this.rafId = requestAnimationFrame(this.loop);
    }
  };

  private update(dt: number, nowMs: number): void {
    const dtMs = dt * 1000;

    // Timer de partie
    this.remainingSeconds = Math.max(0, this.remainingSeconds - dt);
    if (this.remainingSeconds <= 0) {
      this.finishMatch();
      return;
    }

    // Atténuation tremblement de caméra & flashs cibles
    this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 28);
    for (const [id, ms] of this.targetHitFlashMs.entries()) {
      const next = ms - dtMs;
      if (next <= 0) {
        this.targetHitFlashMs.delete(id);
      } else {
        this.targetHitFlashMs.set(id, next);
      }
    }

    // Recharge munitions & cooldowns
    this.ammoBars = Math.min(this.brawler.max_ammo_bars, this.ammoBars + dt * 0.72);
    if (this.errorShieldRemainingMs > 0) {
      this.errorShieldRemainingMs = Math.max(0, this.errorShieldRemainingMs - dtMs);
    }
    if (this.penaltyCooldownMs > 0) {
      this.penaltyCooldownMs = Math.max(0, this.penaltyCooldownMs - dtMs);
    }
    if (this.laserHitCooldownMs > 0) {
      this.laserHitCooldownMs = Math.max(0, this.laserHitCooldownMs - dtMs);
    }
    if (this.safeCorridorBoostCooldownMs > 0) {
      this.safeCorridorBoostCooldownMs = Math.max(0, this.safeCorridorBoostCooldownMs - dtMs);
    }

    // Bulles flottantes
    this.floatingBubbles = this.floatingBubbles
      .map((b) => ({ ...b, remainingMs: b.remainingMs - dtMs, y: b.y - dt * 14 }))
      .filter((b) => b.remainingMs > 0);

    // Tourelle de Léo (Le Grand Robert : soin 400 PV/s)
    if (this.turretRemainingMs > 0) {
      this.turretRemainingMs = Math.max(0, this.turretRemainingMs - dtMs);
      this.playerHp = Math.min(this.computePlayerMaxHp(), this.playerHp + 400 * dt);
      if (this.turretRemainingMs <= 0) {
        this.turretPos = null;
      }
    }

    // Boussole de Maya
    if (this.compassRemainingMs > 0) {
      this.compassRemainingMs = Math.max(0, this.compassRemainingMs - dtMs);
      if (this.compassRemainingMs <= 0) {
        this.compassTargetPos = null;
      }
    }

    // Mise à jour Flaques d'Encre (Léo)
    this.updateInkPuddles(dtMs);

    // Respawn si K.O.
    if (this.respawnRemainingMs > 0) {
      this.respawnRemainingMs = Math.max(0, this.respawnRemainingMs - dtMs);
      if (this.respawnRemainingMs === 0) {
        this.playerX = ARENA_WIDTH * 0.5;
        this.playerY = ARENA_HEIGHT * 0.82;
        this.playerHp = this.computePlayerMaxHp();
        this.errorShieldRemainingMs = 2000;
        this.pushBubble('💪 Retour en jeu !', this.playerX, this.playerY, 900, true);
      }
    } else {
      // Déplacement du joueur + collisions obstacles + furtivité Zack dans les buissons
      this.updatePlayerMovement(dt);

      // Commandes Tir (avec Auto-Aim intelligent / Tap-to-Shoot) / Super / Gadget
      const fireCmd = this.controller.consumeFireCommand();
      if (fireCmd && this.ammoBars >= 1) {
        this.ammoBars -= 1;
        const resolvedAngle =
          fireCmd.autoAim || (this.accessibility.smart_auto_aim && fireCmd.targetWorldPos)
            ? this.resolveAutoAimAngle(
                fireCmd.angle,
                fireCmd.targetWorldPos,
                Boolean(fireCmd.autoAim)
              )
            : fireCmd.angle;
        this.spawnPlayerProjectiles(resolvedAngle);
      }

      if (this.controller.consumeSuperCommand()) {
        this.executeSuper(nowMs);
      }

      if (this.controller.consumeGadgetCommand()) {
        this.executeGadget();
      }
    }

    // Filet d'indice automatique après hésitation (8.5s)
    if (
      this.accessibility.auto_hint_assist &&
      !this.autoHintTriggeredForWave &&
      this.questionShownAtMs > 0 &&
      nowMs - this.questionShownAtMs >= 8500
    ) {
      this.activateWaveHint(false);
    }

    // Déplacement des cibles + répulsion anti-chevauchement
    this.updateTargets(dt, dtMs);

    // Logique temps réel des 5 Modes d'Arène
    if (this.updateModeLogic(dt, nowMs)) {
      return;
    }

    // Boussole GPS d'objectif (si activée)
    this.autoCompassPos = this.computeAutoCompassPos();

    // Bot rival adaptatif
    this.updateRivalBot(dt, dtMs);

    // Projectiles & impacts
    this.updateProjectiles(dt, nowMs);

    // HUD HTML
    this.emitHudState();
  }

  private updatePlayerMovement(dt: number): void {
    const move = this.controller.getMoveVector();
    const inBush = this.obstacles.some(
      (obs) =>
        obs.kind === 'bush' &&
        this.playerX >= obs.x &&
        this.playerX <= obs.x + obs.width &&
        this.playerY >= obs.y &&
        this.playerY <= obs.y + obs.height
    );
    this.isPlayerStealthed = this.brawler.id === 'ZACK' && inBush;

    let speedFactor = 1.0;
    if (this.isPlayerStealthed) {
      speedFactor *= 1.2;
    }
    if (
      this.modeSession instanceof ChangementSalleSession &&
      this.modeSession.getState().slowedByChatterMs > 0
    ) {
      speedFactor *= 0.58;
    }

    const worldSpeed = this.brawler.speed_value * 0.34 * speedFactor;

    const nextX = Math.max(
      36,
      Math.min(ARENA_WIDTH - 36, this.playerX + move.x * worldSpeed * dt)
    );
    if (!this.collidesBlockingObstacle(nextX, this.playerY, PLAYER_RADIUS)) {
      this.playerX = nextX;
    }

    const nextY = Math.max(
      60,
      Math.min(ARENA_HEIGHT - 36, this.playerY + move.y * worldSpeed * dt)
    );
    if (!this.collidesBlockingObstacle(this.playerX, nextY, PLAYER_RADIUS)) {
      this.playerY = nextY;
    }
  }

  private collidesBlockingObstacle(cx: number, cy: number, radius: number): boolean {
    for (const obs of this.obstacles) {
      if (obs.kind !== 'wall' && obs.kind !== 'desk') continue;
      const closestX = Math.max(obs.x, Math.min(cx, obs.x + obs.width));
      const closestY = Math.max(obs.y, Math.min(cy, obs.y + obs.height));
      if (Math.hypot(cx - closestX, cy - closestY) < radius) {
        return true;
      }
    }
    return false;
  }

  private findTargetAtScreenPos(sx: number, sy: number): IRenderVec2 | null {
    const worldPos = this.renderer.screenToWorld(sx, sy);
    let bestPos: IRenderVec2 | null = null;
    let bestDist = 58;

    for (const t of this.targets) {
      if (t.hp <= 0) continue;
      const d = Math.hypot(t.x - worldPos.x, t.y - worldPos.y);
      if (d <= bestDist) {
        bestDist = d;
        bestPos = { x: t.x, y: t.y };
      }
    }

    if (bestPos) return bestPos;

    if (this.modeSession instanceof MatchAccordsSession) {
      const ball = this.modeSession.getState().ball;
      if (Math.hypot(ball.x - worldPos.x, ball.y - worldPos.y) <= 58) {
        return { x: ball.x, y: ball.y };
      }
    }

    if (this.modeSession instanceof InterroSurpriseSession) {
      let bestCrate: IRenderVec2 | null = null;
      let bestCrateDist = 58;
      for (const crate of this.modeSession.getState().crates) {
        if (crate.hp <= 0) continue;
        const d = Math.hypot(crate.x - worldPos.x, crate.y - worldPos.y);
        if (d <= bestCrateDist) {
          bestCrateDist = d;
          bestCrate = { x: crate.x, y: crate.y };
        }
      }
      if (bestCrate) return bestCrate;
    }

    return null;
  }

  private resolveAutoAimAngle(
    fallbackAngle: number,
    targetWorldPos?: IRenderVec2,
    allowAutoFallback = true
  ): number {
    // Priorité 0 : cible vivante pointée / tapée à <= 68 unités
    if (targetWorldPos) {
      let pointedTarget: ITargetEntity | null = null;
      let pointedDist = 68;
      for (const t of this.targets) {
        if (t.hp <= 0) continue;
        const d = Math.hypot(t.x - targetWorldPos.x, t.y - targetWorldPos.y);
        if (d <= pointedDist) {
          pointedDist = d;
          pointedTarget = t;
        }
      }
      if (pointedTarget) {
        return Math.atan2(pointedTarget.y - this.playerY, pointedTarget.x - this.playerX);
      }
    }

    if (!allowAutoFallback) {
      return fallbackAngle;
    }

    const range = this.brawler.basic_attack.range;

    // 1. Cible vivante illuminée (highlightedMs > 0) à portée + 140
    let bestHighlighted: ITargetEntity | null = null;
    let bestHighlightedDist = range + 140;
    for (const t of this.targets) {
      if (t.hp <= 0 || t.highlightedMs <= 0) continue;
      const d = Math.hypot(t.x - this.playerX, t.y - this.playerY);
      if (d <= bestHighlightedDist) {
        bestHighlightedDist = d;
        bestHighlighted = t;
      }
    }
    if (bestHighlighted) {
      return Math.atan2(bestHighlighted.y - this.playerY, bestHighlighted.x - this.playerX);
    }

    // 2. Si smart_auto_aim et déjà une erreur sur la vague, assiste vers la bonne cible
    if (this.accessibility.smart_auto_aim && this.hasFailedCurrentWave) {
      let bestCorrect: ITargetEntity | null = null;
      let bestCorrectDist = range + 140;
      for (const t of this.targets) {
        if (t.hp <= 0 || !t.isCorrect) continue;
        const d = Math.hypot(t.x - this.playerX, t.y - this.playerY);
        if (d <= bestCorrectDist) {
          bestCorrectDist = d;
          bestCorrect = t;
        }
      }
      if (bestCorrect) {
        return Math.atan2(bestCorrect.y - this.playerY, bestCorrect.x - this.playerX);
      }
    }

    // 3. Cible vivante la plus proche à portée + 90
    const maxDist = range + 90;
    let bestTarget: { x: number; y: number } | null = null;
    let bestDist = maxDist;

    for (const t of this.targets) {
      if (t.hp <= 0) continue;
      const d = Math.hypot(t.x - this.playerX, t.y - this.playerY);
      if (d < bestDist) {
        bestDist = d;
        bestTarget = t;
      }
    }

    // 4. Ballon en Mode 2 ou caisse d'énergie proche en Mode 3
    if (!bestTarget && this.modeSession instanceof MatchAccordsSession) {
      const ball = this.modeSession.getState().ball;
      if (Math.hypot(ball.x - this.playerX, ball.y - this.playerY) <= maxDist) {
        bestTarget = ball;
      }
    }

    if (!bestTarget && this.modeSession instanceof InterroSurpriseSession) {
      let bestCrateDist = maxDist;
      for (const crate of this.modeSession.getState().crates) {
        if (crate.hp <= 0) continue;
        const d = Math.hypot(crate.x - this.playerX, crate.y - this.playerY);
        if (d <= bestCrateDist) {
          bestCrateDist = d;
          bestTarget = crate;
        }
      }
    }

    if (!bestTarget) return fallbackAngle;
    return Math.atan2(bestTarget.y - this.playerY, bestTarget.x - this.playerX);
  }

  private activateWaveHint(playAudio: boolean): void {
    this.autoHintTriggeredForWave = true;
    const correctTargets = this.targets.filter((t) => t.isCorrect && t.hp > 0);
    for (const t of correctTargets) {
      t.highlightedMs = Math.max(t.highlightedMs, 5500);
    }

    const rawFlash = (this.currentQuestion?.explanation_flash ?? '').trim();
    if (rawFlash.length > 0) {
      this.currentHintText = rawFlash.length > 96 ? `${rawFlash.slice(0, 93)}...` : rawFlash;
    } else if (correctTargets[0]) {
      this.currentHintText = `Vise « ${correctTargets[0].label} » !`;
    }

    if (playAudio) {
      soundManager.playGadget();
    }
    this.pushBubble(
      '💡 Indice activé : vise la cible dorée !',
      this.playerX,
      this.playerY,
      1500,
      true
    );
  }

  private computeAutoCompassPos(): IRenderVec2 | null {
    if (!this.accessibility.visual_gps_compass) {
      return null;
    }

    if (this.modeSession instanceof ChasseNotesSession) {
      const crystals = this.modeSession.getState().droppedCrystals;
      if (crystals.length > 0) {
        return { x: crystals[0].x, y: crystals[0].y };
      }
      const hlCorrect = this.targets.find((t) => t.isCorrect && t.hp > 0 && t.highlightedMs > 0);
      return hlCorrect ? { x: hlCorrect.x, y: hlCorrect.y } : null;
    }

    if (this.modeSession instanceof MatchAccordsSession) {
      const st = this.modeSession.getState();
      if (Math.hypot(st.ball.x - this.playerX, st.ball.y - this.playerY) > 75) {
        return { x: st.ball.x, y: st.ball.y };
      }
      return st.correctSide === 'LEFT' ? { x: 250, y: 58 } : { x: 710, y: 58 };
    }

    if (this.modeSession instanceof ChangementSalleSession) {
      const correctRoom = this.modeSession.getState().rooms.find((r) => r.isCorrect);
      if (correctRoom) {
        return {
          x: correctRoom.x + correctRoom.width * 0.5,
          y: correctRoom.y + correctRoom.height * 0.5,
        };
      }
      return null;
    }

    if (this.modeSession instanceof ConseilClasseSession) {
      const safeIdx = this.modeSession.getState().safeCorridorIndex;
      return {
        x: (safeIdx + 0.5) * (ARENA_WIDTH / 4),
        y: this.playerY,
      };
    }

    const hlTarget = this.targets.find((t) => t.hp > 0 && t.highlightedMs > 0);
    return hlTarget ? { x: hlTarget.x, y: hlTarget.y } : null;
  }

  private updateTargets(dt: number, dtMs: number): void {
    const nowSec = performance.now() * 0.001;
    for (const target of this.targets) {
      if (target.hp <= 0) continue;
      if (target.highlightedMs > 0) target.highlightedMs = Math.max(0, target.highlightedMs - dtMs);
      if (target.frozenMs > 0) {
        target.frozenMs = Math.max(0, target.frozenMs - dtMs);
        continue;
      }
      let tSpeedScale = this.targetSpeedMultiplier;
      if (this.accessibility.calm_mode) {
        tSpeedScale *= 0.8;
      }
      if (target.slowedMs > 0) {
        target.slowedMs = Math.max(0, target.slowedMs - dtMs);
        tSpeedScale *= 0.5;
      }

      // Déplacement fluide sinusoïdal + évitement anticipé des murs et bordures
      const phase = target.phaseOffset ?? 0;
      const swayY = Math.sin(nowSec * 3.1 + phase) * 28;
      const swayX = Math.cos(nowSec * 2.1 + phase) * 14;

      let avoidX = 0;
      let avoidY = 0;
      for (const obs of this.obstacles) {
        if (obs.kind !== 'wall' && obs.kind !== 'desk') continue;
        const cx = Math.max(obs.x, Math.min(target.x, obs.x + obs.width));
        const cy = Math.max(obs.y, Math.min(target.y, obs.y + obs.height));
        const dx = target.x - cx;
        const dy = target.y - cy;
        const dist = Math.hypot(dx, dy);
        const safeDist = target.radius + 36;
        if (dist < safeDist) {
          const strength = ((safeDist - dist) / safeDist) * 220;
          if (dist > 0.01) {
            avoidX += (dx / dist) * strength;
            avoidY += (dy / dist) * strength;
          } else {
            avoidY -= strength;
          }
        }
      }

      if (target.x < 105) avoidX += (105 - target.x) * 3.5;
      if (target.x > ARENA_WIDTH - 105) avoidX -= (target.x - (ARENA_WIDTH - 105)) * 3.5;
      if (target.y < 125) avoidY += (125 - target.y) * 3.5;
      if (target.y > ARENA_HEIGHT * 0.58) avoidY -= (target.y - ARENA_HEIGHT * 0.58) * 3.5;

      target.x += (target.vx + swayX + avoidX) * tSpeedScale * dt;
      target.y += (target.vy + swayY + avoidY) * tSpeedScale * dt;

      if (target.x < 70 || target.x > ARENA_WIDTH - 70) {
        target.vx *= -1;
        target.x = Math.max(70, Math.min(ARENA_WIDTH - 70, target.x));
      }
      if (target.y < 100 || target.y > ARENA_HEIGHT * 0.62) {
        target.vy *= -1;
        target.y = Math.max(100, Math.min(ARENA_HEIGHT * 0.62, target.y));
      }
    }

    // Répulsion douce pour éviter tout chevauchement de pilules
    const alive = this.targets.filter((t) => t.hp > 0);
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i];
        const b = alive[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.01 && dist < 110) {
          const push = ((110 - dist) * 0.5) * Math.min(1, dt * 8);
          const nx = dx / dist;
          const ny = dy / dist;
          a.x = Math.max(70, Math.min(ARENA_WIDTH - 70, a.x - nx * push));
          b.x = Math.max(70, Math.min(ARENA_WIDTH - 70, b.x + nx * push));
          a.y = Math.max(100, Math.min(ARENA_HEIGHT * 0.62, a.y - ny * push));
          b.y = Math.max(100, Math.min(ARENA_HEIGHT * 0.62, b.y + ny * push));
        }
      }
    }
  }

  private updateModeLogic(dt: number, nowMs: number): boolean {
    if (this.modeSession instanceof ChasseNotesSession) {
      const tickRes = this.modeSession.tick(dt);
      if (tickRes.shouldRotatePrompt) {
        this.spawnNextQuestionWave();
      }
      if (this.respawnRemainingMs <= 0) {
        const picked = this.modeSession.tryPickupCrystals(this.playerX, this.playerY, 58);
        if (picked > 0) {
          const gained = picked * this.getObjectiveMultiplier();
          this.objectiveScore += gained;
          soundManager.playHitCorrect(this.comboMultiplier);
          this.pushBubble(`💎 +${gained} Cristal !`, this.playerX, this.playerY, 950, true);
        }
      }
      if (tickRes.victoryByCountdown) {
        this.forceVictory = true;
        this.finishMatch();
        return true;
      }
      return false;
    }

    if (this.modeSession instanceof MatchAccordsSession) {
      const ballRes = this.modeSession.updateBall(
        dt,
        this.respawnRemainingMs <= 0 ? this.playerX : -999,
        this.respawnRemainingMs <= 0 ? this.playerY : -999,
        ARENA_WIDTH,
        ARENA_HEIGHT
      );
      if (ballRes.scoredSide !== null) {
        const reactionMs = Math.max(150, Math.round(nowMs - this.questionShownAtMs));
        if (ballRes.isGoalCorrect) {
          const pts = 1 * this.getObjectiveMultiplier();
          this.objectiveScore += pts;
          this.correctHits += 1;
          this.recordWaveOutcome(!this.hasFailedCurrentWave, reactionMs);
          soundManager.playSuperCast();
          this.shakeIntensity = 9;
          this.pushBubble(`⚽ BUT ! +${pts}`, ARENA_WIDTH * 0.5, 95, 1100, true);
          if (ballRes.matchWon || this.objectiveScore >= 2) {
            this.forceVictory = true;
            this.finishMatch();
            return true;
          }
          this.spawnNextQuestionWave();
        } else {
          this.hasFailedCurrentWave = true;
          this.recordWaveOutcome(false, reactionMs);
          soundManager.playHitError();
          this.shakeIntensity = 7;
          this.pushBubble(
            `❌ Mauvaise cage ! ${this.currentQuestion.explanation_flash}`,
            ARENA_WIDTH * 0.5,
            110,
            1400,
            false
          );
          this.spawnNextQuestionWave();
        }
      }
      return false;
    }

    if (this.modeSession instanceof InterroSurpriseSession) {
      const elapsedSec = this.mode.duration_seconds - this.remainingSeconds;
      this.modeSession.tick(elapsedSec);
      const nextMaxHp = this.computePlayerMaxHp();
      if (nextMaxHp > this.lastKnownMaxHp) {
        this.playerHp = Math.min(nextMaxHp, this.playerHp + (nextMaxHp - this.lastKnownMaxHp));
        this.lastKnownMaxHp = nextMaxHp;
      }
      if (!this.breathingTipShown && this.remainingSeconds <= 30) {
        this.breathingTipShown = true;
        this.playerHp = Math.min(this.computePlayerMaxHp(), this.playerHp + 350);
        for (const t of this.targets) {
          if (t.hp > 0) {
            t.slowedMs = Math.max(t.slowedMs, 3500);
          }
        }
        this.pushBubble(
          "🧘 30s : Respire calme et relis bien l'énoncé !",
          this.playerX,
          this.playerY,
          2000,
          true
        );
      }
      if (
        this.respawnRemainingMs <= 0 &&
        this.modeSession.isOutsideSafeZone(this.playerX, this.playerY, ARENA_WIDTH * 0.5, ARENA_HEIGHT * 0.5)
      ) {
        this.damagePlayer(260 * dt, true);
      }
      return false;
    }

    if (this.modeSession instanceof ChangementSalleSession) {
      if (this.respawnRemainingMs <= 0) {
        const hitChatter = this.modeSession.updateChatterDrones(
          dt,
          this.playerX,
          this.playerY,
          ARENA_WIDTH
        );
        if (hitChatter) {
          soundManager.playHitError();
          this.shakeIntensity = 5;
          this.pushBubble('💬 Bavardage ! Vitesse -40%', this.playerX, this.playerY, 950, false);
        }
        if (
          this.playerX >= 165 &&
          this.playerX <= 365 &&
          this.playerY >= 260 &&
          this.playerY <= 350 &&
          this.modeSession.activateLockerBonus()
        ) {
          soundManager.playGadget();
          this.pushBubble(
            '🎒 Passage au Casier ! Capture ×1.5 !',
            this.playerX,
            this.playerY,
            1300,
            true
          );
        }
        const inCorrect = this.modeSession.isPlayerInCorrectRoom(this.playerX, this.playerY);
        const captured = this.modeSession.advanceCapture(dt, inCorrect);
        if (inCorrect) {
          const pct = this.modeSession.getState().capturePct;
          this.objectiveScore = Math.max(this.objectiveScore, Math.floor(pct / 20));
        }
        if (captured) {
          this.forceVictory = true;
          this.finishMatch();
          return true;
        }
      } else {
        this.modeSession.updateChatterDrones(dt, -999, -999, ARENA_WIDTH);
      }
      if (this.modeSession.checkMidMatchUnexpectedEvent(this.remainingSeconds)) {
        this.pushBubble(
          '📢 Imprévu EDT : Prof absent, vérifie la nouvelle salle !',
          ARENA_WIDTH * 0.5,
          120,
          2000,
          true
        );
        this.spawnNextQuestionWave();
      }
      return false;
    }

    if (this.modeSession instanceof ConseilClasseSession) {
      this.modeSession.tickLaser(dt * (this.accessibility.calm_mode ? 0.8 : 1.0), 90, 540);
      if (this.respawnRemainingMs <= 0) {
        const laserY = this.modeSession.getState().laserSweepY;
        if (Math.abs(this.playerY - laserY) < 14) {
          if (this.modeSession.isHitByLaser(this.playerX, this.playerY, ARENA_WIDTH)) {
            if (this.laserHitCooldownMs <= 0) {
              this.laserHitCooldownMs = 950;
              this.damagePlayer(Math.round(this.computePlayerMaxHp() * 0.15));
              soundManager.playHitError();
              this.pushBubble('🚨 Laser ! Va dans le couloir vert !', this.playerX, this.playerY, 1000, false);
            }
          } else if (this.safeCorridorBoostCooldownMs <= 0) {
            this.safeCorridorBoostCooldownMs = 1500;
            this.superSystem.addSuperCharge(12);
            this.playerHp = Math.min(this.computePlayerMaxHp(), this.playerHp + 200);
            this.pushBubble(
              '🤝 Couloir des Délégués ! +12% Super',
              this.playerX,
              this.playerY,
              1100,
              true
            );
          }
        }
      }
    }

    return false;
  }

  private updateRivalBot(dt: number, dtMs: number): void {
    const bot = this.rivalBot;
    if (!bot) return;

    if (bot.respawnMs > 0) {
      bot.respawnMs = Math.max(0, bot.respawnMs - dtMs);
      if (bot.respawnMs === 0) {
        bot.hp = bot.maxHp;
        bot.x = ARENA_WIDTH * 0.5;
        bot.y = 120;
      }
      return;
    }

    let aimObj: { x: number; y: number } = { x: this.playerX, y: this.playerY };
    if (this.modeSession instanceof MatchAccordsSession) {
      aimObj = this.modeSession.getState().ball;
    } else if (this.modeSession instanceof ChasseNotesSession) {
      const crystals = this.modeSession.getState().droppedCrystals;
      if (crystals.length > 0) {
        aimObj = crystals[0];
      } else if (this.targets.length > 0) {
        const correct = this.targets.find((t) => t.isCorrect && t.hp > 0);
        if (correct) aimObj = correct;
      }
    }

    const dx = aimObj.x - bot.x;
    const dy = aimObj.y - bot.y;
    const dist = Math.hypot(dx, dy);
    const botSpeed = 140 * Math.min(1.3, this.targetSpeedMultiplier);
    if (dist > 28) {
      const nextX = Math.max(48, Math.min(ARENA_WIDTH - 48, bot.x + (dx / dist) * botSpeed * dt));
      const nextY = Math.max(70, Math.min(ARENA_HEIGHT - 48, bot.y + (dy / dist) * botSpeed * dt));
      if (!this.collidesBlockingObstacle(nextX, bot.y, 18)) bot.x = nextX;
      if (!this.collidesBlockingObstacle(bot.x, nextY, 18)) bot.y = nextY;
    }

    bot.actionCooldownMs -= dtMs;
    if (bot.actionCooldownMs <= 0) {
      bot.actionCooldownMs = Math.max(3600, Math.round(7500 / this.targetSpeedMultiplier));
      if (this.modeSession instanceof MatchAccordsSession) {
        const ball = this.modeSession.getState().ball;
        if (Math.hypot(ball.x - bot.x, ball.y - bot.y) < 110) {
          this.modeSession.kickBall(Math.atan2(this.playerY - bot.y, this.playerX - bot.x), 300);
        }
      } else if (
        this.respawnRemainingMs <= 0 &&
        !this.isPlayerStealthed &&
        Math.hypot(this.playerX - bot.x, this.playerY - bot.y) < 130
      ) {
        this.damagePlayer(Math.round(this.computePlayerMaxHp() * 0.08));
        this.pushBubble('💥 Touche du Rival !', this.playerX, this.playerY, 750, false);
      }
    }
  }

  private updateInkPuddles(dtMs: number): void {
    const remaining: IInkPuddle[] = [];
    let shouldRespawn = false;

    for (const puddle of this.inkPuddles) {
      puddle.remainingMs -= dtMs;
      if (puddle.remainingMs <= 0) continue;

      puddle.tickMs += dtMs;
      if (puddle.tickMs >= 450) {
        puddle.tickMs -= 450;
        for (const t of this.targets) {
          if (t.hp <= 0 || !t.isCorrect) continue;
          if (Math.hypot(t.x - puddle.x, t.y - puddle.y) <= puddle.radius + t.radius) {
            t.hp = Math.max(0, t.hp - 220);
            this.targetHitFlashMs.set(t.id, 130);
            if (t.hp <= 0) {
              this.onCorrectTargetDefeated(t, performance.now());
              shouldRespawn = true;
              break;
            }
          }
        }
      }
      remaining.push(puddle);
    }

    this.inkPuddles = remaining;
    if (shouldRespawn) {
      this.spawnNextQuestionWave();
    }
  }

  private damagePlayer(amount: number, bypassShield = false): void {
    if (amount <= 0 || this.respawnRemainingMs > 0) return;

    let remaining = amount;
    if (!bypassShield && this.shieldHp > 0) {
      const absorbed = Math.min(this.shieldHp, remaining);
      this.shieldHp -= absorbed;
      remaining -= absorbed;
    }

    this.playerHp = Math.max(0, this.playerHp - remaining);
    if (!bypassShield) {
      this.shakeIntensity = Math.max(this.shakeIntensity, 7);
    }

    if (this.playerHp <= 0) {
      this.respawnRemainingMs = 2500;
      this.consecutiveCorrectHits = 0;
      this.comboMultiplier = 1.0;
      this.shakeIntensity = 12;

      if (this.modeSession instanceof ChasseNotesSession) {
        const dropCount = Math.min(2, this.objectiveScore);
        if (dropCount > 0) {
          this.objectiveScore = Math.max(0, this.objectiveScore - dropCount);
          for (let i = 0; i < dropCount; i++) {
            this.modeSession.spawnDroppedCrystal(
              this.playerX + (i === 0 ? -36 : 36),
              this.playerY - 12
            );
          }
        }
      }

      this.pushBubble('💫 K.O. ! Retour dans 2,5s', this.playerX, this.playerY, 1400, false);
    }
  }

  private spawnPlayerProjectiles(angle: number): void {
    soundManager.playShoot(this.brawler.id);
    const count = this.brawler.id === 'MAYA' ? 3 : this.brawler.basic_attack.projectiles_count;
    const speed = this.brawler.id === 'TIMO' ? 680 : this.brawler.id === 'ZACK' ? 760 : 580;
    const color =
      this.brawler.id === 'TIMO'
        ? '#facc15'
        : this.brawler.id === 'LEO'
          ? '#a855f7'
          : this.brawler.id === 'MAYA'
            ? '#84cc16'
            : '#22d3ee';

    for (let i = 0; i < count; i++) {
      let offsetAngle = 0;
      if (this.brawler.id === 'MAYA') {
        offsetAngle = i === 0 ? -0.22 : i === 1 ? 0 : 0.22;
      } else if (count === 2) {
        offsetAngle = i === 0 ? -0.05 : 0.05;
      }

      const finalAngle = angle + offsetAngle;
      this.projectiles.push({
        x: this.playerX + Math.cos(finalAngle) * 18,
        y: this.playerY + Math.sin(finalAngle) * 18,
        vx: Math.cos(finalAngle) * speed,
        vy: Math.sin(finalAngle) * speed,
        radius: this.brawler.id === 'MAYA' ? 13 : 9,
        color,
        isLobbed: this.brawler.id === 'LEO',
        heightZ: 14,
        distanceTraveled: 0,
        maxRange: this.brawler.basic_attack.range,
        isRebounding: false,
        hitTargetIds: new Set<string>(),
      });
    }
  }

  private updateProjectiles(dt: number, nowMs: number): void {
    const remaining: IActiveProjectile[] = [];

    for (const proj of this.projectiles) {
      const stepX = proj.vx * dt;
      const stepY = proj.vy * dt;
      proj.x += stepX;
      proj.y += stepY;
      proj.distanceTraveled += Math.hypot(stepX, stepY);

      if (proj.isLobbed) {
        const progress = Math.min(1, proj.distanceTraveled / proj.maxRange);
        proj.heightZ = 14 + Math.sin(progress * Math.PI) * 52;
      }

      const outOfBounds =
        proj.distanceTraveled >= proj.maxRange ||
        proj.x < 0 ||
        proj.x > ARENA_WIDTH ||
        proj.y < 0 ||
        proj.y > ARENA_HEIGHT;

      if (!proj.isLobbed && this.collidesBlockingObstacle(proj.x, proj.y, proj.radius * 0.6)) {
        this.renderer.spawnHitBurst(proj.x, proj.y, 0x94a3b8, 6);
        continue;
      }

      if (outOfBounds) {
        if (proj.isLobbed && !proj.isRebounding) {
          this.inkPuddles.push({
            x: Math.max(40, Math.min(ARENA_WIDTH - 40, proj.x)),
            y: Math.max(70, Math.min(ARENA_HEIGHT - 40, proj.y)),
            radius: 64,
            remainingMs: 1800,
            tickMs: 120,
          });
        }
        continue;
      }

      // Interaction avec ballon (Mode 2)
      if (!proj.isRebounding && this.modeSession instanceof MatchAccordsSession) {
        const ball = this.modeSession.getState().ball;
        if (Math.hypot(proj.x - ball.x, proj.y - ball.y) <= ball.radius + proj.radius + 4) {
          this.modeSession.kickBall(Math.atan2(proj.vy, proj.vx), 560);
          this.renderer.spawnHitBurst(ball.x, ball.y, 0xfacc15, 10);
          soundManager.playShoot(this.brawler.id);
          continue;
        }
      }

      // Interaction avec caisses d'énergie (Mode 3)
      if (!proj.isRebounding && this.modeSession instanceof InterroSurpriseSession) {
        const crate = this.modeSession
          .getState()
          .crates.find((c) => Math.hypot(proj.x - c.x, proj.y - c.y) <= 26 + proj.radius);
        if (crate) {
          const dmgMult = this.modeSession.getState().damageMultiplier;
          const crateDmg = Math.round(
            this.brawler.basic_attack.base_damage *
              (1 + 0.08 * (this.brawlerLevel - 1)) *
              dmgMult
          );
          const broken = this.modeSession.damageCrate(crate.id, crateDmg);
          this.renderer.spawnHitBurst(crate.x, crate.y, broken ? 0x4ade80 : 0xfacc15, 10);
          if (broken) {
            const nextMax = this.computePlayerMaxHp();
            this.lastKnownMaxHp = nextMax;
            this.playerHp = Math.min(nextMax, this.playerHp + 400);
            this.pushBubble('⚡ +400 PV / +10% Dégâts !', crate.x, crate.y, 1100, true);
          }
          continue;
        }
      }

      // Interaction avec Rival AI
      if (
        !proj.isRebounding &&
        this.rivalBot &&
        this.rivalBot.respawnMs <= 0 &&
        Math.hypot(proj.x - this.rivalBot.x, proj.y - this.rivalBot.y) <= 22 + proj.radius
      ) {
        const hitDmg = Math.round(
          this.brawler.basic_attack.base_damage * (1 + 0.08 * (this.brawlerLevel - 1))
        );
        this.rivalBot.hp = Math.max(0, this.rivalBot.hp - hitDmg);
        this.renderer.spawnHitBurst(this.rivalBot.x, this.rivalBot.y, 0xfb7185, 8);
        if (this.rivalBot.hp <= 0) {
          this.rivalBot.respawnMs = 4000;
          this.objectiveScore += 1 * this.getObjectiveMultiplier();
          this.pushBubble('🥊 Rival K.O. !', this.rivalBot.x, this.rivalBot.y, 900, true);
        }
        continue;
      }

      if (!proj.isRebounding) {
        let hitTarget: ITargetEntity | null = null;
        for (const target of this.targets) {
          if (target.hp <= 0 || proj.hitTargetIds.has(target.id)) continue;
          const dist = Math.hypot(proj.x - target.x, proj.y - target.y);
          if (dist <= target.radius + proj.radius) {
            hitTarget = target;
            break;
          }
        }

        if (hitTarget) {
          proj.hitTargetIds.add(hitTarget.id);
          this.handleTargetHit(hitTarget, proj, nowMs);
          if (proj.isLobbed && !proj.isRebounding) {
            this.inkPuddles.push({
              x: hitTarget.x,
              y: hitTarget.y,
              radius: 64,
              remainingMs: 1800,
              tickMs: 0,
            });
          }
          if (!proj.isRebounding) {
            continue;
          }
        }
      }

      remaining.push(proj);
    }

    this.projectiles = remaining;
  }

  private recordWaveOutcome(isFirstTrySuccess: boolean, reactionTimeMs: number): void {
    if (this.waveTelemetryRecorded) return;
    this.waveTelemetryRecorded = true;

    const maxHp = this.computePlayerMaxHp();
    const impact = computeCombatImpact({
      base_damage: this.brawler.basic_attack.base_damage,
      brawler_level: this.brawlerLevel,
      consecutive_correct_hits: this.consecutiveCorrectHits,
      is_correct: isFirstTrySuccess,
      reaction_time_ms: reactionTimeMs,
      player_max_hp: maxHp,
    });

    if (isFirstTrySuccess && reactionTimeMs <= REFLEX_BONUS_THRESHOLD_MS) {
      this.fastReflexHits += 1;
    }
    if (!isFirstTrySuccess && !this.missedQuestionsMap.has(this.currentQuestion.id)) {
      this.missedQuestionsMap.set(this.currentQuestion.id, this.currentQuestion);
    }

    this.onHitTelemetry?.({
      question: this.currentQuestion,
      isCorrect: isFirstTrySuccess,
      reactionTimeMs,
      impact,
    });
  }

  private onCorrectTargetDefeated(target: ITargetEntity, nowMs: number): void {
    const reactionTimeMs = Math.max(150, Math.round(nowMs - this.questionShownAtMs));
    this.recordWaveOutcome(!this.hasFailedCurrentWave, reactionTimeMs);

    const pointMult = this.getObjectiveMultiplier();

    if (this.modeSession instanceof ChasseNotesSession) {
      this.modeSession.spawnDroppedCrystal(target.x, target.y);
      this.pushBubble('💎 Cristal éjecté ! Ramasse-le !', target.x, target.y, 1000, true);
      return;
    }

    if (this.modeSession instanceof InterroSurpriseSession) {
      this.objectiveScore += 1 * pointMult;
      const won = this.modeSession.eliminateOpponent();
      if (won) {
        this.forceVictory = true;
        this.finishMatch();
      }
      return;
    }

    if (this.modeSession instanceof ChangementSalleSession) {
      this.modeSession.advanceCapture(1.0, true);
      this.objectiveScore += 1 * pointMult;
      if (this.modeSession.getState().capturePct >= 100) {
        this.forceVictory = true;
        this.finishMatch();
      }
      return;
    }

    if (this.modeSession instanceof ConseilClasseSession) {
      this.objectiveScore += 1 * pointMult;
      const bossDmg = Math.max(950, this.lastDamageDealt);
      const defeated = this.modeSession.damageBoss(bossDmg);
      const banner = this.modeSession.consumeMilestoneBanner();
      if (banner) {
        this.pushBubble(banner, ARENA_WIDTH * 0.5, 130, 1450, true);
      }
      if (defeated) {
        this.forceVictory = true;
        this.finishMatch();
      }
      return;
    }

    if (this.modeSession instanceof MatchAccordsSession) {
      const ball = this.modeSession.getState().ball;
      const goalX = this.modeSession.getState().correctSide === 'LEFT' ? 250 : 710;
      this.modeSession.kickBall(Math.atan2(52 - ball.y, goalX - ball.x), 540);
      this.pushBubble('⚽ Passe vers la bonne cage !', target.x, target.y, 900, true);
    }
  }

  private handleTargetHit(target: ITargetEntity, proj: IActiveProjectile, nowMs: number): void {
    const reactionTimeMs = Math.max(150, Math.round(nowMs - this.questionShownAtMs));
    this.totalShotsHit += 1;

    const dmgScale =
      this.modeSession instanceof InterroSurpriseSession
        ? this.modeSession.getState().damageMultiplier
        : 1.0;

    const impact = computeCombatImpact({
      base_damage: Math.round(this.brawler.basic_attack.base_damage * dmgScale),
      brawler_level: this.brawlerLevel,
      consecutive_correct_hits: this.consecutiveCorrectHits,
      is_correct: target.isCorrect,
      reaction_time_ms: reactionTimeMs,
      player_max_hp: this.computePlayerMaxHp(),
    });

    if (target.isCorrect) {
      const wasSuperReady = this.superSystem.getSuperGaugePct() >= 100;
      target.hp = Math.max(0, target.hp - impact.final_damage);
      this.targetHitFlashMs.set(target.id, 140);
      this.lastDamageDealt = impact.final_damage;
      this.consecutiveCorrectHits += 1;
      this.comboMultiplier = impact.combo_multiplier;
      this.correctHits += 1;
      this.superSystem.addSuperCharge(impact.super_charge_gain_pct);

      const targetKilled = target.hp <= 0;
      this.renderer.spawnHitBurst(
        target.x,
        target.y,
        targetKilled ? 0xfacc15 : 0x38e54d,
        targetKilled ? 18 : 12
      );
      this.renderer.spawnStarExplosion(
        target.x,
        target.y,
        targetKilled ? '#facc15' : '#4ade80'
      );
      this.renderer.spawnFloatingDamage(target.x, target.y, impact.final_damage, targetKilled);
      if (this.consecutiveCorrectHits >= 2) {
        this.renderer.spawnFloatingCombo(
          this.playerX,
          this.playerY,
          this.consecutiveCorrectHits,
          this.comboMultiplier
        );
      }
      this.renderer.triggerScreenShake(targetKilled ? 7 : 4, 180);
      soundManager.playImpact(targetKilled);
      soundManager.playHitCorrect(this.comboMultiplier);
      if (!wasSuperReady && this.superSystem.getSuperGaugePct() >= 100) {
        soundManager.playSuperReady();
      }

      if (targetKilled) {
        this.shakeIntensity = Math.max(this.shakeIntensity, 5);
        this.pushBubble(
          `✔ Bravo ! +${impact.final_damage} (${impact.super_charge_gain_pct}% Super)`,
          target.x,
          target.y,
          950,
          true
        );
        if (this.hasFailedCurrentWave && this.lastErrorPenaltyDamage > 0) {
          const recoveredHp = Math.round(this.lastErrorPenaltyDamage * 0.6);
          this.playerHp = Math.min(this.computePlayerMaxHp(), this.playerHp + recoveredHp);
          this.superSystem.addSuperCharge(15);
          this.lastErrorPenaltyDamage = 0;
          this.pushBubble(
            `🔄 Rebote réussi ! +${recoveredHp} PV récupérés !`,
            this.playerX,
            this.playerY,
            1350,
            true
          );
        }
        this.onCorrectTargetDefeated(target, nowMs);
        if (!this.finished) {
          this.spawnNextQuestionWave();
        }
      } else {
        this.pushBubble(`-${impact.final_damage} PV !`, target.x, target.y, 700, true);
      }
      return;
    }

    // Cible erronée : rebond métallique, reset combo, pénalité 12% PV_max + conseil coach bienveillant
    this.hasFailedCurrentWave = true;
    this.autoHintTriggeredForWave = true;
    this.lastErrorPenaltyDamage = impact.error_penalty_damage;
    target.hp = 0;
    this.recordWaveOutcome(false, reactionTimeMs);

    for (const correctTarget of this.targets) {
      if (correctTarget.isCorrect && correctTarget.hp > 0) {
        correctTarget.highlightedMs = Math.max(correctTarget.highlightedMs, 5500);
      }
    }

    const rawFlash = this.currentQuestion.explanation_flash.trim();
    this.currentHintText = rawFlash.length > 96 ? `${rawFlash.slice(0, 93)}...` : rawFlash;

    this.renderer.spawnHitBurst(target.x, target.y, 0x38bdf8, 14);
    this.renderer.spawnRedErrorSmoke(target.x, target.y);
    this.renderer.triggerScreenShake(9, 260);
    this.renderer.spawnFloatingCorrection(target.x, target.y, rawFlash);
    soundManager.playHitError();
    soundManager.playPenaltyBuzzer();
    proj.isRebounding = true;
    proj.vx = -proj.vx * 0.65;
    proj.vy = -proj.vy * 0.65;
    proj.maxRange = proj.distanceTraveled + 80;

    this.consecutiveCorrectHits = 0;
    this.comboMultiplier = 1.0;

    if (this.errorShieldRemainingMs <= 0) {
      this.damagePlayer(impact.error_penalty_damage);
      this.penaltyCooldownMs = ERROR_PENALTY_COOLDOWN_MS;
      this.errorShieldRemainingMs = ERROR_SHIELD_DURATION_MS;
    }

    const coachFlash = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(rawFlash)
      ? rawFlash
      : `💡 ${rawFlash}`;
    this.pushBubble(
      coachFlash,
      target.x,
      target.y,
      impact.trigger_explanation_flash_ms,
      false
    );
  }

  private executeSuper(nowMs: number): void {
    const validatedLabel = this.targets.find((t) => t.isCorrect)?.label ?? '';
    const result = this.superSystem.triggerSuper(this.brawler, this.targets, {
      x: this.playerX,
      y: this.playerY,
    });
    if (!result) return;

    if (result.newPlayerPos) {
      this.playerX = result.newPlayerPos.x;
      this.playerY = result.newPlayerPos.y;
    }
    if (result.grantedShieldHp > 0) {
      this.shieldHp += result.grantedShieldHp;
    }
    if (result.spawnTurretAt) {
      this.turretPos = result.spawnTurretAt;
      this.turretRemainingMs = result.durationMs;
    }

    const superColor =
      this.brawler.id === 'TIMO'
        ? 0xfacc15
        : this.brawler.id === 'LEO'
          ? 0xa855f7
          : this.brawler.id === 'MAYA'
            ? 0x84cc16
            : 0x22d3ee;
    this.renderer.spawnSuperShockwave(this.playerX, this.playerY, superColor);
    soundManager.playSuperCast();
    this.shakeIntensity = 10;

    const reactionTimeMs = Math.max(150, Math.round(nowMs - this.questionShownAtMs));
    this.recordWaveOutcome(!this.hasFailedCurrentWave, reactionTimeMs);

    const pts = result.bonusObjectivePoints * this.getObjectiveMultiplier();
    this.objectiveScore += pts;
    this.correctHits += 1;

    if (this.modeSession instanceof ChasseNotesSession) {
      this.modeSession.collectCrystal(pts);
    } else if (this.modeSession instanceof InterroSurpriseSession) {
      if (this.modeSession.eliminateOpponent()) {
        this.forceVictory = true;
        this.finishMatch();
        return;
      }
    } else if (this.modeSession instanceof ChangementSalleSession) {
      this.modeSession.advanceCapture(1.4, true);
      if (this.modeSession.getState().capturePct >= 100) {
        this.forceVictory = true;
        this.finishMatch();
        return;
      }
    } else if (this.modeSession instanceof ConseilClasseSession) {
      const defeated = this.modeSession.damageBoss(2500);
      const banner = this.modeSession.consumeMilestoneBanner();
      if (banner) {
        this.pushBubble(banner, ARENA_WIDTH * 0.5, 130, 1450, true);
      }
      if (defeated) {
        this.forceVictory = true;
        this.finishMatch();
        return;
      }
    }

    this.pushBubble(
      `⚡ ${result.superName} ! ✓ ${validatedLabel} (+${pts} pts)`,
      this.playerX,
      this.playerY,
      1350,
      true
    );

    if (!this.finished) {
      this.spawnNextQuestionWave();
    }
  }

  private executeGadget(): void {
    const result = this.superSystem.triggerGadget(this.brawler, this.targets);
    if (!result) return;

    if (result.compassTargetPos) {
      this.compassTargetPos = result.compassTargetPos;
      this.compassRemainingMs = result.durationMs;
    }

    this.renderer.spawnHitBurst(this.playerX, this.playerY, 0x38e54d, 12);
    soundManager.playGadget();

    this.pushBubble(
      `🟢 ${result.gadgetName} (${result.remainingCharges} restants)`,
      this.playerX,
      this.playerY,
      1000,
      true
    );
  }

  private spawnNextQuestionWave(): void {
    this.currentQuestion = this.requestNextQuestion();
    this.questionShownAtMs = performance.now();
    this.hasFailedCurrentWave = false;
    this.waveTelemetryRecorded = false;
    this.currentHintText = null;
    this.autoHintTriggeredForWave = false;
    this.lastErrorPenaltyDamage = 0;

    const targetsList = this.currentQuestion.targets;
    const count = Math.max(1, targetsList.length);
    const spacing = (ARENA_WIDTH - 180) / Math.max(1, count - 1);

    this.targets = targetsList.map((item, idx) => {
      const x = count === 1 ? ARENA_WIDTH * 0.5 : 90 + idx * spacing;
      const y = 140 + (idx % 2) * 75;
      const baseHp =
        this.mode.id === 'CONSEIL_DE_CLASSE' && item.is_correct
          ? 950
          : Math.min(950, this.brawler.basic_attack.base_damage * this.brawler.basic_attack.projectiles_count);
      const speedX = (idx % 2 === 0 ? 1 : -1) * (42 + idx * 11);
      const speedY = idx % 2 === 0 ? 22 : -22;

      const badgeLetter = (['A', 'B', 'C', 'D'][idx % 4] as 'A' | 'B' | 'C' | 'D');

      return {
        id: `${this.currentQuestion.id}_${idx}`,
        x,
        y,
        vx: speedX,
        vy: speedY,
        radius: this.mode.id === 'CONSEIL_DE_CLASSE' && idx === 0 ? 34 : 26,
        label: item.label,
        isCorrect: item.is_correct,
        hp: baseHp,
        maxHp: baseHp,
        highlightedMs: 0,
        frozenMs: 0,
        slowedMs: 0,
        isCrystal: this.mode.id === 'CHASSE_AUX_BONNES_NOTES',
        isBoss: this.mode.id === 'CONSEIL_DE_CLASSE' && idx === 0,
        badgeLetter,
        phaseOffset: idx * 1.35,
      };
    });

    if (this.modeSession instanceof MatchAccordsSession) {
      this.modeSession.setupGoalsFromQuestion(this.currentQuestion);
      const st = this.modeSession.getState();
      this.obstacles = [
        { x: 140, y: 26, width: 220, height: 55, kind: 'goal_left', label: st.leftGoalLabel },
        { x: 600, y: 26, width: 220, height: 55, kind: 'goal_right', label: st.rightGoalLabel },
      ];
    } else if (this.modeSession instanceof ChangementSalleSession) {
      this.modeSession.setupRoomsFromQuestion(this.currentQuestion);
      const roomObstacles: IRenderObstacle[] = this.modeSession.getState().rooms.map((r) => ({
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        kind: 'safe_zone',
        label: r.label,
      }));
      this.obstacles = [
        { x: 180, y: 290, width: 170, height: 34, kind: 'wall', label: 'CASIERS' },
        { x: 610, y: 290, width: 170, height: 34, kind: 'wall', label: 'COULOIR' },
        ...roomObstacles,
      ];
    } else if (this.modeSession instanceof ConseilClasseSession) {
      const correctIdx = Math.max(0, targetsList.findIndex((t) => t.is_correct)) % 4;
      this.modeSession.setSafeCorridor(correctIdx);
    }
  }

  private setupModeObstacles(): void {
    if (this.mode.id === 'MATCH_DES_ACCORDS') {
      this.obstacles = [
        { x: 140, y: 26, width: 220, height: 55, kind: 'goal_left', label: '-É' },
        { x: 600, y: 26, width: 220, height: 55, kind: 'goal_right', label: '-ER' },
      ];
      return;
    }
    if (this.mode.id === 'CHANGEMENT_DE_SALLE') {
      this.obstacles = [
        { x: 180, y: 290, width: 170, height: 34, kind: 'wall', label: 'CASIERS' },
        { x: 610, y: 290, width: 170, height: 34, kind: 'wall', label: 'COULOIR' },
        { x: 420, y: 95, width: 120, height: 70, kind: 'safe_zone', label: 'SALLE' },
      ];
      return;
    }
    this.obstacles = [
      { x: 170, y: 310, width: 90, height: 42, kind: 'desk' },
      { x: 700, y: 310, width: 90, height: 42, kind: 'desk' },
      { x: 435, y: 360, width: 90, height: 42, kind: 'bush' },
    ];
  }

  private draw(nowMs: number): void {
    const objectiveLabel =
      this.mode.id === 'MATCH_DES_ACCORDS'
        ? 'Buts'
        : this.mode.id === 'CHASSE_AUX_BONNES_NOTES'
          ? 'Cristaux'
          : 'Score';

    const maxHp = this.computePlayerMaxHp();
    const elapsedSincePrompt = Math.max(0, nowMs - this.questionShownAtMs);
    const reflexRatio =
      this.questionShownAtMs > 0
        ? Math.max(0, 1 - elapsedSincePrompt / REFLEX_BONUS_THRESHOLD_MS)
        : 0;

    let shrinkRadius: number | undefined;
    let laserSweepY: number | undefined;
    let safeCorridorIndex: number | undefined;
    let bossState: { name: string; hp: number; maxHp: number } | undefined;
    let droppedCrystals: Array<{ id: string; x: number; y: number }> | undefined;
    let arenaBall: { x: number; y: number; radius: number } | undefined;
    let energyCrates: Array<{ id: string; x: number; y: number; hp: number; maxHp: number }> | undefined;
    let alivePlayersCount: number | undefined;
    let chatterDrones: Array<{ id: string; x: number; y: number; radius: number }> | undefined;
    let capturePct: number | undefined;
    let rushBannerText: string | null = this.isFinalRush() ? '🔥 RUSH FINAL ×2 PTS !' : null;

    if (this.modeSession instanceof ChasseNotesSession) {
      const st = this.modeSession.getState();
      droppedCrystals = st.droppedCrystals;
      if (st.countdownActive) {
        rushBannerText = `⏳ DÉCOMPTE CRISTAUX : ${Math.ceil(st.countdownRemainingSec)}s !`;
      }
    } else if (this.modeSession instanceof MatchAccordsSession) {
      const st = this.modeSession.getState();
      arenaBall = { x: st.ball.x, y: st.ball.y, radius: st.ball.radius };
    } else if (this.modeSession instanceof InterroSurpriseSession) {
      const st = this.modeSession.getState();
      shrinkRadius = st.safeRadius;
      energyCrates = st.crates;
      alivePlayersCount = st.alivePlayersCount;
    } else if (this.modeSession instanceof ChangementSalleSession) {
      const st = this.modeSession.getState();
      chatterDrones = st.chatterDrones;
      capturePct = st.capturePct;
    } else if (this.modeSession instanceof ConseilClasseSession) {
      const st = this.modeSession.getState();
      laserSweepY = st.laserSweepY;
      safeCorridorIndex = st.safeCorridorIndex;
      bossState = { name: st.bossName, hp: st.bossHp, maxHp: st.bossMaxHp };
    }

    this.renderer.render({
      modeId: this.mode.id,
      arenaWidth: ARENA_WIDTH,
      arenaHeight: ARENA_HEIGHT,
      player: {
        x: this.playerX,
        y: this.playerY,
        aimAngle: this.controller.getAimAngle(),
        brawlerId: this.brawler.id,
        name: this.brawler.name,
        hp: this.playerHp,
        maxHp,
        ammoBars: this.ammoBars,
        maxAmmoBars: this.brawler.max_ammo_bars,
        superGaugePct: this.superSystem.getSuperGaugePct(),
        gadgetCharges: this.superSystem.getGadgetChargesLeft(),
        shieldHp: this.shieldHp,
        errorShieldRemainingMs: this.errorShieldRemainingMs,
        penaltyCooldownMs: this.penaltyCooldownMs,
        comboMultiplier: this.comboMultiplier,
        isAiming: this.controller.isAiming(),
        isCancellingAim: this.controller.isCancellingAim(),
        attackRange: this.brawler.basic_attack.range,
        isStealthed: this.isPlayerStealthed,
        isRespawning: this.respawnRemainingMs > 0,
        respawnRemainingMs: this.respawnRemainingMs,
      },
      targets: this.targets
        .filter((t) => t.hp > 0)
        .map((t) => ({
          id: t.id,
          x: t.x,
          y: t.y,
          radius: t.radius,
          label: t.label,
          isCorrect: t.isCorrect,
          hp: t.hp,
          maxHp: t.maxHp,
          highlighted: t.highlightedMs > 0,
          isCrystal: t.isCrystal,
          isBoss: t.isBoss,
          frozen: t.frozenMs > 0,
          slowed: t.slowedMs > 0,
          hitFlashMs: this.targetHitFlashMs.get(t.id) ?? 0,
          badgeLetter: t.badgeLetter,
          vx: t.vx,
          vy: t.vy,
        })),
      projectiles: this.projectiles,
      obstacles: this.obstacles,
      hudPrompt: this.currentQuestion?.hud_prompt ?? '',
      objectiveScore: this.objectiveScore,
      objectiveLabel,
      remainingSeconds: this.remainingSeconds,
      shrinkRadius,
      laserSweepY,
      safeCorridorIndex,
      bossState,
      turretPos: this.turretPos,
      compassTargetPos: this.compassTargetPos ?? this.autoCompassPos,
      flashBubble: this.floatingBubbles[this.floatingBubbles.length - 1] ?? null,
      floatingBubbles: this.floatingBubbles,
      reflexRemainingRatio: reflexRatio,
      droppedCrystals,
      arenaBall,
      energyCrates,
      alivePlayersCount,
      chatterDrones,
      capturePct,
      inkPuddles: this.inkPuddles,
      rivalBot:
        this.rivalBot && this.rivalBot.respawnMs <= 0
          ? {
              x: this.rivalBot.x,
              y: this.rivalBot.y,
              label: this.rivalBot.label,
              hp: this.rivalBot.hp,
              maxHp: this.rivalBot.maxHp,
            }
          : null,
      rushBannerText,
      hintText: this.currentHintText,
      shakeIntensity: this.shakeIntensity,
      leftStick: this.controller.getLeftStickRender(),
      rightStick: this.controller.getRightStickRender(),
    });
  }

  private emitHudState(): void {
    this.onHudStateChange?.({
      remainingSeconds: this.remainingSeconds,
      objectiveScore: this.objectiveScore,
      hp: Math.round(this.playerHp),
      maxHp: this.computePlayerMaxHp(),
      ammoBars: Math.floor(this.ammoBars),
      superGaugePct: Math.round(this.superSystem.getSuperGaugePct()),
      gadgetCharges: this.superSystem.getGadgetChargesLeft(),
      comboMultiplier: this.comboMultiplier,
      hudPrompt: this.currentQuestion?.hud_prompt ?? '',
      lastDamageDealt: this.lastDamageDealt,
    });
  }

  private finishMatch(): void {
    if (this.finished) return;
    this.finished = true;
    this.stop();

    const played = Math.round(this.mode.duration_seconds - this.remainingSeconds);
    const victory = this.forceVictory || this.objectiveScore >= 2 || this.correctHits >= 3;
    const starsEarned = victory ? (this.objectiveScore >= 6 ? 3 : 2) : 1;
    soundManager.playMatchEnd(victory);

    this.onMatchFinished?.({
      modeId: this.mode.id,
      brawlerId: this.brawler.id,
      victory,
      objectiveScore: this.objectiveScore,
      correctHits: this.correctHits,
      totalShotsHit: this.totalShotsHit,
      starsEarned,
      durationPlayedSec: played,
      missedQuestions: Array.from(this.missedQuestionsMap.values()),
      fastReflexHits: this.fastReflexHits,
    });
  }
}
