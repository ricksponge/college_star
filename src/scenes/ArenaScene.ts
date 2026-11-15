import Phaser from 'phaser';
import gsap from 'gsap';
import type {
  BrawlerId,
  GameModeId,
  IBrawler,
  IQuestion,
  IQuestionTarget,
  StarrDropRarity,
  SubjectCategory,
} from '../types/cctp';
import { AntiTiltGuard } from '../accessibility/AntiTiltGuard';
import { SensoryProfile } from '../accessibility/SensoryProfile';
import { AnswerDroneDirector, type IAnswerDroneEntity } from '../ai/AnswerDroneAI';
import type { IIncomingProjectile, ISteeringEnvironment } from '../ai/SteeringBehaviors';
import { KillstreakAnnouncer } from '../director/KillstreakAnnouncer';
import { VictorySlowMo } from '../director/VictorySlowMo';
import {
  computePhaserCombatImpact,
  FALLBACK_ARENA_QUESTIONS,
  ModeRulesConnector,
  soundFX,
  type IModeArenaRules,
} from '../engine/SoundFX';
import { TEXTURE_KEYS, TextureFactory } from '../engine/TextureFactory';
import { GuardiansModeSession } from '../modes/Mode6Guardians';
import {
  GadgetSystem,
  getDefaultGadgetForBrawler,
  type SchoolGadgetId,
} from '../rpg/GadgetSystem';
import { StarPowerSystem } from '../rpg/StarPowerSystem';
import { PREVENTION_QUESTIONS_100 } from '../services/PreventionQuestionBank';

export const ISO_TILT_DEG = 50;
export const ISO_Y_SCALE = Math.cos((ISO_TILT_DEG * Math.PI) / 180); // ~0.6428

export const ARENA_EVENTS = {
  HUD_MOVE_STICK: 'hud:move-stick',
  HUD_AIM_STICK: 'hud:aim-stick',
  HUD_FIRE_RELEASE: 'hud:fire-release',
  HUD_SUPER_TRIGGER: 'hud:super-trigger',
  HUD_GADGET_TRIGGER: 'hud:gadget-trigger',
  HUD_SWITCH_BRAWLER: 'hud:switch-brawler',
  HUD_SWITCH_MODE: 'hud:switch-mode',
  HUD_QUIT_REQUESTED: 'hud:quit-requested',
  HUD_HINT_REQUESTED: 'hud:hint-requested',
  ARENA_QUESTION_CHANGED: 'arena:question-changed',
  ARENA_STATS_UPDATED: 'arena:stats-updated',
  ARENA_EXPLANATION_FLASH: 'arena:explanation-flash',
  ARENA_KILLSTREAK: 'arena:killstreak',
  ARENA_SENSORY_FREEZE: 'arena:sensory-freeze',
  ARENA_MATCH_VICTORY: 'arena:match-victory',
} as const;

export interface IArenaSceneInitData {
  brawlerId?: BrawlerId;
  brawlerLevel?: number;
  modeId?: GameModeId;
  playerNickname?: string;
  questions?: IQuestion[];
  sensoryProfile?: SensoryProfile;
  antiTiltGuard?: AntiTiltGuard;
  selectedGadgetId?: SchoolGadgetId;
  onQuitRequested?: () => void;
  onHintRequested?: (question: IQuestion) => void;
  onRequestNextQuestion?: (preferredSubject: SubjectCategory) => IQuestion | null;
  onMatchFinished?: (result: {
    won: boolean;
    objectiveScore: number;
    correctHits: number;
    fastReflexHits: number;
    missedQuestions: IQuestion[];
    modeId: GameModeId;
  }) => void;
  onAttemptRecorded?: (payload: {
    question: IQuestion;
    isCorrect: boolean;
    reactionTimeMs: number;
  }) => void;
}

export interface IFloatingTextOptions {
  color?: string;
  fontSize?: number;
  riseY?: number;
  durationSec?: number;
  scalePeak?: number;
}

/**
 * Texte de combat flottant avec rebond GSAP élastique style Supercell.
 */
export class FloatingCombatText extends Phaser.GameObjects.Text {
  private activeTween: gsap.core.Timeline | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, message: string, opts: IFloatingTextOptions = {}) {
    super(scene, x, y, message, {
      fontFamily: '"Lilita One", "Arial Black", sans-serif',
      fontSize: `${opts.fontSize ?? 28}px`,
      color: opts.color ?? '#facc15',
      stroke: '#020617',
      strokeThickness: 7,
      align: 'center',
      shadow: {
        offsetX: 0,
        offsetY: 3,
        color: '#020617',
        blur: 4,
        fill: true,
      },
    });
    this.setOrigin(0.5, 0.5);
    this.setDepth(9200);
    scene.add.existing(this);

    const riseY = opts.riseY ?? 58;
    const durationSec = opts.durationSec ?? 0.95;
    const scalePeak = opts.scalePeak ?? 1.35;

    this.setScale(0.35);
    this.activeTween = gsap.timeline({
      onComplete: () => {
        if (this.scene) {
          this.destroy();
        }
      },
    });
    this.activeTween
      .to(this, {
        scaleX: scalePeak,
        scaleY: scalePeak,
        y: y - riseY * 0.48,
        duration: 0.18,
        ease: 'back.out(2.4)',
      })
      .to(this, {
        scaleX: 1,
        scaleY: 1,
        y: y - riseY,
        duration: Math.max(0.25, durationSec * 0.45),
        ease: 'power2.out',
      })
      .to(this, {
        alpha: 0,
        y: y - riseY - 18,
        duration: Math.max(0.22, durationSec * 0.35),
        ease: 'power1.in',
      });
  }

  public static spawn(
    scene: Phaser.Scene,
    x: number,
    y: number,
    message: string,
    opts?: IFloatingTextOptions
  ): FloatingCombatText {
    return new FloatingCombatText(scene, x, y, message, opts);
  }

  public override destroy(fromScene?: boolean): void {
    if (this.activeTween) {
      this.activeTween.kill();
      this.activeTween = null;
    }
    super.destroy(fromScene);
  }
}

interface ITargetRobotEntity {
  container: Phaser.GameObjects.Container;
  body: Phaser.Physics.Arcade.Body;
  sprite: Phaser.GameObjects.Image;
  shieldOverlay: Phaser.GameObjects.Image;
  haloRing: Phaser.GameObjects.Graphics;
  hpFill: Phaser.GameObjects.Graphics;
  labelBadge: Phaser.GameObjects.Text;
  target: IQuestionTarget;
  aiId?: string;
  hp: number;
  maxHp: number;
  vx: number;
  vy: number;
  isDead: boolean;
}

interface IActiveProjectile {
  sprite: Phaser.Physics.Arcade.Image;
  isSuper: boolean;
  damage: number;
  spawnX: number;
  spawnY: number;
  maxRange: number;
  bounced: boolean;
}

const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 1040;
const HERO_MOVE_SCALE = 0.36; // 770 -> ~277 px/s fluide en arène 1600x1040
const AMMO_RELOAD_PER_SEC = 0.78;
const SUPER_READY_GLOW_COLOR = 0xfacc15;
const NORMAL_RING_COLOR = 0x38bdf8;

const ARENA_STEERING_ENV: ISteeringEnvironment = {
  bounds: { minX: 90, minY: 110, maxX: WORLD_WIDTH - 90, maxY: WORLD_HEIGHT - 110 },
  obstacles: [
    { id: 'wall_nw', x: 430, y: 310, radius: 44, kind: 'wall' },
    { id: 'wall_ne', x: 1170, y: 310, radius: 44, kind: 'wall' },
    { id: 'wall_sw', x: 430, y: 730, radius: 44, kind: 'wall' },
    { id: 'wall_se', x: 1170, y: 730, radius: 44, kind: 'wall' },
    { id: 'crate_n', x: 800, y: 245, radius: 40, kind: 'crate' },
    { id: 'crate_s', x: 800, y: 795, radius: 40, kind: 'crate' },
  ],
  bushes: [
    { id: 'bush_w', x: 250, y: 520, radius: 54 },
    { id: 'bush_e', x: 1350, y: 520, radius: 54 },
  ],
};

export class ArenaScene extends Phaser.Scene {
  private initData: IArenaSceneInitData = {};
  private brawler: IBrawler = ModeRulesConnector.getBrawler('TIMO');
  private brawlerLevel = 1;
  private modeRules: IModeArenaRules = ModeRulesConnector.getRules('CHASSE_AUX_BONNES_NOTES');
  private questionsPool: IQuestion[] = FALLBACK_ARENA_QUESTIONS;
  private questionCursor = 0;
  private currentQuestion: IQuestion = FALLBACK_ARENA_QUESTIONS[0];
  private questionShownAtMs = 0;

  private sensoryProfile?: SensoryProfile;
  private antiTiltGuard?: AntiTiltGuard;
  private gadgetSystem = new GadgetSystem('GOMME_MAGIQUE');
  private starPowerSystem = new StarPowerSystem();
  private killstreakAnnouncer = new KillstreakAnnouncer();
  private victorySlowMo = new VictorySlowMo();
  private droneDirector = new AnswerDroneDirector();
  private guardiansSession: GuardiansModeSession | null = null;
  private droneAiEntities = new Map<string, IAnswerDroneEntity>();

  private correctHitsCount = 0;
  private fastReflexHitsCount = 0;
  private missedQuestions: IQuestion[] = [];
  private bonusSpeedUntilMs = 0;
  private bonusShieldHp = 0;
  private pendingSlowMoWon: boolean | null = null;

  private heroContainer!: Phaser.GameObjects.Container;
  private heroBody!: Phaser.Physics.Arcade.Body;
  private heroSprite!: Phaser.GameObjects.Image;
  private heroRing!: Phaser.GameObjects.Image;
  private heroBarGfx!: Phaser.GameObjects.Graphics;
  private aimConeGfx!: Phaser.GameObjects.Graphics;
  private gpsArrowGfx!: Phaser.GameObjects.Graphics;

  private wallsGroup!: Phaser.Physics.Arcade.StaticGroup;
  private projectileGroup!: Phaser.Physics.Arcade.Group;
  private activeProjectiles: IActiveProjectile[] = [];
  private targetRobots: ITargetRobotEntity[] = [];

  private sparkEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private starEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smokeEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private healEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  private hp = 3200;
  private maxHp = 3200;
  private ammo = 3;
  private superPct = 0;
  private gadgetCharges = 3;
  private consecutiveHits = 0;
  private comboMultiplier = 1.0;
  private objectiveScore = 0;
  private timeRemainingSec = 135;
  private matchEnded = false;
  private slowRobotsUntilMs = 0;
  private revealCorrectUntilMs = 0;
  private squashTween: Phaser.Tweens.Tween | null = null;
  private lastErrorPenaltyAtMs = 0;
  private lastStatsBroadcastAtMs = 0;
  private countdownAccumulatorMs = 0;

  private stickMove = { vx: 0, vy: 0, active: false };
  private stickAim = { vx: 0, vy: 0, active: false, angle: 0 };
  private keys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    UP: Phaser.Input.Keyboard.Key;
    LEFT: Phaser.Input.Keyboard.Key;
    DOWN: Phaser.Input.Keyboard.Key;
    RIGHT: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
    E: Phaser.Input.Keyboard.Key;
    Q: Phaser.Input.Keyboard.Key;
    H: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super({ key: 'ArenaScene' });
  }

  public init(data?: IArenaSceneInitData): void {
    this.initData = data ?? {};
    this.brawler = ModeRulesConnector.getBrawler(this.initData.brawlerId ?? 'TIMO');
    this.brawlerLevel = Math.max(1, this.initData.brawlerLevel ?? 1);
    this.modeRules = ModeRulesConnector.getRules(
      this.initData.modeId ?? 'CHASSE_AUX_BONNES_NOTES'
    );

    const poolFromRegistry = this.registry.get('questionsPool300') as IQuestion[] | undefined;
    const rawPool =
      this.initData.questions && this.initData.questions.length > 0
        ? this.initData.questions
        : poolFromRegistry && poolFromRegistry.length > 0
          ? poolFromRegistry
          : FALLBACK_ARENA_QUESTIONS;

    if (this.modeRules.mode.id === 'LES_GARDIENS_DE_LA_RECRE') {
      this.questionsPool = [...PREVENTION_QUESTIONS_100, ...rawPool];
      this.guardiansSession = new GuardiansModeSession();
    } else {
      this.questionsPool = rawPool;
      this.guardiansSession = null;
    }

    this.sensoryProfile =
      this.initData.sensoryProfile ??
      (this.registry.get('sensoryProfile') as SensoryProfile | undefined);
    this.antiTiltGuard = this.initData.antiTiltGuard ?? new AntiTiltGuard();
    this.antiTiltGuard.reset();

    this.gadgetSystem.resetForNewMatch(
      this.initData.selectedGadgetId ?? getDefaultGadgetForBrawler(this.brawler.id)
    );
    this.killstreakAnnouncer.reset();
    this.victorySlowMo.reset();
    this.droneAiEntities.clear();
    this.droneDirector.setCalmMode(Boolean(this.sensoryProfile?.getConfig().tsaSensoryComfort));

    this.maxHp = Math.round(this.brawler.base_hp * (1 + 0.08 * (this.brawlerLevel - 1)));
    this.hp = this.maxHp;
    this.ammo = this.brawler.max_ammo_bars;
    this.superPct = 0;
    this.gadgetCharges = this.gadgetSystem.getHudSnapshot().remainingCharges;
    this.consecutiveHits = 0;
    this.comboMultiplier = 1.0;
    this.objectiveScore = 0;
    this.timeRemainingSec = this.modeRules.mode.duration_seconds;
    this.matchEnded = false;
    this.slowRobotsUntilMs = 0;
    this.revealCorrectUntilMs = 0;
    this.activeProjectiles = [];
    this.targetRobots = [];
    this.questionCursor = 0;
    this.correctHitsCount = 0;
    this.fastReflexHitsCount = 0;
    this.missedQuestions = [];
    this.bonusSpeedUntilMs = 0;
    this.bonusShieldHp = 0;
    this.pendingSlowMoWon = null;
  }

  public create(): void {
    TextureFactory.generateAll(this);

    this.physics.world.setBounds(48, 60, WORLD_WIDTH - 96, WORLD_HEIGHT - 120);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    const calmPalette = Boolean(this.sensoryProfile?.getConfig().calmColorPalette);
    this.cameras.main.setBackgroundColor(calmPalette ? '#0f172a' : '#081326');

    this.buildIsometricFloor50();
    this.buildArenaWalls3D();
    this.createParticleEmitters();
    this.createHero();
    this.createProjectileGroup();
    this.setupDynamicCamera();
    this.setupInputsAndEvents();

    this.loadNextQuestion(true);
    this.broadcastStats(true);
  }

  public override update(time: number, delta: number): void {
    const slowState = this.victorySlowMo.update(delta);
    if (slowState.active) {
      const targetZoom = 1 + (slowState.cameraZoom - 1) * 0.6;
      this.cameras.main.setZoom(Phaser.Math.Linear(this.cameras.main.zoom, targetZoom, 0.14));
      this.physics.world.timeScale = slowState.timeScale > 0 ? 1 / slowState.timeScale : 1;
      if (!slowState.active) {
        this.cameras.main.setZoom(1);
        this.physics.world.timeScale = 1;
      }
      return;
    } else if (this.pendingSlowMoWon !== null) {
      const finalWon = this.pendingSlowMoWon;
      this.pendingSlowMoWon = null;
      this.cameras.main.setZoom(1);
      this.physics.world.timeScale = 1;
      this.finishMatch(finalWon);
      return;
    }

    if (this.matchEnded) {
      return;
    }

    const dtSec = Math.min(0.05, delta / 1000);
    this.sensoryProfile?.updateFreezeTimer(delta);
    this.gadgetSystem.update(delta);
    this.guardiansSession?.tick(dtSec);

    this.updateMatchTimer(delta);
    this.updateHeroMovement(time, dtSec);
    this.updateAmmoAndVisuals(time, dtSec);
    this.updateAimConeAndGps(time);
    this.updateTargetRobots(time, dtSec);
    this.updateProjectiles();

    if (time - this.lastStatsBroadcastAtMs >= 100) {
      this.broadcastStats(false);
      this.lastStatsBroadcastAtMs = time;
    }
  }

  private buildIsometricFloor50(): void {
    const tileW = 128;
    const tileH = Math.round(tileW * ISO_Y_SCALE); // ~82 px pour projection 50°
    const cols = Math.ceil(WORLD_WIDTH / tileW) + 2;
    const rows = Math.ceil(WORLD_HEIGHT / (tileH * 0.5)) + 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const offsetX = r % 2 === 0 ? 0 : tileW * 0.5;
        const x = c * tileW + offsetX;
        const y = r * (tileH * 0.5);
        const isCenterRing =
          Math.hypot(x - WORLD_WIDTH / 2, (y - WORLD_HEIGHT / 2) / ISO_Y_SCALE) < 220;
        const key = isCenterRing
          ? TEXTURE_KEYS.ISO_TILE_ACCENT
          : (r + c) % 2 === 0
            ? TEXTURE_KEYS.ISO_TILE_LIGHT
            : TEXTURE_KEYS.ISO_TILE_DARK;
        const tile = this.add.image(x, y, key);
        tile.setDepth(1);
        tile.setAlpha(isCenterRing ? 0.88 : 0.96);
      }
    }

    // Lignes tactiques de cour de collège (inclinaison 50°)
    const courtGfx = this.add.graphics().setDepth(3);
    courtGfx.lineStyle(4, this.modeRules.primaryColorHex, 0.35);
    courtGfx.strokeEllipse(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 460, Math.round(460 * ISO_Y_SCALE));
    courtGfx.lineStyle(3, this.modeRules.accentColorHex, 0.28);
    courtGfx.strokeRoundedRect(56, 66, WORLD_WIDTH - 112, WORLD_HEIGHT - 132, 28);
  }

  private buildArenaWalls3D(): void {
    this.wallsGroup = this.physics.add.staticGroup();

    const layout: Array<{ x: number; y: number; key: string; solid: boolean }> = [
      { x: 430, y: 310, key: TEXTURE_KEYS.WALL_3D_BLOCK, solid: true },
      { x: 1170, y: 310, key: TEXTURE_KEYS.WALL_3D_BLOCK, solid: true },
      { x: 430, y: 730, key: TEXTURE_KEYS.WALL_3D_BLOCK, solid: true },
      { x: 1170, y: 730, key: TEXTURE_KEYS.WALL_3D_BLOCK, solid: true },
      { x: 800, y: 245, key: TEXTURE_KEYS.WALL_3D_CRATE, solid: true },
      { x: 800, y: 795, key: TEXTURE_KEYS.WALL_3D_CRATE, solid: true },
      { x: 250, y: 520, key: TEXTURE_KEYS.WALL_3D_BUSH, solid: false },
      { x: 1350, y: 520, key: TEXTURE_KEYS.WALL_3D_BUSH, solid: false },
    ];

    for (const item of layout) {
      if (item.solid) {
        const wall = this.wallsGroup.create(item.x, item.y, item.key) as Phaser.Physics.Arcade.Image;
        wall.setDepth(item.y);
        const body = wall.body as Phaser.Physics.Arcade.StaticBody;
        body.setSize(68, 42);
        body.setOffset(14, 52);
        wall.refreshBody();
      } else {
        const bush = this.add.image(item.x, item.y, item.key);
        bush.setDepth(item.y);
        bush.setAlpha(0.92);
      }
    }
  }

  private createParticleEmitters(): void {
    this.sparkEmitter = this.add
      .particles(0, 0, TEXTURE_KEYS.PARTICLE_SPARK, {
        speed: { min: 90, max: 320 },
        scale: { start: 1.0, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 260, max: 520 },
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(8500);

    this.starEmitter = this.add
      .particles(0, 0, TEXTURE_KEYS.PARTICLE_STAR, {
        speed: { min: 110, max: 280 },
        rotate: { min: 0, max: 360 },
        scale: { start: 0.9, end: 0.1 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 380, max: 650 },
        emitting: false,
      })
      .setDepth(8510);

    this.smokeEmitter = this.add
      .particles(0, 0, TEXTURE_KEYS.PARTICLE_SMOKE, {
        speed: { min: 30, max: 110 },
        scale: { start: 0.55, end: 1.35 },
        alpha: { start: 0.7, end: 0 },
        lifespan: { min: 280, max: 500 },
        emitting: false,
      })
      .setDepth(8400);

    this.healEmitter = this.add
      .particles(0, 0, TEXTURE_KEYS.PARTICLE_HEAL, {
        speedY: { min: -120, max: -55 },
        speedX: { min: -40, max: 40 },
        scale: { start: 0.85, end: 0.2 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 450, max: 720 },
        emitting: false,
      })
      .setDepth(8520);
  }

  private createHero(): void {
    const startX = WORLD_WIDTH / 2;
    const startY = WORLD_HEIGHT / 2 + 80;

    this.aimConeGfx = this.add.graphics().setDepth(startY - 3);
    this.gpsArrowGfx = this.add.graphics().setDepth(startY - 2);

    const shadow = this.add.image(0, 26, TEXTURE_KEYS.SHADOW_ELLIPSE);
    this.heroRing = this.add.image(0, 22, TEXTURE_KEYS.HERO_RING);
    this.heroSprite = this.add.image(0, -10, TextureFactory.getBrawlerTextureKey(this.brawler.id));
    this.heroBarGfx = this.add.graphics();

    const nameTag = this.add
      .text(0, -86, this.brawler.name.toUpperCase(), {
        fontFamily: '"Lilita One", "Arial Black", sans-serif',
        fontSize: '15px',
        color: '#f8fafc',
        stroke: '#020617',
        strokeThickness: 5,
      })
      .setOrigin(0.5, 0.5);

    this.heroContainer = this.add.container(startX, startY, [
      shadow,
      this.heroRing,
      this.heroSprite,
      this.heroBarGfx,
      nameTag,
    ]);
    this.heroContainer.setDepth(startY);

    this.physics.add.existing(this.heroContainer);
    this.heroBody = this.heroContainer.body as Phaser.Physics.Arcade.Body;
    this.heroBody.setCollideWorldBounds(true);
    this.heroBody.setSize(44, 28);
    this.heroBody.setOffset(-22, 2);

    this.physics.add.collider(this.heroContainer, this.wallsGroup);
    this.redrawHeroOverheadBars();
  }

  private createProjectileGroup(): void {
    this.projectileGroup = this.physics.add.group({
      maxSize: 32,
      runChildUpdate: false,
    });

    this.physics.add.collider(this.projectileGroup, this.wallsGroup, (projObj) => {
      const sprite = projObj as Phaser.Physics.Arcade.Image;
      const entry = this.activeProjectiles.find((p) => p.sprite === sprite);
      if (entry && this.brawler.id === 'LEO') {
        // Léo lance ses fioles par-dessus les murs (Artilleur de Zone)
        return;
      }
      this.smokeEmitter.explode(6, sprite.x, sprite.y);
      this.removeProjectile(sprite);
    });
  }

  private setupDynamicCamera(): void {
    const cam = this.cameras.main;
    // offsetY = +58 déplace le héros plus bas à l'écran -> +35% visibilité vers le haut (CCTP 50°)
    cam.startFollow(this.heroContainer, true, 0.12, 0.12, 0, 58);
    cam.setZoom(1.0);
  }

  private setupInputsAndEvents(): void {
    if (this.input.keyboard) {
      this.keys = {
        W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        UP: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
        LEFT: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
        DOWN: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
        RIGHT: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
        SPACE: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
        E: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
        Q: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
        H: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H),
      };
      this.keys.H.on('down', () => {
        if (!this.matchEnded) {
          this.revealCorrectUntilMs = Math.max(this.revealCorrectUntilMs, this.time.now + 4000);
          this.initData.onHintRequested?.(this.currentQuestion);
        }
      });
    }

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      soundFX.unlock();
      // Tir souris desktop uniquement si le clic ne vient pas d'un joystick tactile
      if (pointer.wasTouch) return;
      const worldPt = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const angle = Phaser.Math.Angle.Between(
        this.heroContainer.x,
        this.heroContainer.y,
        worldPt.x,
        worldPt.y
      );
      this.stickAim.angle = angle;
      this.fireBasicAttack(angle);
    });

    const onMoveStick = (payload: { vx: number; vy: number; active: boolean }) => {
      this.stickMove = payload;
    };
    const onAimStick = (payload: { vx: number; vy: number; active: boolean }) => {
      this.stickAim.vx = payload.vx;
      this.stickAim.vy = payload.vy;
      this.stickAim.active = payload.active;
      if (payload.active && (Math.abs(payload.vx) > 0.08 || Math.abs(payload.vy) > 0.08)) {
        this.stickAim.angle = Math.atan2(payload.vy, payload.vx);
      }
    };
    const onFireRelease = (payload: { angle: number; power: number }) => {
      if (payload.power > 0.15) {
        this.fireBasicAttack(payload.angle);
      }
    };
    const onSuperTrigger = () => this.triggerSuperAbility();
    const onGadgetTrigger = () => this.triggerGadgetAbility();
    const onSwitchBrawler = (payload: { brawlerId: BrawlerId }) => {
      this.switchBrawler(payload.brawlerId);
    };
    const onSwitchMode = (payload: { modeId: GameModeId }) => {
      this.switchMode(payload.modeId);
    };
    const onQuitRequested = () => {
      this.matchEnded = true;
      this.initData.onQuitRequested?.();
    };
    const onHintRequested = () => {
      if (!this.matchEnded) {
        this.revealCorrectUntilMs = Math.max(this.revealCorrectUntilMs, this.time.now + 4000);
        this.initData.onHintRequested?.(this.currentQuestion);
      }
    };

    this.game.events.on(ARENA_EVENTS.HUD_MOVE_STICK, onMoveStick);
    this.game.events.on(ARENA_EVENTS.HUD_AIM_STICK, onAimStick);
    this.game.events.on(ARENA_EVENTS.HUD_FIRE_RELEASE, onFireRelease);
    this.game.events.on(ARENA_EVENTS.HUD_SUPER_TRIGGER, onSuperTrigger);
    this.game.events.on(ARENA_EVENTS.HUD_GADGET_TRIGGER, onGadgetTrigger);
    this.game.events.on(ARENA_EVENTS.HUD_SWITCH_BRAWLER, onSwitchBrawler);
    this.game.events.on(ARENA_EVENTS.HUD_SWITCH_MODE, onSwitchMode);
    this.game.events.on(ARENA_EVENTS.HUD_QUIT_REQUESTED, onQuitRequested);
    this.game.events.on(ARENA_EVENTS.HUD_HINT_REQUESTED, onHintRequested);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(ARENA_EVENTS.HUD_MOVE_STICK, onMoveStick);
      this.game.events.off(ARENA_EVENTS.HUD_AIM_STICK, onAimStick);
      this.game.events.off(ARENA_EVENTS.HUD_FIRE_RELEASE, onFireRelease);
      this.game.events.off(ARENA_EVENTS.HUD_SUPER_TRIGGER, onSuperTrigger);
      this.game.events.off(ARENA_EVENTS.HUD_GADGET_TRIGGER, onGadgetTrigger);
      this.game.events.off(ARENA_EVENTS.HUD_SWITCH_BRAWLER, onSwitchBrawler);
      this.game.events.off(ARENA_EVENTS.HUD_SWITCH_MODE, onSwitchMode);
      this.game.events.off(ARENA_EVENTS.HUD_QUIT_REQUESTED, onQuitRequested);
      this.game.events.off(ARENA_EVENTS.HUD_HINT_REQUESTED, onHintRequested);
    });
  }

  private updateMatchTimer(deltaMs: number): void {
    this.countdownAccumulatorMs += deltaMs;
    if (this.countdownAccumulatorMs < 1000) {
      return;
    }
    this.countdownAccumulatorMs -= 1000;
    this.timeRemainingSec = Math.max(0, this.timeRemainingSec - 1);

    if (this.timeRemainingSec > 0 && this.timeRemainingSec <= 10) {
      soundFX.playCountdownTick(this.timeRemainingSec <= 3);
    }

    if (this.timeRemainingSec <= 0) {
      this.triggerSlowMoFinish(
        this.objectiveScore >= Math.ceil(this.modeRules.objectiveTarget * 0.5),
        this.heroContainer.x,
        this.heroContainer.y
      );
    }
  }

  private updateHeroMovement(time: number, _dtSec: number): void {
    let moveX = this.stickMove.active ? this.stickMove.vx : 0;
    let moveY = this.stickMove.active ? this.stickMove.vy : 0;

    if (this.keys) {
      if (this.keys.A.isDown || this.keys.LEFT.isDown) moveX -= 1;
      if (this.keys.D.isDown || this.keys.RIGHT.isDown) moveX += 1;
      if (this.keys.W.isDown || this.keys.UP.isDown) moveY -= 1;
      if (this.keys.S.isDown || this.keys.DOWN.isDown) moveY += 1;

      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.E)) {
        this.triggerSuperAbility();
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.Q)) {
        this.triggerGadgetAbility();
      }
    }

    const mag = Math.hypot(moveX, moveY);
    if (mag > 0.05) {
      const nx = moveX / Math.max(1, mag);
      const ny = moveY / Math.max(1, mag);
      const speedMult = time < this.bonusSpeedUntilMs ? 1.15 : 1.0;
      const speed = this.brawler.speed_value * HERO_MOVE_SCALE * speedMult;
      this.heroBody.setVelocity(nx * speed, ny * speed * ISO_Y_SCALE);

      if (!this.stickAim.active) {
        this.stickAim.angle = Math.atan2(ny * ISO_Y_SCALE, nx);
      }
      if (Math.abs(nx) > 0.1) {
        this.heroSprite.setFlipX(nx < 0);
      }

      // Animation Squash & Stretch organique en course
      if (!this.squashTween || !this.squashTween.isPlaying()) {
        const bob = Math.sin(time * 0.022);
        this.heroSprite.setScale(1 + bob * 0.055, 1 - bob * 0.065);
        this.heroSprite.y = -10 - Math.abs(bob) * 4;
      }
    } else {
      this.heroBody.setVelocity(0, 0);
      if (!this.squashTween || !this.squashTween.isPlaying()) {
        this.heroSprite.setScale(1, 1);
        this.heroSprite.y = -10 + Math.sin(time * 0.005) * 1.5;
      }
    }

    this.heroContainer.setDepth(this.heroContainer.y);
  }

  private updateAmmoAndVisuals(time: number, dtSec: number): void {
    const prevAmmoFloor = Math.floor(this.ammo);
    this.ammo = Math.min(this.brawler.max_ammo_bars, this.ammo + AMMO_RELOAD_PER_SEC * dtSec);
    if (Math.floor(this.ammo) !== prevAmmoFloor || this.ammo < this.brawler.max_ammo_bars) {
      this.redrawHeroOverheadBars();
    }

    // Régénération passive douce si le joueur s'est pris un bouclier d'erreur
    if (this.hp < this.maxHp && time - this.lastErrorPenaltyAtMs > 2800) {
      this.hp = Math.min(this.maxHp, this.hp + Math.round(this.maxHp * 0.08 * dtSec));
      this.redrawHeroOverheadBars();
    }

    const superReady = this.superPct >= 100;
    this.heroRing.setTint(superReady ? SUPER_READY_GLOW_COLOR : NORMAL_RING_COLOR);
    const pulse = superReady ? 1.06 + Math.sin(time * 0.012) * 0.08 : 1;
    this.heroRing.setScale(pulse);
  }

  private updateAimConeAndGps(time: number): void {
    const hx = this.heroContainer.x;
    const hy = this.heroContainer.y + 18;
    const angle = this.stickAim.angle;
    const range = this.brawler.basic_attack.range * 0.72;
    const halfSpread = this.brawler.id === 'MAYA' ? 0.38 : this.brawler.id === 'LEO' ? 0.24 : 0.16;
    const isSuperReady = this.superPct >= 100;
    const color = isSuperReady ? 0xfacc15 : this.modeRules.primaryColorHex;
    const alpha = this.stickAim.active ? 0.42 : 0.22;

    this.aimConeGfx.clear();
    this.aimConeGfx.setDepth(this.heroContainer.y - 4);
    this.aimConeGfx.fillStyle(color, alpha * 0.55);
    this.aimConeGfx.lineStyle(2.5, color, alpha + 0.22);

    this.aimConeGfx.beginPath();
    this.aimConeGfx.moveTo(hx, hy);
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const a = angle - halfSpread + (halfSpread * 2 * i) / steps;
      const px = hx + Math.cos(a) * range;
      const py = hy + Math.sin(a) * range * ISO_Y_SCALE;
      this.aimConeGfx.lineTo(px, py);
    }
    this.aimConeGfx.closePath();
    this.aimConeGfx.fillPath();
    this.aimConeGfx.strokePath();

    // Flèche GPS au sol si le gadget Vision / Boussole est actif
    this.gpsArrowGfx.clear();
    if (time < this.revealCorrectUntilMs) {
      const correctRobot = this.targetRobots.find((r) => !r.isDead && r.target.is_correct);
      if (correctRobot) {
        const gAngle = Phaser.Math.Angle.Between(hx, hy, correctRobot.container.x, correctRobot.container.y);
        const ax = hx + Math.cos(gAngle) * 72;
        const ay = hy + Math.sin(gAngle) * 72 * ISO_Y_SCALE;
        this.gpsArrowGfx.setDepth(this.heroContainer.y - 2);
        this.gpsArrowGfx.lineStyle(4, 0xfacc15, 0.9);
        this.gpsArrowGfx.beginPath();
        this.gpsArrowGfx.moveTo(hx + Math.cos(gAngle) * 34, hy + Math.sin(gAngle) * 34 * ISO_Y_SCALE);
        this.gpsArrowGfx.lineTo(ax, ay);
        this.gpsArrowGfx.strokePath();
        this.gpsArrowGfx.fillStyle(0xfacc15, 1);
        this.gpsArrowGfx.fillCircle(ax, ay, 6);
      }
    }
  }

  private updateTargetRobots(time: number, dtSec: number = 1 / 60): void {
    const sensoryMods = this.sensoryProfile?.getRuntimeModifiers();
    const frozenBySensory = sensoryMods?.isDroneFrozenForReading ?? false;
    const sensorySpeed = sensoryMods?.droneSpeedMultiplier ?? 1;
    const antiTiltSpeed = this.antiTiltGuard?.getTargetSpeedMultiplier() ?? 1;
    const gadgetSpeed = this.gadgetSystem.getTargetSpeedMultiplier();
    const legacySlow = time < this.slowRobotsUntilMs ? 0.5 : 1.0;
    const effectiveFactor = frozenBySensory
      ? 0
      : Math.min(legacySlow, gadgetSpeed) * sensorySpeed * antiTiltSpeed;
    const haloActive = time < this.revealCorrectUntilMs;

    this.droneDirector.setCalmMode(Boolean(this.sensoryProfile?.getConfig().tsaSensoryComfort));
    this.droneDirector.setSpeedMultiplier(Math.max(0.5, effectiveFactor));

    for (const robot of this.targetRobots) {
      if (robot.isDead || !robot.aiId) continue;
      const ai = this.droneAiEntities.get(robot.aiId);
      if (ai) {
        ai.position.x = robot.container.x;
        ai.position.y = robot.container.y;
        ai.frozenMs = frozenBySensory ? 100 : 0;
      }
    }

    const incoming: IIncomingProjectile[] = this.activeProjectiles
      .filter((p) => p.sprite.active)
      .map((p) => {
        const b = p.sprite.body as Phaser.Physics.Arcade.Body | undefined;
        return {
          x: p.sprite.x,
          y: p.sprite.y,
          vx: b?.velocity.x ?? 0,
          vy: b?.velocity.y ?? 0,
          radius: 14,
          isFriendlyToAgent: false,
        };
      });

    this.droneDirector.update(
      dtSec,
      { x: this.heroContainer.x, y: this.heroContainer.y },
      incoming,
      { ...ARENA_STEERING_ENV, timeSec: time / 1000 }
    );

    for (const robot of this.targetRobots) {
      if (robot.isDead) continue;

      if (frozenBySensory) {
        robot.body.setVelocity(0, 0);
      } else {
        const ai = robot.aiId ? this.droneAiEntities.get(robot.aiId) : undefined;
        if (ai) {
          robot.vx = ai.velocity.x;
          robot.vy = ai.velocity.y;
          robot.body.setVelocity(
            robot.vx * effectiveFactor,
            robot.vy * ISO_Y_SCALE * effectiveFactor
          );
          robot.sprite.setAlpha(ai.isHiddenInBush ? 0.48 : 1);
        } else {
          robot.body.setVelocity(
            robot.vx * effectiveFactor,
            robot.vy * ISO_Y_SCALE * effectiveFactor
          );
        }
      }

      robot.sprite.y = -8 + Math.sin(time * 0.008 + robot.container.x * 0.01) * 4;
      robot.container.setDepth(robot.container.y);

      if (robot.target.is_correct && haloActive) {
        robot.haloRing.setVisible(true);
        robot.haloRing.setScale(1 + Math.sin(time * 0.014) * 0.08);
      } else {
        robot.haloRing.setVisible(false);
      }
    }
  }

  private updateProjectiles(): void {
    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const proj = this.activeProjectiles[i];
      if (!proj.sprite.active) {
        this.activeProjectiles.splice(i, 1);
        continue;
      }
      const dist = Phaser.Math.Distance.Between(
        proj.spawnX,
        proj.spawnY,
        proj.sprite.x,
        proj.sprite.y
      );
      proj.sprite.setDepth(proj.sprite.y + 8);
      if (dist >= proj.maxRange) {
        this.smokeEmitter.explode(4, proj.sprite.x, proj.sprite.y);
        this.removeProjectile(proj.sprite);
      }
    }
  }

  private fireBasicAttack(angle: number): void {
    if (this.matchEnded || this.ammo < 1) {
      return;
    }

    this.ammo = Math.max(0, this.ammo - 1);
    this.redrawHeroOverheadBars();
    this.playSquashStretch(1.24, 0.8, 170);
    soundFX.playShoot(this.brawler.id);

    const count = this.brawler.basic_attack.projectiles_count;
    const spreadStep = count > 1 ? 0.08 : 0;

    for (let i = 0; i < count; i++) {
      const offsetAngle = angle + (i - (count - 1) / 2) * spreadStep;
      this.spawnProjectile(offsetAngle, false);
    }
    this.broadcastStats(true);
  }

  private spawnProjectile(angle: number, isSuper: boolean): void {
    const texKey = isSuper
      ? TEXTURE_KEYS.PROJ_SUPER_GOLD
      : TextureFactory.getProjectileTextureKey(this.brawler.id);
    const spawnX = this.heroContainer.x + Math.cos(angle) * 28;
    const spawnY = this.heroContainer.y - 6 + Math.sin(angle) * 18;

    const proj = this.physics.add.image(spawnX, spawnY, texKey);
    proj.setDepth(spawnY + 10);
    proj.setScale(isSuper ? 1.45 : 1.05);
    this.projectileGroup.add(proj);

    const body = proj.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setCircle(14, 5, 5);

    const speed = isSuper ? 920 : 680;
    body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed * ISO_Y_SCALE);

    const entry: IActiveProjectile = {
      sprite: proj,
      isSuper,
      damage: this.brawler.basic_attack.base_damage,
      spawnX,
      spawnY,
      maxRange: isSuper ? 780 : this.brawler.basic_attack.range,
      bounced: false,
    };
    this.activeProjectiles.push(entry);

    // Enregistrement de l'overlap avec les robots actifs
    for (const robot of this.targetRobots) {
      if (robot.isDead) continue;
      this.physics.add.overlap(proj, robot.container, () => {
        if (!proj.active || robot.isDead) return;
        this.handleProjectileHitRobot(entry, robot);
      });
    }
  }

  private handleProjectileHitRobot(proj: IActiveProjectile, robot: ITargetRobotEntity): void {
    const reactionTimeMs = Math.max(250, Math.round(this.time.now - this.questionShownAtMs));

    if (!robot.target.is_correct) {
      if (proj.bounced) {
        return;
      }
      proj.bounced = true;
      const body = proj.sprite.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(-body.velocity.x * 0.65, -body.velocity.y * 0.65);

      this.applyWrongTargetPenalty(robot, reactionTimeMs);
      this.time.delayedCall(220, () => this.removeProjectile(proj.sprite));
      return;
    }

    this.removeProjectile(proj.sprite);
    this.applyCorrectTargetHit(robot, reactionTimeMs, proj.isSuper);
  }

  private applyCorrectTargetHit(
    robot: ITargetRobotEntity,
    reactionTimeMs: number,
    fromSuper: boolean
  ): void {
    const impact = computePhaserCombatImpact({
      base_damage: this.brawler.basic_attack.base_damage,
      brawler_level: this.brawlerLevel,
      consecutive_correct_hits: this.consecutiveHits,
      is_correct: true,
      reaction_time_ms: reactionTimeMs,
      player_max_hp: this.maxHp,
    });

    this.consecutiveHits += 1;
    this.correctHitsCount += 1;
    if (reactionTimeMs <= 2500) {
      this.fastReflexHitsCount += 1;
    }
    this.comboMultiplier = impact.combo_multiplier;
    this.antiTiltGuard?.recordAttempt(true, this.currentQuestion.id);

    const starFx = this.starPowerSystem.evaluateOnCombatHit({
      brawlerId: this.brawler.id,
      brawlerLevel: this.brawlerLevel,
      isCorrect: true,
      reactionTimeMs,
      consecutiveCorrectHits: this.consecutiveHits,
    });
    if (starFx.triggered) {
      if (starFx.ammoRefundBars > 0) {
        this.ammo = Math.min(this.brawler.max_ammo_bars, this.ammo + starFx.ammoRefundBars);
      }
      if (starFx.healHp > 0) {
        this.hp = Math.min(this.maxHp, this.hp + starFx.healHp);
      }
      if (starFx.bonusShieldHp > 0) {
        this.bonusShieldHp += starFx.bonusShieldHp;
      }
      if (starFx.speedBoostDurationMs > 0) {
        this.bonusSpeedUntilMs = this.time.now + starFx.speedBoostDurationMs;
      }
      if (starFx.bannerMessage) {
        FloatingCombatText.spawn(
          this,
          this.heroContainer.x,
          this.heroContainer.y - 108,
          `${starFx.starPower.icon} ${starFx.starPower.name}`,
          { color: '#c084fc', fontSize: 18, riseY: 36 }
        );
      }
    }

    const prevSuper = this.superPct;
    if (!fromSuper) {
      const superGain = impact.super_charge_gain_pct + (starFx.triggered ? starFx.bonusSuperChargePct : 0);
      this.superPct = Math.min(100, this.superPct + superGain);
      if (prevSuper < 100 && this.superPct >= 100) {
        soundFX.playSuperReady();
        FloatingCombatText.spawn(this, this.heroContainer.x, this.heroContainer.y - 84, 'SUPER PRÊT !', {
          color: '#facc15',
          fontSize: 26,
          scalePeak: 1.45,
        });
      }
    }

    const streakOutcome = this.killstreakAnnouncer.registerCorrectHit();
    if (streakOutcome.tierTriggered) {
      const bannerText = `${streakOutcome.tierTriggered.badgeIcon} ${streakOutcome.tierTriggered.label}`;
      this.game.events.emit(ARENA_EVENTS.ARENA_KILLSTREAK, {
        streak: streakOutcome.state.streak,
        bannerText,
      });
      FloatingCombatText.spawn(
        this,
        this.heroContainer.x,
        this.heroContainer.y - 122,
        bannerText,
        { color: '#fbbf24', fontSize: 24, riseY: 50, scalePeak: 1.42 }
      );
    }

    if (this.guardiansSession) {
      this.guardiansSession.resolvePreventionScenario(true);
    }

    soundFX.playHitCorrect(this.consecutiveHits);
    this.sparkEmitter.explode(24, robot.container.x, robot.container.y);
    this.starEmitter.explode(12, robot.container.x, robot.container.y);
    const shakeScale = this.sensoryProfile?.getRuntimeModifiers().screenShakeScale ?? 1;
    if (shakeScale > 0) {
      this.cameras.main.shake(110, 0.0065 * shakeScale);
    }

    const dmg = fromSuper ? impact.final_damage * 2 : impact.final_damage;
    robot.hp = Math.max(0, robot.hp - dmg);
    this.redrawRobotHp(robot);
    this.redrawHeroOverheadBars();

    FloatingCombatText.spawn(this, robot.container.x, robot.container.y - 46, `-${dmg} !`, {
      color: '#fef08a',
      fontSize: 30,
    });

    if (this.comboMultiplier > 1) {
      FloatingCombatText.spawn(
        this,
        robot.container.x + 22,
        robot.container.y - 78,
        `COMBO x${this.comboMultiplier.toFixed(2)}`,
        { color: '#38bdf8', fontSize: 20, riseY: 42 }
      );
    }

    if (!fromSuper && impact.super_charge_gain_pct >= 40) {
      FloatingCombatText.spawn(this, this.heroContainer.x, this.heroContainer.y - 55, '⚡ RÉFLEXE +40%', {
        color: '#4ade80',
        fontSize: 19,
        riseY: 40,
      });
    }

    this.initData.onAttemptRecorded?.({
      question: this.currentQuestion,
      isCorrect: true,
      reactionTimeMs,
    });

    // Validation instantanée d'objectif façon Brawl Stars
    const pointsGained = fromSuper ? this.brawler.super_ability.bonus_objective_points : 1;
    this.objectiveScore += pointsGained;
    const hitX = robot.container.x;
    const hitY = robot.container.y;
    this.destroyAllRobotsVisual();

    if (this.objectiveScore >= this.modeRules.objectiveTarget) {
      this.broadcastStats(true);
      this.triggerSlowMoFinish(true, hitX, hitY);
      return;
    }

    this.time.delayedCall(260, () => {
      if (!this.matchEnded) {
        this.loadNextQuestion(false);
        this.broadcastStats(true);
      }
    });
  }

  private applyWrongTargetPenalty(robot: ITargetRobotEntity, reactionTimeMs: number): void {
    const now = this.time.now;
    const impact = computePhaserCombatImpact({
      base_damage: this.brawler.basic_attack.base_damage,
      brawler_level: this.brawlerLevel,
      consecutive_correct_hits: this.consecutiveHits,
      is_correct: false,
      reaction_time_ms: reactionTimeMs,
      player_max_hp: this.maxHp,
    });

    this.consecutiveHits = 0;
    this.comboMultiplier = 1.0;
    this.killstreakAnnouncer.registerError();
    this.antiTiltGuard?.recordAttempt(false, this.currentQuestion.id);

    if (!this.missedQuestions.some((q) => q.id === this.currentQuestion.id)) {
      this.missedQuestions.push(this.currentQuestion);
    }

    if (this.guardiansSession) {
      this.guardiansSession.resolvePreventionScenario(false);
    }

    const starFx = this.starPowerSystem.evaluateOnCombatHit({
      brawlerId: this.brawler.id,
      brawlerLevel: this.brawlerLevel,
      isCorrect: false,
      reactionTimeMs,
      consecutiveCorrectHits: 0,
    });

    const sensoryMods = this.sensoryProfile?.getRuntimeModifiers();
    const allowFlashes = sensoryMods?.allowFlashes ?? true;
    if (allowFlashes) {
      robot.shieldOverlay.setVisible(true);
      robot.shieldOverlay.setAlpha(1);
      this.tweens.add({
        targets: robot.shieldOverlay,
        alpha: 0,
        scale: 1.25,
        duration: 420,
        onComplete: () => {
          robot.shieldOverlay.setVisible(false);
          robot.shieldOverlay.setScale(1);
        },
      });
    }

    soundFX.playErrorShield();
    this.smokeEmitter.explode(10, robot.container.x, robot.container.y);
    const shakeScale = sensoryMods?.screenShakeScale ?? 1;
    if (shakeScale > 0) {
      this.cameras.main.shake(185, 0.012 * shakeScale);
    }

    const dmgFactor =
      (this.antiTiltGuard?.getErrorDamageMultiplier() ?? 1) *
      (1 - (starFx.errorDamageReductionPct ?? 0));
    const finalPenaltyDmg = Math.max(40, Math.round(impact.error_penalty_damage * dmgFactor));

    if (now - this.lastErrorPenaltyAtMs > 650) {
      this.lastErrorPenaltyAtMs = now;
      if (this.bonusShieldHp > 0) {
        const absorbed = Math.min(this.bonusShieldHp, finalPenaltyDmg);
        this.bonusShieldHp -= absorbed;
        const leftover = finalPenaltyDmg - absorbed;
        this.hp = Math.max(Math.round(this.maxHp * 0.2), this.hp - leftover);
      } else {
        this.hp = Math.max(Math.round(this.maxHp * 0.2), this.hp - finalPenaltyDmg);
      }
      this.redrawHeroOverheadBars();

      FloatingCombatText.spawn(
        this,
        this.heroContainer.x,
        this.heroContainer.y - 58,
        `-${finalPenaltyDmg} BOUCLIER!`,
        { color: '#f87171', fontSize: 24 }
      );
    }

    this.game.events.emit(ARENA_EVENTS.ARENA_EXPLANATION_FLASH, {
      text: this.currentQuestion.explanation_flash,
      durationMs: impact.trigger_explanation_flash_ms,
      isError: true,
      question: this.currentQuestion,
    });

    this.initData.onAttemptRecorded?.({
      question: this.currentQuestion,
      isCorrect: false,
      reactionTimeMs,
    });

    this.broadcastStats(true);
  }

  private triggerSuperAbility(): void {
    if (this.matchEnded || this.superPct < 100) {
      return;
    }

    this.superPct = 0;
    soundFX.playSuperCast(this.brawler.id);
    this.playSquashStretch(1.36, 0.74, 260);

    const cam = this.cameras.main;
    cam.zoomTo(1.16, 220, 'Sine.easeOut');
    cam.shake(210, 0.011);
    this.time.delayedCall(380, () => {
      if (this.scene.isActive()) {
        cam.zoomTo(1.0, 280, 'Sine.easeInOut');
      }
    });

    const correctRobot = this.targetRobots.find((r) => !r.isDead && r.target.is_correct);
    if (correctRobot) {
      if (this.brawler.id === 'TIMO' || this.brawler.id === 'ZACK') {
        // Sprint / Téléportation dynamique vers la bonne cible
        gsap.to(this.heroContainer, {
          x: Phaser.Math.Clamp(correctRobot.container.x - 46, 90, WORLD_WIDTH - 90),
          y: Phaser.Math.Clamp(correctRobot.container.y + 24, 110, WORLD_HEIGHT - 110),
          duration: 0.2,
          ease: 'power3.out',
          onComplete: () => {
            if (!correctRobot.isDead && !this.matchEnded) {
              this.applyCorrectTargetHit(
                correctRobot,
                Math.max(200, Math.round(this.time.now - this.questionShownAtMs)),
                true
              );
            }
          },
        });
      } else {
        this.healEmitter.explode(14, this.heroContainer.x, this.heroContainer.y);
        const angle = Phaser.Math.Angle.Between(
          this.heroContainer.x,
          this.heroContainer.y,
          correctRobot.container.x,
          correctRobot.container.y
        );
        this.spawnProjectile(angle, true);
      }
    } else {
      this.spawnProjectile(this.stickAim.angle, true);
    }

    FloatingCombatText.spawn(
      this,
      this.heroContainer.x,
      this.heroContainer.y - 84,
      `${this.brawler.super_ability.name.toUpperCase()} !`,
      { color: '#facc15', fontSize: 27, scalePeak: 1.48 }
    );
    this.broadcastStats(true);
  }

  private triggerGadgetAbility(): void {
    if (this.matchEnded) {
      return;
    }

    const candidates = this.targetRobots.map((r, i) => ({
      id: r.aiId ?? `robot_${i}`,
      label: r.target.label,
      is_correct: r.target.is_correct,
      active: !r.isDead,
    }));

    const result = this.gadgetSystem.activate(candidates, {
      onRemoveWrongTarget: (targetId) => {
        const victim = this.targetRobots.find(
          (r, i) => !r.isDead && (r.aiId ?? `robot_${i}`) === targetId
        );
        if (victim) {
          victim.isDead = true;
          this.smokeEmitter.explode(16, victim.container.x, victim.container.y);
          victim.container.destroy();
        }
      },
      onApplySlowdown: (_speedMultiplier, durationMs) => {
        this.slowRobotsUntilMs = Math.max(this.slowRobotsUntilMs, this.time.now + durationMs);
      },
      onHighlightCorrect: (_targetId, durationMs) => {
        this.revealCorrectUntilMs = Math.max(this.revealCorrectUntilMs, this.time.now + durationMs);
      },
    });

    if (!result.activated) {
      if (this.gadgetCharges <= 0) return;
      this.gadgetCharges -= 1;
      const fallbackDurationMs = this.brawler.gadget.duration_sec * 1000;
      this.revealCorrectUntilMs = this.time.now + fallbackDurationMs;
    } else {
      this.gadgetCharges = result.remainingCharges;
    }

    if (this.guardiansSession) {
      this.guardiansSession.deploySolidarityShield();
    }

    soundFX.playGadgetCast();
    this.playSquashStretch(1.18, 0.86, 160);
    this.healEmitter.explode(10, this.heroContainer.x, this.heroContainer.y);
    FloatingCombatText.spawn(
      this,
      this.heroContainer.x,
      this.heroContainer.y - 72,
      result.activated ? this.gadgetSystem.getSelectedGadget().name : this.brawler.gadget.name,
      { color: '#4ade80', fontSize: 23 }
    );
    this.broadcastStats(true);
  }

  private switchBrawler(brawlerId: BrawlerId): void {
    this.brawler = ModeRulesConnector.getBrawler(brawlerId);
    this.maxHp = Math.round(this.brawler.base_hp * (1 + 0.08 * (this.brawlerLevel - 1)));
    this.hp = this.maxHp;
    this.ammo = this.brawler.max_ammo_bars;
    this.gadgetSystem.resetForNewMatch(
      this.initData.selectedGadgetId ?? getDefaultGadgetForBrawler(brawlerId)
    );
    this.gadgetCharges = this.gadgetSystem.getHudSnapshot().remainingCharges;
    this.heroSprite.setTexture(TextureFactory.getBrawlerTextureKey(brawlerId));
    this.playSquashStretch(1.28, 0.78, 200);
    this.redrawHeroOverheadBars();
    this.broadcastStats(true);
  }

  private switchMode(modeId: GameModeId): void {
    this.modeRules = ModeRulesConnector.getRules(modeId);
    this.objectiveScore = 0;
    this.timeRemainingSec = this.modeRules.mode.duration_seconds;
    this.matchEnded = false;
    this.guardiansSession =
      modeId === 'LES_GARDIENS_DE_LA_RECRE' ? new GuardiansModeSession() : null;
    this.loadNextQuestion(true);
    this.broadcastStats(true);
  }

  private loadNextQuestion(isFirst: boolean): void {
    this.destroyAllRobotsVisual();

    const pool = this.questionsPool.length > 0 ? this.questionsPool : FALLBACK_ARENA_QUESTIONS;
    const subjectPref =
      this.modeRules.mode.target_subject ??
      this.modeRules.defaultSubject ??
      this.brawler.favorite_subject;

    const customQuestion = this.initData.onRequestNextQuestion?.(subjectPref);
    if (customQuestion) {
      this.currentQuestion = customQuestion;
    } else if (this.antiTiltGuard?.isProtectionActive()) {
      const pick = this.antiTiltGuard.selectNextQuestion(pool, 1000, subjectPref);
      this.currentQuestion = pick.question;
    } else {
      if (!isFirst) {
        this.questionCursor = (this.questionCursor + 1) % pool.length;
      }
      this.currentQuestion = pool[this.questionCursor];
    }

    this.questionShownAtMs = this.time.now;

    const freezeMs = this.sensoryProfile?.onNewQuestionDisplayed() ?? 0;
    if (freezeMs > 0) {
      this.game.events.emit(ARENA_EVENTS.ARENA_SENSORY_FREEZE, { durationMs: freezeMs });
    }

    const aiDrones = this.droneDirector.spawnFromQuestion(
      this.currentQuestion,
      ARENA_STEERING_ENV
    );
    this.droneAiEntities.clear();
    for (const d of aiDrones) {
      this.droneAiEntities.set(d.id, d);
    }

    const targets = this.currentQuestion.targets.slice(0, 4);
    const spawnSpots = [
      { x: 320, y: 210 },
      { x: 1280, y: 210 },
      { x: 320, y: 820 },
      { x: 1280, y: 820 },
    ];
    Phaser.Utils.Array.Shuffle(spawnSpots);

    targets.forEach((target, idx) => {
      const spot = spawnSpots[idx % spawnSpots.length];
      this.spawnTargetRobot(target, idx, spot.x, spot.y, aiDrones[idx]?.id);
    });

    this.game.events.emit(ARENA_EVENTS.ARENA_QUESTION_CHANGED, {
      question: this.currentQuestion,
      mode: this.modeRules.mode,
    });
  }

  private spawnTargetRobot(
    target: IQuestionTarget,
    index: number,
    x: number,
    y: number,
    aiId?: string
  ): void {
    const shadow = this.add.image(0, 32, TEXTURE_KEYS.SHADOW_ELLIPSE).setScale(0.88);
    const haloRing = this.add.graphics();
    haloRing.lineStyle(5, 0xfacc15, 0.95);
    haloRing.strokeEllipse(0, 26, 86, 52);
    haloRing.setVisible(false);

    const sprite = this.add.image(0, -8, TextureFactory.getTargetRobotTextureKey(index));
    const shieldOverlay = this.add.image(0, -8, TEXTURE_KEYS.TARGET_SHIELD_ERR).setVisible(false);
    const hpFill = this.add.graphics();

    const labelBadge = this.add
      .text(0, -64, target.label, {
        fontFamily: '"Lilita One", "Arial Black", sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: 'rgba(15, 23, 42, 0.88)',
        padding: { left: 10, right: 10, top: 4, bottom: 4 },
        stroke: '#020617',
        strokeThickness: 5,
      })
      .setOrigin(0.5, 0.5);

    const container = this.add.container(x, y, [
      shadow,
      haloRing,
      sprite,
      shieldOverlay,
      hpFill,
      labelBadge,
    ]);
    container.setDepth(y);
    container.setScale(0.2);
    this.tweens.add({
      targets: container,
      scaleX: 1,
      scaleY: 1,
      duration: 240,
      ease: 'Back.easeOut',
    });

    this.physics.add.existing(container);
    const body = container.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    body.setBounce(1, 1);
    body.setSize(56, 42);
    body.setOffset(-28, -14);

    this.physics.add.collider(container, this.wallsGroup);

    const baseSpeed = 92 * this.modeRules.targetSpeedFactor;
    const moveAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);

    const entity: ITargetRobotEntity = {
      container,
      body,
      sprite,
      shieldOverlay,
      haloRing,
      hpFill,
      labelBadge,
      target,
      aiId,
      hp: 1000,
      maxHp: 1000,
      vx: Math.cos(moveAngle) * baseSpeed,
      vy: Math.sin(moveAngle) * baseSpeed,
      isDead: false,
    };

    this.redrawRobotHp(entity);
    this.targetRobots.push(entity);

    // Enregistre l'overlap avec les projectiles déjà en vol
    for (const proj of this.activeProjectiles) {
      if (!proj.sprite.active) continue;
      this.physics.add.overlap(proj.sprite, container, () => {
        if (!proj.sprite.active || entity.isDead) return;
        this.handleProjectileHitRobot(proj, entity);
      });
    }
  }

  private destroyAllRobotsVisual(): void {
    for (const robot of this.targetRobots) {
      robot.isDead = true;
      if (robot.container.scene) {
        robot.container.destroy();
      }
    }
    this.targetRobots = [];
  }

  private removeProjectile(sprite: Phaser.Physics.Arcade.Image): void {
    const idx = this.activeProjectiles.findIndex((p) => p.sprite === sprite);
    if (idx !== -1) {
      this.activeProjectiles.splice(idx, 1);
    }
    if (sprite.scene) {
      sprite.destroy();
    }
  }

  private redrawHeroOverheadBars(): void {
    const g = this.heroBarGfx;
    g.clear();

    // Barre de PV segmentée (1 segment par tranche de 1000 PV)
    const barW = 78;
    const barH = 10;
    const startX = -barW / 2;
    const hpY = -66;
    const ratio = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);

    g.fillStyle(0x020617, 0.9);
    g.fillRoundedRect(startX - 2, hpY - 2, barW + 4, barH + 4, 4);
    g.fillStyle(ratio > 0.35 ? 0x22c55e : 0xef4444, 1);
    g.fillRoundedRect(startX, hpY, barW * ratio, barH, 3);

    const segments = Math.max(2, Math.round(this.maxHp / 1000));
    g.lineStyle(1.5, 0x020617, 0.85);
    for (let s = 1; s < segments; s++) {
      const tickX = startX + (barW * s) / segments;
      g.beginPath();
      g.moveTo(tickX, hpY);
      g.lineTo(tickX, hpY + barH);
      g.strokePath();
    }

    // 3 barres de munitions sous les PV
    const ammoY = -51;
    const slotW = 24;
    const gap = 3;
    const totalAmmoW = slotW * 3 + gap * 2;
    const ammoStartX = -totalAmmoW / 2;

    for (let i = 0; i < 3; i++) {
      const sx = ammoStartX + i * (slotW + gap);
      const fill = Phaser.Math.Clamp(this.ammo - i, 0, 1);
      g.fillStyle(0x020617, 0.88);
      g.fillRoundedRect(sx - 1, ammoY - 1, slotW + 2, 7, 2);
      if (fill > 0) {
        g.fillStyle(fill >= 1 ? 0xf97316 : 0xfdba74, 1);
        g.fillRoundedRect(sx, ammoY, slotW * fill, 5, 2);
      }
    }
  }

  private redrawRobotHp(robot: ITargetRobotEntity): void {
    const g = robot.hpFill;
    g.clear();
    const ratio = Phaser.Math.Clamp(robot.hp / robot.maxHp, 0, 1);
    g.fillStyle(0x020617, 0.85);
    g.fillRoundedRect(-26, -42, 52, 7, 3);
    g.fillStyle(0xf87171, 1);
    g.fillRoundedRect(-25, -41, 50 * ratio, 5, 2);
  }

  private playSquashStretch(scaleX: number, scaleY: number, durationMs: number): void {
    if (this.squashTween) {
      this.squashTween.stop();
    }
    this.heroSprite.setScale(scaleX, scaleY);
    this.squashTween = this.tweens.add({
      targets: this.heroSprite,
      scaleX: 1,
      scaleY: 1,
      duration: durationMs,
      ease: 'Back.easeOut',
    });
  }

  private triggerSlowMoFinish(won: boolean, focusX?: number, focusY?: number): void {
    if (this.matchEnded) return;
    this.matchEnded = true;
    this.heroBody.setVelocity(0, 0);
    this.pendingSlowMoWon = won;

    FloatingCombatText.spawn(
      this,
      focusX ?? this.heroContainer.x,
      (focusY ?? this.heroContainer.y) - 64,
      won ? '🏆 COUP FINAL !' : '⏱️ FIN DU TEMPS !',
      { color: won ? '#facc15' : '#38bdf8', fontSize: 32, scalePeak: 1.55 }
    );

    this.victorySlowMo.triggerFinalBlow({
      focusX: focusX ?? this.heroContainer.x,
      focusY: focusY ?? this.heroContainer.y,
      victory: won,
      label: won ? 'VICTOIRE ÉCLATANTE !' : 'FIN DU TEMPS !',
      onPodiumReady: () => {
        if (this.pendingSlowMoWon !== null) {
          const finalWon = this.pendingSlowMoWon;
          this.pendingSlowMoWon = null;
          this.cameras.main.setZoom(1);
          this.physics.world.timeScale = 1;
          this.finishMatch(finalWon);
        }
      },
    });
  }

  private finishMatch(won: boolean): void {
    this.matchEnded = true;
    this.pendingSlowMoWon = null;
    this.heroBody.setVelocity(0, 0);

    const suggestedRarity: StarrDropRarity =
      won && this.consecutiveHits >= 5
        ? 'LEGENDAIRE'
        : won && this.consecutiveHits >= 3
          ? 'EPIQUE'
          : won
            ? 'SUPER_RARE'
            : 'RARE';

    this.game.events.emit(ARENA_EVENTS.ARENA_MATCH_VICTORY, {
      won,
      objectiveScore: this.objectiveScore,
      correctHits: this.correctHitsCount,
      fastReflexHits: this.fastReflexHitsCount,
      missedQuestions: this.missedQuestions,
      mode: this.modeRules.mode,
      brawler: this.brawler,
      suggestedRarity,
    });

    this.initData.onMatchFinished?.({
      won,
      objectiveScore: this.objectiveScore,
      correctHits: this.correctHitsCount,
      fastReflexHits: this.fastReflexHitsCount,
      missedQuestions: this.missedQuestions,
      modeId: this.modeRules.mode.id,
    });
  }

  private broadcastStats(force: boolean): void {
    void force;
    this.game.events.emit(ARENA_EVENTS.ARENA_STATS_UPDATED, {
      hp: this.hp,
      maxHp: this.maxHp,
      ammo: this.ammo,
      maxAmmo: this.brawler.max_ammo_bars,
      superPct: this.superPct,
      gadgetCharges: this.gadgetCharges,
      comboMultiplier: this.comboMultiplier,
      consecutiveHits: this.consecutiveHits,
      objectiveScore: this.objectiveScore,
      objectiveTarget: this.modeRules.objectiveTarget,
      timeRemainingSec: this.timeRemainingSec,
      brawler: this.brawler,
      mode: this.modeRules.mode,
    });
  }
}
