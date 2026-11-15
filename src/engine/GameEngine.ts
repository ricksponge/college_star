import type {
  IBrawler,
  ICombatImpactResult,
  IGameMode,
  IQuestion,
} from '../types/cctp';
import {
  computeCombatImpact,
  ERROR_PENALTY_COOLDOWN_MS,
  ERROR_SHIELD_DURATION_MS,
} from './CombatMath';
import {
  IsometricRenderer,
  type IRenderFlashBubble,
  type IRenderObstacle,
  type IRenderProjectile,
  type IRenderVec2,
} from './IsometricRenderer';
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
}

export interface IGameEngineOptions {
  canvas: HTMLCanvasElement;
  brawler: IBrawler;
  mode: IGameMode;
  brawlerLevel?: number;
  targetSpeedMultiplier?: number;
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

const ARENA_WIDTH = 960;
const ARENA_HEIGHT = 640;

/**
 * Moteur de combat 60 FPS en vue isométrique 50° reliant :
 * - IsometricRenderer (#5)
 * - TwinStickController & CombatMath (#1)
 * - SuperSystem (#2)
 * - Roster des 4 Héros (#8)
 */
export class GameEngine {
  private readonly renderer: IsometricRenderer;
  private readonly controller: TwinStickController;
  private readonly superSystem: SuperSystem;
  private readonly brawler: IBrawler;
  private readonly mode: IGameMode;
  private readonly brawlerLevel: number;
  private targetSpeedMultiplier: number;
  private readonly requestNextQuestion: () => IQuestion;
  private readonly onHitTelemetry?: (event: IHitTelemetryEvent) => void;
  private readonly onHudStateChange?: (hud: IGameEngineHudSnapshot) => void;
  private readonly onMatchFinished?: (summary: IMatchSummary) => void;

  private rafId: number | null = null;
  private lastTimestamp = 0;
  private running = false;

  private playerX = ARENA_WIDTH * 0.5;
  private playerY = ARENA_HEIGHT * 0.82;
  private playerHp: number;
  private ammoBars = 3;
  private shieldHp = 0;
  private errorShieldRemainingMs = 0;
  private penaltyCooldownMs = 0;
  private consecutiveCorrectHits = 0;
  private comboMultiplier = 1.0;

  private remainingSeconds: number;
  private objectiveScore = 0;
  private correctHits = 0;
  private totalShotsHit = 0;
  private lastDamageDealt = 0;

  private currentQuestion!: IQuestion;
  private questionShownAtMs = 0;
  private targets: ITargetEntity[] = [];
  private projectiles: IActiveProjectile[] = [];
  private obstacles: IRenderObstacle[] = [];
  private flashBubble: IRenderFlashBubble | null = null;

  private turretPos: IRenderVec2 | null = null;
  private turretRemainingMs = 0;
  private compassTargetPos: IRenderVec2 | null = null;
  private compassRemainingMs = 0;
  private laserSweepY = 90;
  private laserDir = 1;
  private shrinkRadius = 460;

  constructor(options: IGameEngineOptions) {
    this.renderer = new IsometricRenderer(options.canvas);
    this.superSystem = new SuperSystem();
    this.brawler = options.brawler;
    this.mode = options.mode;
    this.brawlerLevel = options.brawlerLevel ?? 1;
    this.targetSpeedMultiplier = options.targetSpeedMultiplier ?? 1.0;
    this.requestNextQuestion = options.requestNextQuestion;
    this.onHitTelemetry = options.onHitTelemetry;
    this.onHudStateChange = options.onHudStateChange;
    this.onMatchFinished = options.onMatchFinished;

    this.playerHp = this.brawler.base_hp;
    this.remainingSeconds = this.mode.duration_seconds;

    this.controller = new TwinStickController(
      options.canvas,
      (sx, sy) => this.renderer.screenToWorld(sx, sy),
      () => ({ x: this.playerX, y: this.playerY })
    );

    this.setupModeObstacles();
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

  private readonly handleResize = (): void => {
    this.renderer.resizeToContainer();
  };

  private readonly loop = (now: number): void => {
    if (!this.running) return;
    const rawDt = (now - this.lastTimestamp) / 1000;
    const dt = Math.min(0.05, Math.max(0.001, rawDt));
    this.lastTimestamp = now;

    this.update(dt, now);
    this.draw();

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

    // Condition de victoire rapide selon mode
    if (this.mode.id === 'CHASSE_AUX_BONNES_NOTES' && this.objectiveScore >= 10) {
      this.finishMatch();
      return;
    }
    if (this.mode.id === 'MATCH_DES_ACCORDS' && this.objectiveScore >= 2) {
      this.finishMatch();
      return;
    }

    // Recharge munitions (3 barres max)
    this.ammoBars = Math.min(this.brawler.max_ammo_bars, this.ammoBars + dt * 0.72);

    // Cooldowns & boucliers
    if (this.errorShieldRemainingMs > 0) {
      this.errorShieldRemainingMs = Math.max(0, this.errorShieldRemainingMs - dtMs);
    }
    if (this.penaltyCooldownMs > 0) {
      this.penaltyCooldownMs = Math.max(0, this.penaltyCooldownMs - dtMs);
    }
    if (this.flashBubble) {
      this.flashBubble.remainingMs -= dtMs;
      if (this.flashBubble.remainingMs <= 0) {
        this.flashBubble = null;
      }
    }

    // Tourelle de Léo (Le Grand Robert : soin 400 PV/s)
    if (this.turretRemainingMs > 0) {
      this.turretRemainingMs = Math.max(0, this.turretRemainingMs - dtMs);
      this.playerHp = Math.min(this.brawler.base_hp, this.playerHp + 400 * dt);
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

    // Déplacement du joueur (ralenti si pénalité 1,5s active)
    const move = this.controller.getMoveVector();
    const speedFactor = this.penaltyCooldownMs > 0 ? 0.55 : 1.0;
    const worldSpeed = this.brawler.speed_value * 0.34 * speedFactor;
    this.playerX = Math.max(36, Math.min(ARENA_WIDTH - 36, this.playerX + move.x * worldSpeed * dt));
    this.playerY = Math.max(60, Math.min(ARENA_HEIGHT - 36, this.playerY + move.y * worldSpeed * dt));

    // Commandes Tir / Super / Gadget
    const fireCmd = this.controller.consumeFireCommand();
    if (fireCmd && this.ammoBars >= 1) {
      this.ammoBars -= 1;
      this.spawnPlayerProjectiles(fireCmd.angle);
    }

    if (this.controller.consumeSuperCommand()) {
      this.executeSuper();
    }

    if (this.controller.consumeGadgetCommand()) {
      this.executeGadget();
    }

    // Déplacement des cibles
    for (const target of this.targets) {
      if (target.hp <= 0) continue;
      if (target.highlightedMs > 0) target.highlightedMs = Math.max(0, target.highlightedMs - dtMs);
      if (target.frozenMs > 0) {
        target.frozenMs = Math.max(0, target.frozenMs - dtMs);
        continue;
      }
      let tSpeedScale = this.targetSpeedMultiplier;
      if (target.slowedMs > 0) {
        target.slowedMs = Math.max(0, target.slowedMs - dtMs);
        tSpeedScale *= 0.5;
      }

      target.x += target.vx * tSpeedScale * dt;
      target.y += target.vy * tSpeedScale * dt;

      if (target.x < 70 || target.x > ARENA_WIDTH - 70) {
        target.vx *= -1;
        target.x = Math.max(70, Math.min(ARENA_WIDTH - 70, target.x));
      }
      if (target.y < 100 || target.y > ARENA_HEIGHT * 0.62) {
        target.vy *= -1;
        target.y = Math.max(100, Math.min(ARENA_HEIGHT * 0.62, target.y));
      }
    }

    // Mode 3 : rétrécissement de la Sonnerie de Fin d'Heure
    if (this.mode.id === 'INTERRO_SURPRISE') {
      const progress = 1 - this.remainingSeconds / this.mode.duration_seconds;
      this.shrinkRadius = Math.max(170, 460 - progress * 260);
    }

    // Mode 5 : mur laser du Conseil de Classe
    if (this.mode.id === 'CONSEIL_DE_CLASSE') {
      this.laserSweepY += this.laserDir * 110 * dt;
      if (this.laserSweepY > ARENA_HEIGHT - 80 || this.laserSweepY < 90) {
        this.laserDir *= -1;
      }
    }

    // Mise à jour des projectiles & détection d'impact
    this.updateProjectiles(dt, nowMs);

    // Publication vers HUD HTML
    this.emitHudState();
  }

  private spawnPlayerProjectiles(angle: number): void {
    const count = this.brawler.basic_attack.projectiles_count;
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
      const offsetAngle = count === 2 ? (i === 0 ? -0.05 : 0.05) : 0;
      const finalAngle = angle + offsetAngle;
      this.projectiles.push({
        x: this.playerX + Math.cos(finalAngle) * 18,
        y: this.playerY + Math.sin(finalAngle) * 18,
        vx: Math.cos(finalAngle) * speed,
        vy: Math.sin(finalAngle) * speed,
        radius: this.brawler.id === 'MAYA' ? 14 : 9,
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
        proj.heightZ = 14 + Math.sin(progress * Math.PI) * 48;
      }

      if (
        proj.distanceTraveled >= proj.maxRange ||
        proj.x < 0 ||
        proj.x > ARENA_WIDTH ||
        proj.y < 0 ||
        proj.y > ARENA_HEIGHT
      ) {
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
          if (!proj.isRebounding) {
            continue;
          }
        }
      }

      remaining.push(proj);
    }

    this.projectiles = remaining;
  }

  private handleTargetHit(target: ITargetEntity, proj: IActiveProjectile, nowMs: number): void {
    const reactionTimeMs = Math.max(150, Math.round(nowMs - this.questionShownAtMs));
    this.totalShotsHit += 1;

    const impact = computeCombatImpact({
      base_damage: this.brawler.basic_attack.base_damage,
      brawler_level: this.brawlerLevel,
      consecutive_correct_hits: this.consecutiveCorrectHits,
      is_correct: target.isCorrect,
      reaction_time_ms: reactionTimeMs,
      player_max_hp: this.brawler.base_hp,
    });

    this.onHitTelemetry?.({
      question: this.currentQuestion,
      isCorrect: target.isCorrect,
      reactionTimeMs,
      impact,
    });

    if (target.isCorrect) {
      target.hp = Math.max(0, target.hp - impact.final_damage);
      this.lastDamageDealt = impact.final_damage;
      this.consecutiveCorrectHits += 1;
      this.comboMultiplier = impact.combo_multiplier;
      this.correctHits += 1;
      this.superSystem.addSuperCharge(impact.super_charge_gain_pct);

      if (target.hp <= 0) {
        this.objectiveScore += 1;
        this.flashBubble = {
          text: `✔ Bravo ! +${impact.final_damage} (${impact.super_charge_gain_pct}% Super)`,
          x: target.x,
          y: target.y,
          remainingMs: 950,
          isPositive: true,
        };
        this.spawnNextQuestionWave();
      } else {
        this.flashBubble = {
          text: `-${impact.final_damage} PV !`,
          x: target.x,
          y: target.y,
          remainingMs: 700,
          isPositive: true,
        };
      }
      return;
    }

    // Cible erronée : rebond métallique, reset combo, pénalité 12% PV_max + bulle corrective 1,2s
    proj.isRebounding = true;
    proj.vx = -proj.vx * 0.65;
    proj.vy = -proj.vy * 0.65;
    proj.maxRange = proj.distanceTraveled + 80;

    this.consecutiveCorrectHits = 0;
    this.comboMultiplier = 1.0;

    if (this.errorShieldRemainingMs <= 0) {
      const dmgAfterShield = Math.max(0, impact.error_penalty_damage - this.shieldHp);
      this.shieldHp = Math.max(0, this.shieldHp - impact.error_penalty_damage);
      this.playerHp = Math.max(100, this.playerHp - dmgAfterShield);
      this.penaltyCooldownMs = ERROR_PENALTY_COOLDOWN_MS;
      this.errorShieldRemainingMs = ERROR_SHIELD_DURATION_MS;
    }

    this.flashBubble = {
      text: this.currentQuestion.explanation_flash,
      x: target.x,
      y: target.y,
      remainingMs: impact.trigger_explanation_flash_ms,
      isPositive: false,
    };
  }

  private executeSuper(): void {
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

    this.objectiveScore += result.bonusObjectivePoints;
    this.correctHits += 1;
    this.flashBubble = {
      text: `⚡ ${result.superName} ! +${result.bonusObjectivePoints} pts`,
      x: this.playerX,
      y: this.playerY,
      remainingMs: 1200,
      isPositive: true,
    };

    this.spawnNextQuestionWave();
  }

  private executeGadget(): void {
    const result = this.superSystem.triggerGadget(this.brawler, this.targets);
    if (!result) return;

    if (result.compassTargetPos) {
      this.compassTargetPos = result.compassTargetPos;
      this.compassRemainingMs = result.durationMs;
    }

    this.flashBubble = {
      text: `🟢 ${result.gadgetName} (${result.remainingCharges} restants)`,
      x: this.playerX,
      y: this.playerY,
      remainingMs: 1000,
      isPositive: true,
    };
  }

  private spawnNextQuestionWave(): void {
    this.currentQuestion = this.requestNextQuestion();
    this.questionShownAtMs = performance.now();

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
      const speedX = ((idx % 2 === 0 ? 1 : -1) * (42 + idx * 11));
      const speedY = idx % 2 === 0 ? 22 : -22;

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
      };
    });
  }

  private setupModeObstacles(): void {
    if (this.mode.id === 'MATCH_DES_ACCORDS') {
      this.obstacles = [
        { x: 140, y: 26, width: 220, height: 55, kind: 'goal_left', label: 'CAGE A' },
        { x: 600, y: 26, width: 220, height: 55, kind: 'goal_right', label: 'CAGE B' },
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

  private draw(): void {
    const objectiveLabel =
      this.mode.id === 'MATCH_DES_ACCORDS'
        ? 'Buts'
        : this.mode.id === 'CHASSE_AUX_BONNES_NOTES'
          ? 'Cristaux'
          : 'Score';

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
        maxHp: this.brawler.base_hp,
        ammoBars: this.ammoBars,
        maxAmmoBars: this.brawler.max_ammo_bars,
        superGaugePct: this.superSystem.getSuperGaugePct(),
        gadgetCharges: this.superSystem.getGadgetChargesLeft(),
        shieldHp: this.shieldHp,
        errorShieldRemainingMs: this.errorShieldRemainingMs,
        penaltyCooldownMs: this.penaltyCooldownMs,
        comboMultiplier: this.comboMultiplier,
      },
      targets: this.targets.filter((t) => t.hp > 0).map((t) => ({
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
      })),
      projectiles: this.projectiles,
      obstacles: this.obstacles,
      hudPrompt: this.currentQuestion?.hud_prompt ?? '',
      objectiveScore: this.objectiveScore,
      objectiveLabel,
      remainingSeconds: this.remainingSeconds,
      shrinkRadius: this.mode.id === 'INTERRO_SURPRISE' ? this.shrinkRadius : undefined,
      laserSweepY: this.mode.id === 'CONSEIL_DE_CLASSE' ? this.laserSweepY : undefined,
      turretPos: this.turretPos,
      compassTargetPos: this.compassTargetPos,
      flashBubble: this.flashBubble,
      leftStick: this.controller.getLeftStickRender(),
      rightStick: this.controller.getRightStickRender(),
    });
  }

  private emitHudState(): void {
    this.onHudStateChange?.({
      remainingSeconds: this.remainingSeconds,
      objectiveScore: this.objectiveScore,
      hp: Math.round(this.playerHp),
      maxHp: this.brawler.base_hp,
      ammoBars: Math.floor(this.ammoBars),
      superGaugePct: Math.round(this.superSystem.getSuperGaugePct()),
      gadgetCharges: this.superSystem.getGadgetChargesLeft(),
      comboMultiplier: this.comboMultiplier,
      hudPrompt: this.currentQuestion?.hud_prompt ?? '',
      lastDamageDealt: this.lastDamageDealt,
    });
  }

  private finishMatch(): void {
    this.stop();
    const played = Math.round(this.mode.duration_seconds - this.remainingSeconds);
    const victory = this.objectiveScore >= 2 || this.correctHits >= 3;
    const starsEarned = victory ? (this.objectiveScore >= 6 ? 3 : 2) : 1;

    this.onMatchFinished?.({
      modeId: this.mode.id,
      brawlerId: this.brawler.id,
      victory,
      objectiveScore: this.objectiveScore,
      correctHits: this.correctHits,
      totalShotsHit: this.totalShotsHit,
      starsEarned,
      durationPlayedSec: played,
    });
  }
}
