import type {
  CampusRoomId,
  GameModeId,
  IAccessibilitySettings,
  IBrawler,
  ICampusNpc,
  ICampusQuest,
  ICampusRoomZone,
  ICombatImpactResult,
  IQuestion,
  IQuestObjective,
  IQuestProgressRecord,
  IQuestStepAdvanceResult,
  SubjectCategory,
} from '../types/cctp';
import {
  computeCombatImpact,
  ERROR_PENALTY_COOLDOWN_MS,
  ERROR_SHIELD_DURATION_MS,
} from './CombatMath';
import {
  IsometricRenderer,
  type IRenderCampusBadge,
  type IRenderCampusNpc,
  type IRenderFlashBubble,
  type IRenderMinimapState,
  type IRenderObstacle,
  type IRenderProjectile,
  type IRenderQuestBanner,
  type IRenderVec2,
} from './IsometricRenderer';
import { SuperSystem, type ITargetEntity } from './SuperSystem';
import { TwinStickController } from './TwinStickController';

export interface ICampusBadgeSpawn {
  id: string;
  room_id: CampusRoomId;
  x: number;
  y: number;
  label: string;
}

export interface ICampusWorldData {
  width: number;
  height: number;
  spawnPoint: { x: number; y: number };
  rooms: ICampusRoomZone[];
  obstacles: IRenderObstacle[];
  npcs: ICampusNpc[];
  badges: ICampusBadgeSpawn[];
  getRoomAtPosition: (x: number, y: number) => ICampusRoomZone | undefined;
  getRoomById: (id: CampusRoomId) => ICampusRoomZone;
}

export interface ICampusQuestService {
  getActiveQuest: () => {
    quest: ICampusQuest;
    progress: IQuestProgressRecord;
    activeObjective: IQuestObjective;
  } | null;
  notifyRoomEntered: (roomId: CampusRoomId) => IQuestStepAdvanceResult;
  notifyNpcInteracted: (npcId: string, roomId: CampusRoomId) => IQuestStepAdvanceResult;
  notifyRoomQuestionSolved: (
    roomId: CampusRoomId,
    subject: SubjectCategory
  ) => IQuestStepAdvanceResult;
  notifyCampusBadgeCollected: (roomId: CampusRoomId) => IQuestStepAdvanceResult;
}

export interface ICampusHitTelemetryEvent {
  question: IQuestion;
  isCorrect: boolean;
  reactionTimeMs: number;
  impact: ICombatImpactResult;
  roomId: CampusRoomId | null;
}

export interface ICampusHudSnapshot {
  hp: number;
  maxHp: number;
  ammoBars: number;
  superGaugePct: number;
  gadgetCharges: number;
  comboMultiplier: number;
  hudPrompt: string;
  lastDamageDealt: number;
  currentRoomId: CampusRoomId | null;
  currentRoomName: string;
  currentFloorLabel: string;
  nearbyNpc: ICampusNpc | null;
  activeQuestTitle: string;
  activeObjectiveText: string;
  activeObjectiveProgress: string;
  badgesCollected: number;
  totalBadges: number;
  questionsSolved: number;
}

export interface ICampusEngineOptions {
  canvas: HTMLCanvasElement;
  brawler: IBrawler;
  world: ICampusWorldData;
  questService: ICampusQuestService;
  brawlerLevel?: number;
  targetSpeedMultiplier?: number;
  accessibility?: IAccessibilitySettings;
  modeId?: GameModeId;
  initialCollectedBadgeIds?: string[];
  requestNextQuestion: (subject?: SubjectCategory) => IQuestion;
  onHitTelemetry?: (event: ICampusHitTelemetryEvent) => void;
  onHudStateChange?: (hud: ICampusHudSnapshot) => void;
  onQuestStepAdvanced?: (result: IQuestStepAdvanceResult) => void;
  onBadgeCollected?: (coinsGranted: number, badge?: ICampusBadgeSpawn) => void;
  onNpcArenaRequested?: (npc: ICampusNpc) => void;
}

interface IActiveProjectile extends IRenderProjectile {
  distanceTraveled: number;
  maxRange: number;
  isRebounding: boolean;
  hitTargetIds: Set<string>;
}

interface IRoomBoundsRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PLAYER_RADIUS = 16;
const BADGE_PICKUP_RADIUS = 38;

/**
 * Moteur d'exploration libre du Collège 60 FPS (Jalon M4 - Ticket #21) :
 * - Déplacement double stick / ZQSD sur carte 2400×1800 avec collisions glissantes
 * - Détection de salles, vagues pédagogiques contextuelles et nettoyage en sortie de salle
 * - Interaction PNJ de proximité, badges collectables, boussole et mini-carte radar
 */
export class CampusEngine {
  private readonly renderer: IsometricRenderer;
  private readonly controller: TwinStickController;
  private readonly superSystem: SuperSystem;
  private readonly brawler: IBrawler;
  private readonly world: ICampusWorldData;
  private readonly questService: ICampusQuestService;
  private readonly brawlerLevel: number;
  private readonly modeId: GameModeId;
  private targetSpeedMultiplier: number;
  private readonly accessibility: IAccessibilitySettings;

  private readonly requestNextQuestion: (subject?: SubjectCategory) => IQuestion;
  private readonly onHitTelemetry?: (event: ICampusHitTelemetryEvent) => void;
  private readonly onHudStateChange?: (hud: ICampusHudSnapshot) => void;
  private readonly onQuestStepAdvanced?: (result: IQuestStepAdvanceResult) => void;
  private readonly onBadgeCollected?: (coinsGranted: number, badge?: ICampusBadgeSpawn) => void;
  private readonly onNpcArenaRequested?: (npc: ICampusNpc) => void;

  private rafId: number | null = null;
  private lastTimestamp = 0;
  private running = false;
  private elapsedSeconds = 0;

  private playerX: number;
  private playerY: number;
  private playerHp: number;
  private ammoBars = 3;
  private shieldHp = 0;
  private errorShieldRemainingMs = 0;
  private penaltyCooldownMs = 0;
  private consecutiveCorrectHits = 0;
  private comboMultiplier = 1.0;

  private objectiveScore = 0;
  private questionsSolved = 0;
  private lastDamageDealt = 0;

  private currentRoomId: CampusRoomId | null = null;
  private nearbyNpc: ICampusNpc | null = null;
  private lastAutoInteractedNpcId: string | null = null;
  private readonly collectedBadgeIds: Set<string>;

  private currentQuestion: IQuestion | null = null;
  private questionShownAtMs = 0;
  private activeWaveBounds: IRoomBoundsRect | null = null;
  private targets: ITargetEntity[] = [];
  private projectiles: IActiveProjectile[] = [];
  private flashBubble: IRenderFlashBubble | null = null;

  private turretPos: IRenderVec2 | null = null;
  private turretRemainingMs = 0;
  private gadgetCompassPos: IRenderVec2 | null = null;
  private gadgetCompassRemainingMs = 0;

  constructor(options: ICampusEngineOptions) {
    this.renderer = new IsometricRenderer(options.canvas);
    this.superSystem = new SuperSystem();
    this.brawler = options.brawler;
    this.world = options.world;
    this.questService = options.questService;
    this.brawlerLevel = options.brawlerLevel ?? 1;
    this.modeId = options.modeId ?? 'CHANGEMENT_DE_SALLE';
    this.targetSpeedMultiplier = options.targetSpeedMultiplier ?? 1.0;
    this.accessibility = {
      smart_auto_aim: options.accessibility?.smart_auto_aim ?? true,
      visual_gps_compass: options.accessibility?.visual_gps_compass ?? true,
      calm_mode: options.accessibility?.calm_mode ?? false,
      auto_hint_assist: options.accessibility?.auto_hint_assist ?? true,
      onboarding_seen: options.accessibility?.onboarding_seen ?? true,
    };
    this.collectedBadgeIds = new Set<string>(options.initialCollectedBadgeIds ?? []);

    this.requestNextQuestion = options.requestNextQuestion;
    this.onHitTelemetry = options.onHitTelemetry;
    this.onHudStateChange = options.onHudStateChange;
    this.onQuestStepAdvanced = options.onQuestStepAdvanced;
    this.onBadgeCollected = options.onBadgeCollected;
    this.onNpcArenaRequested = options.onNpcArenaRequested;

    this.playerHp = this.brawler.base_hp;
    const initialPos = this.resolveWallCollisions(
      this.world.spawnPoint.x,
      this.world.spawnPoint.y,
      PLAYER_RADIUS
    );
    this.playerX = initialPos.x;
    this.playerY = initialPos.y;

    this.controller = new TwinStickController(
      options.canvas,
      (sx, sy) => this.renderer.screenToWorld(sx, sy),
      () => ({ x: this.playerX, y: this.playerY }),
      (sx, sy) => this.findTargetAtScreenPos(sx, sy)
    );
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

    const startRoom = this.world.getRoomAtPosition(this.playerX, this.playerY);
    if (startRoom) {
      this.handleRoomTransition(startRoom);
    }

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    this.lastTimestamp = performance.now();
    this.emitHudState();
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
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  public refreshQuestOverlay(): void {
    const currentRoom = this.world.getRoomAtPosition(this.playerX, this.playerY);
    if (currentRoom && this.targets.length === 0 && this.shouldRoomHaveTargets(currentRoom)) {
      this.spawnWaveInRoom(currentRoom);
    }
    this.emitHudState();
    if (this.running) {
      this.draw();
    }
  }

  public triggerSuperFromUI(): void {
    this.controller.requestSuper();
  }

  public triggerGadgetFromUI(): void {
    this.controller.requestGadget();
  }

  public triggerInteractFromUI(): void {
    const npc = this.findNearestNpc(16);
    if (!npc) {
      this.flashBubble = {
        text: "Approche-toi d'un professeur ou d'une borne !",
        x: this.playerX,
        y: this.playerY,
        remainingMs: 1200,
        isPositive: true,
      };
      return;
    }

    const questRes = this.questService.notifyNpcInteracted(npc.id, npc.room_id);
    if (questRes.advanced || questRes.questCompleted) {
      this.handleQuestResult(questRes, npc.x, npc.y);
      this.refreshQuestOverlay();
      return;
    }

    if (npc.linked_arena_mode) {
      if (this.onNpcArenaRequested) {
        this.onNpcArenaRequested(npc);
      } else {
        this.flashBubble = {
          text: npc.greeting_flash,
          x: npc.x,
          y: npc.y,
          remainingMs: 1600,
          isPositive: true,
        };
        this.spawnChallengeInCurrentRoom();
      }
      return;
    }

    this.flashBubble = {
      text: npc.greeting_flash,
      x: npc.x,
      y: npc.y,
      remainingMs: 1600,
      isPositive: true,
    };
  }

  public spawnChallengeInCurrentRoom(): void {
    const room = this.world.getRoomAtPosition(this.playerX, this.playerY);
    if (room) {
      this.spawnWaveInRoom(room);
      this.flashBubble = {
        text: `🎯 Défi lancé en ${room.name} !`,
        x: this.playerX,
        y: this.playerY,
        remainingMs: 1200,
        isPositive: true,
      };
      return;
    }

    // Zone temporaire autour du joueur s'il est dans un couloir
    const zoneW = Math.min(360, this.world.width - 80);
    const zoneH = Math.min(280, this.world.height - 80);
    const localBounds: IRoomBoundsRect = {
      x: Math.max(40, Math.min(this.world.width - zoneW - 40, this.playerX - zoneW * 0.5)),
      y: Math.max(40, Math.min(this.world.height - zoneH - 40, this.playerY - zoneH * 0.5)),
      width: zoneW,
      height: zoneH,
    };
    const active = this.questService.getActiveQuest();
    const subject = active?.activeObjective.subject ?? this.brawler.favorite_subject;
    this.spawnWaveInBounds(localBounds, subject);
  }

  public teleportToRoom(roomId: CampusRoomId): void {
    const room = this.world.getRoomById(roomId);
    const center = this.resolveWallCollisions(
      room.bounds.x + room.bounds.width * 0.5,
      room.bounds.y + room.bounds.height * 0.5,
      PLAYER_RADIUS
    );
    this.playerX = center.x;
    this.playerY = center.y;
    this.projectiles = [];
    this.lastAutoInteractedNpcId = null;

    this.handleRoomTransition(room);
    this.emitHudState();
  }

  public teleportToActiveQuestObjective(): boolean {
    const active = this.questService.getActiveQuest();
    if (!active?.activeObjective) {
      return false;
    }

    const obj = active.activeObjective;
    const targetNpc = obj.target_npc_id
      ? this.world.npcs.find((n) => n.id === obj.target_npc_id)
      : undefined;

    if (targetNpc) {
      const safePos = this.resolveWallCollisions(targetNpc.x, targetNpc.y + 46, PLAYER_RADIUS);
      this.playerX = safePos.x;
      this.playerY = safePos.y;
      this.projectiles = [];
      this.lastAutoInteractedNpcId = null;

      const room = this.world.getRoomAtPosition(this.playerX, this.playerY);
      if (room && room.id !== this.currentRoomId) {
        this.handleRoomTransition(room);
      } else if (!room && this.currentRoomId !== null) {
        this.currentRoomId = null;
        this.clearRoomTargets();
      }
      this.nearbyNpc = this.findNearestNpc(0);
      this.emitHudState();
    } else {
      this.teleportToRoom(obj.target_room_id);
    }

    this.renderer.spawnSuperShockwave(this.playerX, this.playerY, 0x38bdf8);
    this.flashBubble = {
      text: "🚀 Arrivée directe à l'objectif !",
      x: this.playerX,
      y: this.playerY,
      remainingMs: 1600,
      isPositive: true,
    };
    return true;
  }

  /**
   * Collisions cercle-rectangle glissantes contre les murs ('wall') et bureaux ('desk').
   * Les zones 'safe_zone' et 'bush' laissent circuler librement.
   */
  public resolveWallCollisions(x: number, y: number, radius = PLAYER_RADIUS): IRenderVec2 {
    let px = Math.max(radius + 8, Math.min(this.world.width - radius - 8, x));
    let py = Math.max(radius + 8, Math.min(this.world.height - radius - 8, y));

    for (let pass = 0; pass < 2; pass++) {
      for (const obs of this.world.obstacles) {
        if (obs.kind !== 'wall' && obs.kind !== 'desk') {
          continue;
        }
        const closestX = Math.max(obs.x, Math.min(px, obs.x + obs.width));
        const closestY = Math.max(obs.y, Math.min(py, obs.y + obs.height));
        const dx = px - closestX;
        const dy = py - closestY;
        const distSq = dx * dx + dy * dy;

        if (distSq < radius * radius) {
          if (distSq > 1e-6) {
            const dist = Math.sqrt(distSq);
            const overlap = radius - dist;
            px += (dx / dist) * overlap;
            py += (dy / dist) * overlap;
          } else {
            const dLeft = px - obs.x;
            const dRight = obs.x + obs.width - px;
            const dTop = py - obs.y;
            const dBottom = obs.y + obs.height - py;
            const minD = Math.min(dLeft, dRight, dTop, dBottom);
            if (minD === dLeft) px = obs.x - radius;
            else if (minD === dRight) px = obs.x + obs.width + radius;
            else if (minD === dTop) py = obs.y - radius;
            else py = obs.y + obs.height + radius;
          }
        }
      }
    }

    px = Math.max(radius + 8, Math.min(this.world.width - radius - 8, px));
    py = Math.max(radius + 8, Math.min(this.world.height - radius - 8, py));
    return { x: px, y: py };
  }

  private readonly handleResize = (): void => {
    this.renderer.resizeToContainer();
  };

  private readonly handleKeyDown = (ev: KeyboardEvent): void => {
    if (ev.code === 'Enter') {
      this.triggerInteractFromUI();
    }
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
    this.elapsedSeconds += dt;

    // Recharge munitions (3 barres max)
    this.ammoBars = Math.min(this.brawler.max_ammo_bars, this.ammoBars + dt * 0.72);

    // Cooldowns, boucliers et régénération douce hors pénalité
    if (this.errorShieldRemainingMs > 0) {
      this.errorShieldRemainingMs = Math.max(0, this.errorShieldRemainingMs - dtMs);
    }
    if (this.penaltyCooldownMs > 0) {
      this.penaltyCooldownMs = Math.max(0, this.penaltyCooldownMs - dtMs);
    } else if (this.playerHp < this.brawler.base_hp) {
      this.playerHp = Math.min(this.brawler.base_hp, this.playerHp + 45 * dt);
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

    // Boussole temporaire de Maya
    if (this.gadgetCompassRemainingMs > 0) {
      this.gadgetCompassRemainingMs = Math.max(0, this.gadgetCompassRemainingMs - dtMs);
      if (this.gadgetCompassRemainingMs <= 0) {
        this.gadgetCompassPos = null;
      }
    }

    // Déplacement fluide avec collisions glissantes contre murs/bureaux
    const move = this.controller.getMoveVector();
    const speedFactor = this.penaltyCooldownMs > 0 ? 0.55 : 1.0;
    const worldSpeed = this.brawler.speed_value * 0.38 * speedFactor;
    const resolved = this.resolveWallCollisions(
      this.playerX + move.x * worldSpeed * dt,
      this.playerY + move.y * worldSpeed * dt,
      PLAYER_RADIUS
    );
    this.playerX = resolved.x;
    this.playerY = resolved.y;

    // Détection de salle courante et gestion des vagues contextuelles
    const currentRoom = this.world.getRoomAtPosition(this.playerX, this.playerY);
    if (currentRoom) {
      if (currentRoom.id !== this.currentRoomId) {
        this.handleRoomTransition(currentRoom);
      } else if (this.targets.length === 0 && this.shouldRoomHaveTargets(currentRoom)) {
        this.spawnWaveInRoom(currentRoom);
      }
    } else if (this.currentRoomId !== null) {
      this.currentRoomId = null;
      this.clearRoomTargets();
    }

    // Proximité PNJ
    this.updateNpcProximity();

    // Ramassage des badges du collège
    this.updateBadgePickups();

    // Commandes Tir / Super / Gadget
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
      this.executeSuper();
    }

    if (this.controller.consumeGadgetCommand()) {
      this.executeGadget();
    }

    // Mouvement des cibles dans la salle courante
    this.updateTargets(dt, dtMs);

    // Mise à jour des projectiles & impacts
    this.updateProjectiles(dt, nowMs);

    // Publication HUD
    this.emitHudState();
  }

  private handleRoomTransition(room: ICampusRoomZone): void {
    this.currentRoomId = room.id;
    const questRes = this.questService.notifyRoomEntered(room.id);

    if (questRes.advanced || questRes.questCompleted) {
      this.handleQuestResult(questRes, this.playerX, this.playerY);
    } else {
      this.flashBubble = {
        text: `🏫 ${room.name} • ${room.floor_label}`,
        x: this.playerX,
        y: this.playerY,
        remainingMs: 1400,
        isPositive: true,
      };
    }

    if (this.shouldRoomHaveTargets(room)) {
      this.spawnWaveInRoom(room);
    } else {
      this.clearRoomTargets();
    }
  }

  private shouldRoomHaveTargets(room: ICampusRoomZone): boolean {
    if (room.subject) return true;
    const active = this.questService.getActiveQuest();
    return Boolean(
      active?.activeObjective &&
        active.activeObjective.type === 'SOLVE_ROOM_QUESTIONS' &&
        active.activeObjective.target_room_id === room.id
    );
  }

  private resolveRoomSubject(room: ICampusRoomZone): SubjectCategory {
    const active = this.questService.getActiveQuest();
    if (
      active?.activeObjective &&
      active.activeObjective.target_room_id === room.id &&
      active.activeObjective.subject
    ) {
      return active.activeObjective.subject;
    }
    return room.subject ?? this.brawler.favorite_subject;
  }

  private clearRoomTargets(): void {
    this.targets = [];
    this.currentQuestion = null;
    this.activeWaveBounds = null;
  }

  private spawnWaveInRoom(room: ICampusRoomZone): void {
    const subject = this.resolveRoomSubject(room);
    this.spawnWaveInBounds(room.bounds, subject);
  }

  private spawnWaveInBounds(bounds: IRoomBoundsRect, subject: SubjectCategory): void {
    this.currentQuestion = this.requestNextQuestion(subject);
    this.questionShownAtMs = performance.now();
    this.activeWaveBounds = bounds;

    const allTargets = this.currentQuestion.targets;
    const chosenTargets = allTargets.slice(0, 4);
    if (chosenTargets.length > 0 && !chosenTargets.some((t) => t.is_correct)) {
      const correctItem = allTargets.find((t) => t.is_correct);
      if (correctItem) {
        chosenTargets[chosenTargets.length - 1] = correctItem;
      }
    }

    const marginX = Math.min(62, bounds.width * 0.2);
    const marginY = Math.min(62, bounds.height * 0.22);
    const minX = bounds.x + marginX;
    const maxX = bounds.x + bounds.width - marginX;
    const minY = bounds.y + marginY;
    const maxY = bounds.y + bounds.height - marginY;

    const count = Math.max(1, chosenTargets.length);
    const spanX = Math.max(40, maxX - minX);
    const spanY = Math.max(40, maxY - minY);

    this.targets = chosenTargets.map((item, idx) => {
      const ratioX = count === 1 ? 0.5 : idx / (count - 1);
      const rawX = minX + ratioX * spanX;
      const rawY = minY + (idx % 2 === 0 ? 0.28 : 0.72) * spanY;
      const pos = this.findFreeTargetPosition(rawX, rawY, minX, maxX, minY, maxY);

      const baseHp = Math.min(
        950,
        this.brawler.basic_attack.base_damage * this.brawler.basic_attack.projectiles_count
      );
      const speedX = (idx % 2 === 0 ? 1 : -1) * (36 + idx * 9);
      const speedY = idx % 2 === 0 ? 22 : -22;

      return {
        id: `${this.currentQuestion!.id}_${idx}_${Math.round(this.questionShownAtMs)}`,
        x: pos.x,
        y: pos.y,
        vx: speedX,
        vy: speedY,
        radius: 25,
        label: item.label,
        isCorrect: item.is_correct,
        hp: baseHp,
        maxHp: baseHp,
        highlightedMs: 0,
        frozenMs: 0,
        slowedMs: 0,
      };
    });
  }

  private findFreeTargetPosition(
    rawX: number,
    rawY: number,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number
  ): IRenderVec2 {
    const centerX = (minX + maxX) * 0.5;
    const centerY = (minY + maxY) * 0.5;
    const candidates: IRenderVec2[] = [
      { x: rawX, y: rawY },
      { x: rawX, y: centerY },
      { x: centerX + (rawX - centerX) * 0.5, y: rawY },
      { x: centerX, y: minY + (maxY - minY) * 0.35 },
      { x: centerX, y: minY + (maxY - minY) * 0.65 },
    ];

    for (const c of candidates) {
      const clampedX = Math.max(minX, Math.min(maxX, c.x));
      const clampedY = Math.max(minY, Math.min(maxY, c.y));
      if (!this.isCircleBlockedBySolid(clampedX, clampedY, 26)) {
        return { x: clampedX, y: clampedY };
      }
    }

    return {
      x: Math.max(minX, Math.min(maxX, rawX)),
      y: Math.max(minY, Math.min(maxY, rawY)),
    };
  }

  private isCircleBlockedBySolid(cx: number, cy: number, radius: number): boolean {
    for (const obs of this.world.obstacles) {
      if (obs.kind !== 'wall' && obs.kind !== 'desk') continue;
      const closestX = Math.max(obs.x, Math.min(cx, obs.x + obs.width));
      const closestY = Math.max(obs.y, Math.min(cy, obs.y + obs.height));
      const dx = cx - closestX;
      const dy = cy - closestY;
      if (dx * dx + dy * dy < radius * radius) {
        return true;
      }
    }
    return false;
  }

  private updateTargets(dt: number, dtMs: number): void {
    if (!this.activeWaveBounds) return;

    const bounds = this.activeWaveBounds;
    const marginX = Math.min(54, bounds.width * 0.18);
    const marginY = Math.min(54, bounds.height * 0.2);
    const minX = bounds.x + marginX;
    const maxX = bounds.x + bounds.width - marginX;
    const minY = bounds.y + marginY;
    const maxY = bounds.y + bounds.height - marginY;

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

      const prevX = target.x;
      const prevY = target.y;
      target.x += target.vx * tSpeedScale * dt;
      target.y += target.vy * tSpeedScale * dt;

      if (target.x < minX || target.x > maxX) {
        target.vx *= -1;
        target.x = Math.max(minX, Math.min(maxX, target.x));
      }
      if (target.y < minY || target.y > maxY) {
        target.vy *= -1;
        target.y = Math.max(minY, Math.min(maxY, target.y));
      }

      if (this.isCircleBlockedBySolid(target.x, target.y, target.radius)) {
        target.x = prevX;
        target.y = prevY;
        target.vx *= -1;
        target.vy *= -1;
      }
    }
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
    return bestPos;
  }

  private resolveAutoAimAngle(
    fallbackAngle: number,
    targetWorldPos?: IRenderVec2,
    allowAutoFallback = true
  ): number {
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

    const maxDist = this.brawler.basic_attack.range + 90;
    let bestTarget: ITargetEntity | null = null;
    let bestDist = maxDist;
    for (const t of this.targets) {
      if (t.hp <= 0) continue;
      const d = Math.hypot(t.x - this.playerX, t.y - this.playerY);
      if (d < bestDist) {
        bestDist = d;
        bestTarget = t;
      }
    }

    if (!bestTarget) return fallbackAngle;
    return Math.atan2(bestTarget.y - this.playerY, bestTarget.x - this.playerX);
  }

  private findNearestNpc(extraMargin = 0): ICampusNpc | null {
    let bestNpc: ICampusNpc | null = null;
    let bestDist = Infinity;

    for (const npc of this.world.npcs) {
      const dist = Math.hypot(this.playerX - npc.x, this.playerY - npc.y);
      if (dist <= npc.interaction_radius + extraMargin && dist < bestDist) {
        bestDist = dist;
        bestNpc = npc;
      }
    }
    return bestNpc;
  }

  private updateNpcProximity(): void {
    const nearest = this.findNearestNpc(0);
    this.nearbyNpc = nearest;

    if (!nearest) {
      if (this.lastAutoInteractedNpcId) {
        const prevNpc = this.world.npcs.find((n) => n.id === this.lastAutoInteractedNpcId);
        if (!prevNpc || Math.hypot(this.playerX - prevNpc.x, this.playerY - prevNpc.y) > prevNpc.interaction_radius + 24) {
          this.lastAutoInteractedNpcId = null;
        }
      }
      return;
    }

    if (nearest.id !== this.lastAutoInteractedNpcId) {
      this.lastAutoInteractedNpcId = nearest.id;
      const questRes = this.questService.notifyNpcInteracted(nearest.id, nearest.room_id);
      if (questRes.advanced || questRes.questCompleted) {
        this.handleQuestResult(questRes, nearest.x, nearest.y);
      } else {
        this.flashBubble = {
          text: nearest.greeting_flash,
          x: nearest.x,
          y: nearest.y,
          remainingMs: 1600,
          isPositive: true,
        };
      }
    }
  }

  private updateBadgePickups(): void {
    for (const badge of this.world.badges) {
      if (this.collectedBadgeIds.has(badge.id)) continue;
      const dist = Math.hypot(this.playerX - badge.x, this.playerY - badge.y);
      if (dist <= BADGE_PICKUP_RADIUS) {
        this.collectedBadgeIds.add(badge.id);
        this.objectiveScore += 1;

        const questRes = this.questService.notifyCampusBadgeCollected(badge.room_id);
        this.onBadgeCollected?.(15, badge);

        if (questRes.advanced || questRes.questCompleted) {
          this.handleQuestResult(questRes, badge.x, badge.y);
        } else {
          this.flashBubble = {
            text: `★ ${badge.label} (+15 🪙)`,
            x: badge.x,
            y: badge.y,
            remainingMs: 1400,
            isPositive: true,
          };
        }
      }
    }
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
        proj.x > this.world.width ||
        proj.y < 0 ||
        proj.y > this.world.height
      ) {
        continue;
      }

      // Les murs bloquent les tirs rasants (Léo tire par-dessus en cloche)
      if (!proj.isLobbed && this.hitsSolidWall(proj.x, proj.y, proj.radius * 0.5)) {
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

  private hitsSolidWall(x: number, y: number, radius: number): boolean {
    for (const obs of this.world.obstacles) {
      if (obs.kind !== 'wall') continue;
      const closestX = Math.max(obs.x, Math.min(x, obs.x + obs.width));
      const closestY = Math.max(obs.y, Math.min(y, obs.y + obs.height));
      const dx = x - closestX;
      const dy = y - closestY;
      if (dx * dx + dy * dy <= radius * radius) {
        return true;
      }
    }
    return false;
  }

  private handleTargetHit(target: ITargetEntity, proj: IActiveProjectile, nowMs: number): void {
    if (!this.currentQuestion) return;
    const reactionTimeMs = Math.max(150, Math.round(nowMs - this.questionShownAtMs));

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
      roomId: this.currentRoomId,
    });

    if (target.isCorrect) {
      target.hp = Math.max(0, target.hp - impact.final_damage);
      this.lastDamageDealt = impact.final_damage;
      this.consecutiveCorrectHits += 1;
      this.comboMultiplier = impact.combo_multiplier;
      this.superSystem.addSuperCharge(impact.super_charge_gain_pct);

      if (target.hp <= 0) {
        this.objectiveScore += 1;
        this.questionsSolved += 1;
        const roomId = this.currentRoomId;
        const subject = this.currentQuestion.subject;

        if (roomId) {
          const questRes = this.questService.notifyRoomQuestionSolved(roomId, subject);
          if (questRes.advanced || questRes.questCompleted) {
            this.handleQuestResult(questRes, target.x, target.y);
          } else {
            this.flashBubble = {
              text: `✔ Bravo ! +${impact.final_damage} (${impact.super_charge_gain_pct}% Super)`,
              x: target.x,
              y: target.y,
              remainingMs: 950,
              isPositive: true,
            };
          }
        } else {
          this.flashBubble = {
            text: `✔ Bravo ! +${impact.final_damage}`,
            x: target.x,
            y: target.y,
            remainingMs: 950,
            isPositive: true,
          };
        }

        const room = roomId ? this.world.getRoomById(roomId) : undefined;
        if (room && this.shouldRoomHaveTargets(room)) {
          this.spawnWaveInRoom(room);
        } else {
          this.clearRoomTargets();
        }
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

    // Cible erronée : rebond métallique, reset combo, pénalité 12% PV_max + bulle corrective
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
      const safePos = this.resolveWallCollisions(
        result.newPlayerPos.x,
        result.newPlayerPos.y,
        PLAYER_RADIUS
      );
      this.playerX = safePos.x;
      this.playerY = safePos.y;
    }
    if (result.grantedShieldHp > 0) {
      this.shieldHp += result.grantedShieldHp;
    }
    if (result.spawnTurretAt) {
      this.turretPos = result.spawnTurretAt;
      this.turretRemainingMs = result.durationMs;
    }

    if (result.eliminatedTargetIds.length > 0 && this.currentQuestion) {
      this.objectiveScore += result.bonusObjectivePoints;
      this.questionsSolved += 1;

      if (this.currentRoomId) {
        const questRes = this.questService.notifyRoomQuestionSolved(
          this.currentRoomId,
          this.currentQuestion.subject
        );
        if (questRes.advanced || questRes.questCompleted) {
          this.handleQuestResult(questRes, this.playerX, this.playerY);
        }
        const room = this.world.getRoomById(this.currentRoomId);
        if (this.shouldRoomHaveTargets(room)) {
          this.spawnWaveInRoom(room);
        } else {
          this.clearRoomTargets();
        }
      } else {
        this.clearRoomTargets();
      }
    }

    this.flashBubble = {
      text: `⚡ ${result.superName} !`,
      x: this.playerX,
      y: this.playerY,
      remainingMs: 1200,
      isPositive: true,
    };
  }

  private executeGadget(): void {
    const result = this.superSystem.triggerGadget(this.brawler, this.targets);
    if (!result) return;

    if (result.compassTargetPos) {
      this.gadgetCompassPos = result.compassTargetPos;
      this.gadgetCompassRemainingMs = result.durationMs;
    }

    this.flashBubble = {
      text: `🟢 ${result.gadgetName} (${result.remainingCharges} restants)`,
      x: this.playerX,
      y: this.playerY,
      remainingMs: 1000,
      isPositive: true,
    };
  }

  private handleQuestResult(result: IQuestStepAdvanceResult, x: number, y: number): void {
    this.onQuestStepAdvanced?.(result);
    const label = result.questCompleted
      ? `🏆 Quête terminée : ${result.completedQuest?.title ?? ''} !`
      : result.message ?? '✅ Objectif de quête validé !';
    this.flashBubble = {
      text: label,
      x,
      y,
      remainingMs: 1700,
      isPositive: true,
    };
  }

  private computeQuestCompassTarget(): IRenderVec2 | null {
    const active = this.questService.getActiveQuest();
    if (!active?.activeObjective) {
      return null;
    }
    const obj = active.activeObjective;

    if (obj.target_npc_id) {
      const targetNpc = this.world.npcs.find((n) => n.id === obj.target_npc_id);
      if (targetNpc) {
        return { x: targetNpc.x, y: targetNpc.y };
      }
    }

    if (obj.type === 'COLLECT_CAMPUS_BADGE') {
      const badge = this.world.badges.find(
        (b) => b.room_id === obj.target_room_id && !this.collectedBadgeIds.has(b.id)
      );
      if (badge) {
        return { x: badge.x, y: badge.y };
      }
    }

    const targetRoom = this.world.getRoomById(obj.target_room_id);
    return {
      x: targetRoom.bounds.x + targetRoom.bounds.width * 0.5,
      y: targetRoom.bounds.y + targetRoom.bounds.height * 0.5,
    };
  }

  private buildQuestBanner(): IRenderQuestBanner {
    const currentRoom = this.world.getRoomAtPosition(this.playerX, this.playerY);
    const currentRoomName = currentRoom
      ? `${currentRoom.name} (${currentRoom.floor_label})`
      : 'Couloir Principal';

    const active = this.questService.getActiveQuest();
    if (!active?.activeObjective) {
      return {
        questTitle: 'Exploration Libre',
        objectiveText: 'Toutes les quêtes du collège sont terminées !',
        progressText: '100%',
        currentRoomName,
      };
    }

    const obj = active.activeObjective;
    const progressCount = Math.min(active.progress.current_count, obj.required_count);
    return {
      questTitle: active.quest.title,
      objectiveText: obj.description,
      progressText: `${progressCount}/${obj.required_count}`,
      currentRoomName,
    };
  }

  private draw(): void {
    const active = this.questService.getActiveQuest();
    const targetNpcId = active?.activeObjective?.target_npc_id;
    const objectivePos = this.computeQuestCompassTarget();
    const compassTargetPos =
      (this.gadgetCompassRemainingMs > 0 ? this.gadgetCompassPos : null) ??
      (this.accessibility.visual_gps_compass ? objectivePos : null);

    const campusNpcs: IRenderCampusNpc[] = this.world.npcs.map((npc) => ({
      id: npc.id,
      name: npc.name,
      title: npc.title,
      x: npc.x,
      y: npc.y,
      primaryColor: npc.primary_color,
      accentColor: npc.accent_color,
      hasQuestMarker: targetNpcId === npc.id,
      isPlayerNear: this.nearbyNpc?.id === npc.id,
    }));

    const campusBadges: IRenderCampusBadge[] = this.world.badges
      .filter((b) => !this.collectedBadgeIds.has(b.id))
      .map((b) => ({
        id: b.id,
        x: b.x,
        y: b.y,
        label: b.label,
      }));

    const minimapState: IRenderMinimapState = {
      worldWidth: this.world.width,
      worldHeight: this.world.height,
      rooms: this.world.rooms,
      playerX: this.playerX,
      playerY: this.playerY,
      objectivePos,
      npcs: this.world.npcs.map((npc) => ({
        x: npc.x,
        y: npc.y,
        hasQuest: targetNpcId === npc.id,
      })),
    };

    const questBanner = this.buildQuestBanner();

    this.renderer.render({
      modeId: this.modeId,
      arenaWidth: this.world.width,
      arenaHeight: this.world.height,
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
        isAiming: this.controller.isAiming(),
        isCancellingAim: this.controller.isCancellingAim(),
        attackRange: this.brawler.basic_attack.range,
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
        })),
      projectiles: this.projectiles,
      obstacles: this.world.obstacles,
      hudPrompt: this.currentQuestion?.hud_prompt ?? '',
      objectiveScore: this.objectiveScore,
      objectiveLabel: 'Défis',
      remainingSeconds: this.elapsedSeconds,
      turretPos: this.turretPos,
      compassTargetPos,
      flashBubble: this.flashBubble,
      leftStick: this.controller.getLeftStickRender(),
      rightStick: this.controller.getRightStickRender(),
      campusRooms: this.world.rooms,
      campusNpcs,
      campusBadges,
      questBanner,
      minimapState,
    });
  }

  private emitHudState(): void {
    const currentRoom = this.world.getRoomAtPosition(this.playerX, this.playerY);
    const questBanner = this.buildQuestBanner();

    this.onHudStateChange?.({
      hp: Math.round(this.playerHp),
      maxHp: this.brawler.base_hp,
      ammoBars: Math.floor(this.ammoBars),
      superGaugePct: Math.round(this.superSystem.getSuperGaugePct()),
      gadgetCharges: this.superSystem.getGadgetChargesLeft(),
      comboMultiplier: this.comboMultiplier,
      hudPrompt: this.currentQuestion?.hud_prompt ?? '',
      lastDamageDealt: this.lastDamageDealt,
      currentRoomId: currentRoom?.id ?? null,
      currentRoomName: currentRoom?.name ?? 'Couloir Principal',
      currentFloorLabel: currentRoom?.floor_label ?? 'Rez-de-chaussée',
      nearbyNpc: this.nearbyNpc,
      activeQuestTitle: questBanner.questTitle,
      activeObjectiveText: questBanner.objectiveText,
      activeObjectiveProgress: questBanner.progressText,
      badgesCollected: this.collectedBadgeIds.size,
      totalBadges: this.world.badges.length,
      questionsSolved: this.questionsSolved,
    });
  }
}
