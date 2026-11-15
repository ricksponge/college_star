import Phaser from 'phaser';
import gsap from 'gsap';
import type {
  IBrawler,
  IGameMode,
  IQuestion,
  IStarrDropReward,
  StarrDropRarity,
  SubjectCategory,
} from '../types/cctp';
import { SpeechReader } from '../accessibility/SpeechReader';
import { ARENA_EVENTS } from './ArenaScene';
import { soundFX } from '../engine/SoundFX';
import { RARITY_COLORS, TEXTURE_KEYS, TextureFactory } from '../engine/TextureFactory';

const FONT_SUPERCELL = '"Lilita One", "Arial Black", sans-serif';

const SUBJECT_BADGE_MAP: Record<SubjectCategory, { label: string; color: string }> = {
  mathematiques: { label: 'MATHS', color: '#facc15' },
  francais: { label: 'FRANÇAIS', color: '#c084fc' },
  anglais: { label: 'ANGLAIS', color: '#22d3ee' },
  histoire_geo_sciences: { label: 'HIST-GÉO / SCI.', color: '#4ade80' },
  vie_au_college: { label: 'COLLÈGE 6e', color: '#38bdf8' },
};

const RARITY_ORDER: StarrDropRarity[] = ['RARE', 'SUPER_RARE', 'EPIQUE', 'LEGENDAIRE'];

const SECRET_TIPS_6E = [
  'Astuce 6e : Prépare ton cartable la veille selon Semaine A / B !',
  'Astuce 6e : Salle 204 = 2ème étage, porte 04 !',
  'Astuce 6e : Au CDI, demande conseil au professeur-documentaliste !',
  'Astuce 6e : Le CPE accompagne toute la vie scolaire au quotidien !',
];

interface IJoystickTracker {
  pointerId: number | null;
  originX: number;
  originY: number;
  knobX: number;
  knobY: number;
  vx: number;
  vy: number;
  active: boolean;
}

interface IStatsPayload {
  hp: number;
  maxHp: number;
  ammo: number;
  maxAmmo: number;
  superPct: number;
  gadgetCharges: number;
  comboMultiplier: number;
  consecutiveHits: number;
  objectiveScore: number;
  objectiveTarget: number;
  timeRemainingSec: number;
  brawler: IBrawler;
  mode: IGameMode;
}

export class HUDScene extends Phaser.Scene {
  private moveStick: IJoystickTracker = {
    pointerId: null,
    originX: 130,
    originY: 400,
    knobX: 130,
    knobY: 400,
    vx: 0,
    vy: 0,
    active: false,
  };

  private aimStick: IJoystickTracker = {
    pointerId: null,
    originX: 600,
    originY: 400,
    knobX: 600,
    knobY: 400,
    vx: 0,
    vy: 0,
    active: false,
  };

  private sticksGfx!: Phaser.GameObjects.Graphics;

  // Bandeau QCM supérieur
  private questionBanner!: Phaser.GameObjects.Container;
  private bannerBg!: Phaser.GameObjects.Graphics;
  private subjectPillText!: Phaser.GameObjects.Text;
  private questionPromptText!: Phaser.GameObjects.Text;
  private timerScoreText!: Phaser.GameObjects.Text;
  private comboBadgeText!: Phaser.GameObjects.Text;

  // Bulle corrective flash (1200 ms)
  private flashToast!: Phaser.GameObjects.Container;
  private flashToastBg!: Phaser.GameObjects.Graphics;
  private flashToastText!: Phaser.GameObjects.Text;
  private flashTimerEvent: Phaser.Time.TimerEvent | null = null;

  // Bouton Super doré pulsant & Gadget vert
  private superBtnContainer!: Phaser.GameObjects.Container;
  private superBtnBg!: Phaser.GameObjects.Graphics;
  private superBtnLabel!: Phaser.GameObjects.Text;
  private superPulseTween: gsap.core.Tween | null = null;
  private superPct = 0;

  private gadgetBtnContainer!: Phaser.GameObjects.Container;
  private gadgetBtnBg!: Phaser.GameObjects.Graphics;
  private gadgetCountText!: Phaser.GameObjects.Text;
  private gadgetCharges = 3;

  // Boutons utilitaires haut droite
  private muteBtn!: Phaser.GameObjects.Text;
  private quitBtn!: Phaser.GameObjects.Text;
  private hintBtn!: Phaser.GameObjects.Text;
  private readBtn!: Phaser.GameObjects.Text;
  private starrShortcutBtn!: Phaser.GameObjects.Text;
  private speechReader = new SpeechReader();
  private lastQuestionPrompt = '';
  private currentQuestion: IQuestion | null = null;

  // Modale Casier Mystère à 5 clics
  private starrOverlay!: Phaser.GameObjects.Container;
  private starrBackdrop!: Phaser.GameObjects.Rectangle;
  private starrRaysContainer!: Phaser.GameObjects.Container;
  private starrRaySprites: Phaser.GameObjects.Image[] = [];
  private starrCoreSprite!: Phaser.GameObjects.Image;
  private starrRarityText!: Phaser.GameObjects.Text;
  private starrTapHintText!: Phaser.GameObjects.Text;
  private starrRewardText!: Phaser.GameObjects.Text;
  private starrCloseBtn!: Phaser.GameObjects.Text;
  private starrTapCount = 0;
  private starrCurrentRarity: StarrDropRarity = 'RARE';
  private starrIsRevealed = false;
  private starrRaySpinTween: gsap.core.Tween | null = null;

  private readonly stickMaxRadius = 56;

  constructor() {
    super({ key: 'HUDScene' });
  }

  public create(): void {
    TextureFactory.generateAll(this);

    // Multi-touch mobile : garantit pouce gauche + pouce droit + boutons Super/Gadget simultanés
    this.input.addPointer(2);

    this.sticksGfx = this.add.graphics().setDepth(100);
    this.createQuestionBanner();
    this.createExplanationToast();
    this.createActionButtons();
    this.createUtilityButtons();
    this.createStarrDropModal();

    this.setupMultiTouchJoysticks();
    this.bindArenaEvents();
    this.relayout(this.scale.width, this.scale.height);

    const onResize = (gameSize: Phaser.Structs.Size) => {
      this.relayout(gameSize.width, gameSize.height);
    };
    this.scale.on('resize', onResize);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', onResize);
      this.superPulseTween?.kill();
      this.starrRaySpinTween?.kill();
    });
  }

  public openStarrDropModal(initialRarity: StarrDropRarity = 'RARE'): void {
    this.starrTapCount = 0;
    this.starrIsRevealed = false;
    this.starrCurrentRarity = initialRarity;

    this.starrOverlay.setVisible(true);
    this.starrOverlay.setAlpha(0);
    this.starrRewardText.setVisible(false);
    this.starrCloseBtn.setVisible(false);
    this.starrTapHintText.setVisible(true);
    this.starrTapHintText.setText('TAPOTE 5 FOIS POUR OUVRIR ! (0/5)');
    this.starrCoreSprite.setScale(0.75);
    this.applyRarityVisuals(this.starrCurrentRarity);

    gsap.to(this.starrOverlay, { alpha: 1, duration: 0.24, ease: 'power2.out' });
    gsap.fromTo(
      this.starrCoreSprite,
      { scale: 0.4, angle: -10 },
      { scale: 1.0, angle: 0, duration: 0.42, ease: 'back.out(1.9)' }
    );

    this.starrRaySpinTween?.kill();
    this.starrRaysContainer.rotation = 0;
    this.starrRaySpinTween = gsap.to(this.starrRaysContainer, {
      rotation: Math.PI * 2,
      duration: 9,
      repeat: -1,
      ease: 'none',
    });
  }

  private createQuestionBanner(): void {
    this.bannerBg = this.add.graphics();
    this.subjectPillText = this.add
      .text(0, -28, 'MATHS', {
        fontFamily: FONT_SUPERCELL,
        fontSize: '15px',
        color: '#020617',
        backgroundColor: '#facc15',
        padding: { left: 10, right: 10, top: 2, bottom: 2 },
      })
      .setOrigin(0.5, 0.5);

    this.questionPromptText = this.add
      .text(0, 8, 'Prépare-toi au défi !', {
        fontFamily: FONT_SUPERCELL,
        fontSize: '26px',
        color: '#ffffff',
        stroke: '#020617',
        strokeThickness: 7,
        align: 'center',
      })
      .setOrigin(0.5, 0.5);

    this.timerScoreText = this.add
      .text(0, 38, '⏱ 02:15  •  🎯 0/10', {
        fontFamily: FONT_SUPERCELL,
        fontSize: '15px',
        color: '#bae6fd',
        stroke: '#020617',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0.5);

    this.comboBadgeText = this.add
      .text(220, -24, 'COMBO x1.0', {
        fontFamily: FONT_SUPERCELL,
        fontSize: '15px',
        color: '#facc15',
        stroke: '#020617',
        strokeThickness: 5,
      })
      .setOrigin(0.5, 0.5);

    this.questionBanner = this.add
      .container(400, 56, [
        this.bannerBg,
        this.subjectPillText,
        this.questionPromptText,
        this.timerScoreText,
        this.comboBadgeText,
      ])
      .setDepth(200);

    this.redrawQuestionBannerBg(560);
  }

  private redrawQuestionBannerBg(width: number): void {
    this.bannerBg.clear();
    const w = Math.min(640, Math.max(320, width));
    const h = 92;
    this.bannerBg.fillStyle(0x0f172a, 0.9);
    this.bannerBg.lineStyle(4, 0x38bdf8, 0.95);
    this.bannerBg.fillRoundedRect(-w / 2, -h / 2 + 4, w, h, 20);
    this.bannerBg.strokeRoundedRect(-w / 2, -h / 2 + 4, w, h, 20);
  }

  private createExplanationToast(): void {
    this.flashToastBg = this.add.graphics();
    this.flashToastText = this.add
      .text(0, 0, '', {
        fontFamily: FONT_SUPERCELL,
        fontSize: '18px',
        color: '#fef2f2',
        stroke: '#020617',
        strokeThickness: 5,
        align: 'center',
        wordWrap: { width: 460 },
      })
      .setOrigin(0.5, 0.5);

    this.flashToast = this.add
      .container(400, 140, [this.flashToastBg, this.flashToastText])
      .setDepth(250)
      .setVisible(false);
  }

  private createActionButtons(): void {
    // Bouton Super doré pulsant
    this.superBtnBg = this.add.graphics();
    this.superBtnLabel = this.add
      .text(0, 0, 'SUPER\n0%', {
        fontFamily: FONT_SUPERCELL,
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#020617',
        strokeThickness: 6,
        align: 'center',
      })
      .setOrigin(0.5, 0.5);

    this.superBtnContainer = this.add
      .container(700, 420, [this.superBtnBg, this.superBtnLabel])
      .setDepth(180)
      .setSize(96, 96)
      .setInteractive({ useHandCursor: true });

    this.superBtnContainer.on('pointerdown', () => {
      soundFX.unlock();
      if (this.superPct >= 100) {
        this.game.events.emit(ARENA_EVENTS.HUD_SUPER_TRIGGER);
      }
    });

    // Bouton Gadget vert (3 charges)
    this.gadgetBtnBg = this.add.graphics();
    this.gadgetCountText = this.add
      .text(0, 0, 'GADGET\n3/3', {
        fontFamily: FONT_SUPERCELL,
        fontSize: '14px',
        color: '#ecfdf5',
        stroke: '#020617',
        strokeThickness: 5,
        align: 'center',
      })
      .setOrigin(0.5, 0.5);

    this.gadgetBtnContainer = this.add
      .container(600, 460, [this.gadgetBtnBg, this.gadgetCountText])
      .setDepth(180)
      .setSize(72, 72)
      .setInteractive({ useHandCursor: true });

    this.gadgetBtnContainer.on('pointerdown', () => {
      soundFX.unlock();
      if (this.gadgetCharges > 0) {
        this.game.events.emit(ARENA_EVENTS.HUD_GADGET_TRIGGER);
      }
    });

    this.redrawSuperButton(0);
    this.redrawGadgetButton(3);
  }

  private createUtilityButtons(): void {
    this.quitBtn = this.add
      .text(16, 14, '✖ QUITTER', {
        fontFamily: FONT_SUPERCELL,
        fontSize: '14px',
        color: '#fecaca',
        backgroundColor: 'rgba(127, 29, 29, 0.9)',
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
        stroke: '#020617',
        strokeThickness: 4,
      })
      .setDepth(210)
      .setInteractive({ useHandCursor: true });

    this.quitBtn.on('pointerdown', () => {
      this.speechReader.stop();
      this.game.events.emit(ARENA_EVENTS.HUD_QUIT_REQUESTED);
    });

    this.muteBtn = this.add
      .text(112, 14, '🔊 SON', {
        fontFamily: FONT_SUPERCELL,
        fontSize: '14px',
        color: '#f8fafc',
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
        stroke: '#020617',
        strokeThickness: 4,
      })
      .setDepth(210)
      .setInteractive({ useHandCursor: true });

    this.muteBtn.on('pointerdown', () => {
      const muted = soundFX.toggleMuted();
      this.muteBtn.setText(muted ? '🔇 MUET' : '🔊 SON');
    });

    this.hintBtn = this.add
      .text(16, 52, '💡 INDICE', {
        fontFamily: FONT_SUPERCELL,
        fontSize: '14px',
        color: '#fef08a',
        backgroundColor: 'rgba(30, 58, 138, 0.9)',
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
        stroke: '#020617',
        strokeThickness: 4,
      })
      .setDepth(210)
      .setInteractive({ useHandCursor: true });

    this.hintBtn.on('pointerdown', () => {
      this.game.events.emit(ARENA_EVENTS.HUD_HINT_REQUESTED);
    });

    this.readBtn = this.add
      .text(112, 52, '🗣️ LIRE', {
        fontFamily: FONT_SUPERCELL,
        fontSize: '14px',
        color: '#bae6fd',
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
        stroke: '#020617',
        strokeThickness: 4,
      })
      .setDepth(210)
      .setInteractive({ useHandCursor: true });

    this.readBtn.on('pointerdown', () => {
      if (this.currentQuestion) {
        this.speechReader.speakQuestion(this.currentQuestion, true);
      } else if (this.lastQuestionPrompt) {
        this.speechReader.speakText(this.lastQuestionPrompt);
      }
    });

    this.starrShortcutBtn = this.add
      .text(780, 14, '★ CASIER', {
        fontFamily: FONT_SUPERCELL,
        fontSize: '15px',
        color: '#020617',
        backgroundColor: '#facc15',
        padding: { left: 12, right: 12, top: 6, bottom: 6 },
      })
      .setOrigin(1, 0)
      .setDepth(210)
      .setInteractive({ useHandCursor: true });

    this.starrShortcutBtn.on('pointerdown', () => {
      soundFX.unlock();
      this.openStarrDropModal('RARE');
    });
  }

  private createStarrDropModal(): void {
    this.starrBackdrop = this.add
      .rectangle(0, 0, 1280, 720, 0x020617, 0.86)
      .setOrigin(0.5, 0.5)
      .setInteractive();

    this.starrRaysContainer = this.add.container(0, -10);
    this.starrRaySprites = [];
    const rayCount = 8;
    for (let i = 0; i < rayCount; i++) {
      const ray = this.add
        .image(0, 0, TEXTURE_KEYS.LIGHT_RAY_BEAM)
        .setOrigin(0.5, 1)
        .setRotation((Math.PI * 2 * i) / rayCount)
        .setAlpha(0.45)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.starrRaySprites.push(ray);
      this.starrRaysContainer.add(ray);
    }

    this.starrCoreSprite = this.add
      .image(0, -10, TEXTURE_KEYS.STARR_DROP_CORE)
      .setInteractive({ useHandCursor: true });

    this.starrRarityText = this.add
      .text(0, -155, 'CASIER MYSTÈRE — RARE', {
        fontFamily: FONT_SUPERCELL,
        fontSize: '32px',
        color: '#4ade80',
        stroke: '#020617',
        strokeThickness: 8,
      })
      .setOrigin(0.5, 0.5);

    this.starrTapHintText = this.add
      .text(0, 128, 'TAPOTE 5 FOIS POUR OUVRIR ! (0/5)', {
        fontFamily: FONT_SUPERCELL,
        fontSize: '22px',
        color: '#ffffff',
        stroke: '#020617',
        strokeThickness: 6,
      })
      .setOrigin(0.5, 0.5);

    this.starrRewardText = this.add
      .text(0, 148, '', {
        fontFamily: FONT_SUPERCELL,
        fontSize: '21px',
        color: '#fef08a',
        stroke: '#020617',
        strokeThickness: 6,
        align: 'center',
      })
      .setOrigin(0.5, 0.5)
      .setVisible(false);

    this.starrCloseBtn = this.add
      .text(0, 232, 'REJOUER EN ARÈNE', {
        fontFamily: FONT_SUPERCELL,
        fontSize: '22px',
        color: '#020617',
        backgroundColor: '#facc15',
        padding: { left: 22, right: 22, top: 10, bottom: 10 },
      })
      .setOrigin(0.5, 0.5)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });

    this.starrCloseBtn.on('pointerdown', () => {
      this.starrRaySpinTween?.kill();
      this.starrOverlay.setVisible(false);
    });

    const handleTap = () => {
      if (this.starrIsRevealed) return;
      soundFX.unlock();
      this.handleStarrDropTap();
    };
    this.starrCoreSprite.on('pointerdown', handleTap);
    this.starrBackdrop.on('pointerdown', handleTap);

    this.starrOverlay = this.add
      .container(400, 300, [
        this.starrBackdrop,
        this.starrRaysContainer,
        this.starrCoreSprite,
        this.starrRarityText,
        this.starrTapHintText,
        this.starrRewardText,
        this.starrCloseBtn,
      ])
      .setDepth(500)
      .setVisible(false);
  }

  private handleStarrDropTap(): void {
    this.starrTapCount += 1;

    // Montée en rareté possible durant les clics 1 à 4
    if (this.starrTapCount < 5) {
      const idx = RARITY_ORDER.indexOf(this.starrCurrentRarity);
      if (idx < RARITY_ORDER.length - 1 && Math.random() < 0.42) {
        this.starrCurrentRarity = RARITY_ORDER[idx + 1];
      }
      this.applyRarityVisuals(this.starrCurrentRarity);
      soundFX.playStarrDropTap(this.starrTapCount, this.starrCurrentRarity);

      this.starrTapHintText.setText(`TAPOTE 5 FOIS POUR OUVRIR ! (${this.starrTapCount}/5)`);

      gsap.fromTo(
        this.starrCoreSprite,
        { scale: 1.24, angle: this.starrTapCount % 2 === 0 ? -9 : 9 },
        { scale: 1 + this.starrTapCount * 0.06, angle: 0, duration: 0.28, ease: 'elastic.out(1, 0.4)' }
      );
      return;
    }

    // 5ème clic : ouverture complète & récompense
    this.starrIsRevealed = true;
    soundFX.playStarrDropReveal(this.starrCurrentRarity);
    this.applyRarityVisuals(this.starrCurrentRarity);

    const reward = this.buildStarrDropReward(this.starrCurrentRarity);
    this.starrTapHintText.setVisible(false);
    this.starrRewardText.setVisible(true);
    this.starrCloseBtn.setVisible(true);
    this.starrRewardText.setText(
      `+${reward.coins_granted} PIÈCES  •  +${reward.trophies_granted} TROPHÉES  •  +${reward.knowledge_points_granted} SAVOIR\n${reward.secret_tip_6e ?? ''}`
    );

    gsap.fromTo(
      this.starrCoreSprite,
      { scale: 1.65 },
      { scale: 1.15, duration: 0.45, ease: 'back.out(2)' }
    );
    gsap.fromTo(
      this.starrRewardText,
      { y: 185, alpha: 0 },
      { y: 148, alpha: 1, duration: 0.36, ease: 'back.out(1.7)' }
    );
  }

  private applyRarityVisuals(rarity: StarrDropRarity): void {
    const meta = RARITY_COLORS[rarity];
    this.starrRarityText.setText(`CASIER MYSTÈRE — ${meta.label}`);
    this.starrRarityText.setColor(meta.css);
    this.starrCoreSprite.setTint(rarity === 'LEGENDAIRE' ? 0xffffff : meta.hex);

    const rayScale = 1 + RARITY_ORDER.indexOf(rarity) * 0.22;
    for (const ray of this.starrRaySprites) {
      ray.setTint(meta.hex);
      ray.setScale(rayScale, rayScale);
    }
  }

  private buildStarrDropReward(rarity: StarrDropRarity): IStarrDropReward {
    const mult = RARITY_ORDER.indexOf(rarity) + 1;
    return {
      final_rarity: rarity,
      taps_count: 4,
      coins_granted: 60 * mult,
      trophies_granted: 12 * mult,
      knowledge_points_granted: 25 * mult,
      secret_tip_6e: SECRET_TIPS_6E[Math.floor(Math.random() * SECRET_TIPS_6E.length)],
    };
  }

  private setupMultiTouchJoysticks(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      soundFX.unlock();
      if (this.starrOverlay.visible) return;
      // Ignore les clics directement sur les boutons d'action ou haut d'écran
      if (pointer.y < 96) return;
      if (this.isPointInsideActionButton(pointer.x, pointer.y)) return;

      const halfW = this.scale.width * 0.5;
      if (pointer.x < halfW && this.moveStick.pointerId === null) {
        this.moveStick.pointerId = pointer.id;
        this.moveStick.originX = pointer.x;
        this.moveStick.originY = pointer.y;
        this.moveStick.knobX = pointer.x;
        this.moveStick.knobY = pointer.y;
        this.moveStick.vx = 0;
        this.moveStick.vy = 0;
        this.moveStick.active = true;
        this.redrawJoysticks();
      } else if (pointer.x >= halfW && this.aimStick.pointerId === null) {
        this.aimStick.pointerId = pointer.id;
        this.aimStick.originX = pointer.x;
        this.aimStick.originY = pointer.y;
        this.aimStick.knobX = pointer.x;
        this.aimStick.knobY = pointer.y;
        this.aimStick.vx = 0;
        this.aimStick.vy = 0;
        this.aimStick.active = true;
        this.redrawJoysticks();
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.moveStick.pointerId) {
        this.updateStickVector(this.moveStick, pointer.x, pointer.y);
        this.game.events.emit(ARENA_EVENTS.HUD_MOVE_STICK, {
          vx: this.moveStick.vx,
          vy: this.moveStick.vy,
          active: true,
        });
        this.redrawJoysticks();
      } else if (pointer.id === this.aimStick.pointerId) {
        this.updateStickVector(this.aimStick, pointer.x, pointer.y);
        this.game.events.emit(ARENA_EVENTS.HUD_AIM_STICK, {
          vx: this.aimStick.vx,
          vy: this.aimStick.vy,
          active: true,
        });
        this.redrawJoysticks();
      }
    });

    const releasePointer = (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.moveStick.pointerId) {
        this.moveStick.pointerId = null;
        this.moveStick.active = false;
        this.moveStick.vx = 0;
        this.moveStick.vy = 0;
        this.game.events.emit(ARENA_EVENTS.HUD_MOVE_STICK, { vx: 0, vy: 0, active: false });
        this.redrawJoysticks();
      } else if (pointer.id === this.aimStick.pointerId) {
        const power = Math.hypot(this.aimStick.vx, this.aimStick.vy);
        const angle = Math.atan2(this.aimStick.vy, this.aimStick.vx);
        this.aimStick.pointerId = null;
        this.aimStick.active = false;
        this.aimStick.vx = 0;
        this.aimStick.vy = 0;
        this.game.events.emit(ARENA_EVENTS.HUD_AIM_STICK, { vx: 0, vy: 0, active: false });
        if (power > 0.16) {
          this.game.events.emit(ARENA_EVENTS.HUD_FIRE_RELEASE, { angle, power });
        }
        this.redrawJoysticks();
      }
    };

    this.input.on('pointerup', releasePointer);
    this.input.on('pointercancel', releasePointer);
  }

  private updateStickVector(stick: IJoystickTracker, px: number, py: number): void {
    const dx = px - stick.originX;
    const dy = py - stick.originY;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, this.stickMaxRadius);
    const angle = Math.atan2(dy, dx);
    stick.knobX = stick.originX + Math.cos(angle) * clamped;
    stick.knobY = stick.originY + Math.sin(angle) * clamped;
    const norm = clamped / this.stickMaxRadius;
    stick.vx = Math.cos(angle) * norm;
    stick.vy = Math.sin(angle) * norm;
  }

  private isPointInsideActionButton(x: number, y: number): boolean {
    const distSuper = Phaser.Math.Distance.Between(x, y, this.superBtnContainer.x, this.superBtnContainer.y);
    const distGadget = Phaser.Math.Distance.Between(
      x,
      y,
      this.gadgetBtnContainer.x,
      this.gadgetBtnContainer.y
    );
    return distSuper <= 56 || distGadget <= 44;
  }

  private redrawJoysticks(): void {
    this.sticksGfx.clear();
    const drawStick = (stick: IJoystickTracker, ringColor: number, knobColor: number) => {
      if (!stick.active) return;
      this.sticksGfx.fillStyle(ringColor, 0.16);
      this.sticksGfx.lineStyle(3, ringColor, 0.72);
      this.sticksGfx.fillCircle(stick.originX, stick.originY, this.stickMaxRadius);
      this.sticksGfx.strokeCircle(stick.originX, stick.originY, this.stickMaxRadius);

      this.sticksGfx.fillStyle(knobColor, 0.92);
      this.sticksGfx.lineStyle(3, 0x020617, 0.9);
      this.sticksGfx.fillCircle(stick.knobX, stick.knobY, 24);
      this.sticksGfx.strokeCircle(stick.knobX, stick.knobY, 24);
    };

    drawStick(this.moveStick, 0x38bdf8, 0x7dd3fc);
    drawStick(this.aimStick, 0xf97316, 0xfdba74);
  }

  private bindArenaEvents(): void {
    const onQuestionChanged = (payload: { question: IQuestion; mode: IGameMode }) => {
      this.currentQuestion = payload.question;
      this.lastQuestionPrompt = payload.question.hud_prompt;
      const meta = SUBJECT_BADGE_MAP[payload.question.subject] ?? SUBJECT_BADGE_MAP.vie_au_college;
      this.subjectPillText.setText(meta.label);
      this.subjectPillText.setBackgroundColor(meta.color);
      this.questionPromptText.setText(payload.question.hud_prompt);
      this.speechReader.speakQuestion(payload.question, false);

      gsap.fromTo(
        this.questionBanner,
        { scale: 0.78, alpha: 0.4 },
        { scale: 1, alpha: 1, duration: 0.36, ease: 'back.out(1.7)' }
      );
    };

    const onStatsUpdated = (stats: IStatsPayload) => {
      const mins = Math.floor(stats.timeRemainingSec / 60);
      const secs = String(stats.timeRemainingSec % 60).padStart(2, '0');
      this.timerScoreText.setText(
        `⏱ ${mins}:${secs}  •  🎯 ${stats.objectiveScore}/${stats.objectiveTarget}  •  ${stats.brawler.name.toUpperCase()}`
      );
      this.comboBadgeText.setText(`COMBO x${stats.comboMultiplier.toFixed(2)}`);

      if (Math.round(stats.superPct) !== Math.round(this.superPct)) {
        this.redrawSuperButton(stats.superPct);
      }
      if (stats.gadgetCharges !== this.gadgetCharges) {
        this.redrawGadgetButton(stats.gadgetCharges);
      }
    };

    const onExplanationFlash = (payload: { text: string; durationMs: number }) => {
      this.flashToastBg.clear();
      this.flashToastBg.fillStyle(0x991b1b, 0.94);
      this.flashToastBg.lineStyle(3, 0xf87171, 1);
      this.flashToastBg.fillRoundedRect(-250, -32, 500, 64, 14);
      this.flashToastBg.strokeRoundedRect(-250, -32, 500, 64, 14);

      this.flashToastText.setText(`💡 ${payload.text}`);
      this.flashToast.setVisible(true);

      gsap.fromTo(
        this.flashToast,
        { scale: 0.8, alpha: 0 },
        { scale: 1, alpha: 1, duration: 0.22, ease: 'back.out(1.8)' }
      );

      this.flashTimerEvent?.remove(false);
      this.flashTimerEvent = this.time.delayedCall(payload.durationMs, () => {
        this.flashToast.setVisible(false);
      });
    };

    const onSensoryFreeze = (payload: { durationMs: number }) => {
      this.flashToastBg.clear();
      this.flashToastBg.fillStyle(0x1e3a8a, 0.94);
      this.flashToastBg.lineStyle(3, 0x38bdf8, 1);
      this.flashToastBg.fillRoundedRect(-250, -32, 500, 64, 14);
      this.flashToastBg.strokeRoundedRect(-250, -32, 500, 64, 14);

      this.flashToastText.setText('⏸️ PAUSE LECTURE (3s) — Lis calmement la consigne !');
      this.flashToast.setVisible(true);

      this.flashTimerEvent?.remove(false);
      this.flashTimerEvent = this.time.delayedCall(Math.min(2800, payload.durationMs), () => {
        this.flashToast.setVisible(false);
      });
    };

    const onMatchVictory = (payload: { suggestedRarity: StarrDropRarity }) => {
      this.speechReader.stop();
      if (!this.game.registry.get('externalMatchEndUI')) {
        this.openStarrDropModal(payload.suggestedRarity);
      }
    };

    this.game.events.on(ARENA_EVENTS.ARENA_QUESTION_CHANGED, onQuestionChanged);
    this.game.events.on(ARENA_EVENTS.ARENA_STATS_UPDATED, onStatsUpdated);
    this.game.events.on(ARENA_EVENTS.ARENA_EXPLANATION_FLASH, onExplanationFlash);
    this.game.events.on(ARENA_EVENTS.ARENA_SENSORY_FREEZE, onSensoryFreeze);
    this.game.events.on(ARENA_EVENTS.ARENA_MATCH_VICTORY, onMatchVictory);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.speechReader.stop();
      this.game.events.off(ARENA_EVENTS.ARENA_QUESTION_CHANGED, onQuestionChanged);
      this.game.events.off(ARENA_EVENTS.ARENA_STATS_UPDATED, onStatsUpdated);
      this.game.events.off(ARENA_EVENTS.ARENA_EXPLANATION_FLASH, onExplanationFlash);
      this.game.events.off(ARENA_EVENTS.ARENA_SENSORY_FREEZE, onSensoryFreeze);
      this.game.events.off(ARENA_EVENTS.ARENA_MATCH_VICTORY, onMatchVictory);
    });
  }

  private redrawSuperButton(superPct: number): void {
    const prevReady = this.superPct >= 100;
    this.superPct = Phaser.Math.Clamp(superPct, 0, 100);
    const isReady = this.superPct >= 100;

    const g = this.superBtnBg;
    g.clear();
    g.fillStyle(isReady ? 0xfacc15 : 0x1e293b, 0.95);
    g.lineStyle(5, isReady ? 0xfef08a : 0x475569, 1);
    g.fillCircle(0, 0, 44);
    g.strokeCircle(0, 0, 44);

    if (!isReady && this.superPct > 0) {
      g.lineStyle(6, 0xfacc15, 1);
      g.beginPath();
      g.arc(
        0,
        0,
        44,
        -Math.PI / 2,
        -Math.PI / 2 + (Math.PI * 2 * this.superPct) / 100,
        false
      );
      g.strokePath();
    }

    this.superBtnLabel.setText(isReady ? 'SUPER\nPRÊT!' : `SUPER\n${Math.round(this.superPct)}%`);
    this.superBtnLabel.setColor(isReady ? '#020617' : '#ffffff');
    this.superBtnLabel.setStroke(isReady ? '#fef08a' : '#020617', isReady ? 3 : 6);

    if (isReady && !prevReady) {
      this.superPulseTween?.kill();
      this.superBtnContainer.setScale(1);
      this.superPulseTween = gsap.to(this.superBtnContainer, {
        scale: 1.12,
        duration: 0.45,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });
    } else if (!isReady && prevReady) {
      this.superPulseTween?.kill();
      this.superPulseTween = null;
      this.superBtnContainer.setScale(1);
    }
  }

  private redrawGadgetButton(charges: number): void {
    this.gadgetCharges = charges;
    const active = charges > 0;
    const g = this.gadgetBtnBg;
    g.clear();
    g.fillStyle(active ? 0x22c55e : 0x334155, 0.94);
    g.lineStyle(4, active ? 0x86efac : 0x475569, 1);
    g.fillCircle(0, 0, 34);
    g.strokeCircle(0, 0, 34);
    this.gadgetCountText.setText(`GADGET\n${charges}/3`);
  }

  private relayout(width: number, height: number): void {
    const cx = width * 0.5;
    this.questionBanner.setPosition(cx, 54);
    const bannerW = Math.min(640, width - 220);
    this.redrawQuestionBannerBg(bannerW);
    this.comboBadgeText.setPosition(Math.max(140, bannerW * 0.36), -26);

    this.flashToast.setPosition(cx, 134);

    this.superBtnContainer.setPosition(width - 82, height - 92);
    this.gadgetBtnContainer.setPosition(width - 186, height - 68);

    this.quitBtn.setPosition(16, 14);
    this.muteBtn.setPosition(112, 14);
    this.hintBtn.setPosition(16, 52);
    this.readBtn.setPosition(112, 52);
    this.starrShortcutBtn.setPosition(width - 16, 14);

    this.starrOverlay.setPosition(cx, height * 0.5);
    this.starrBackdrop.setDisplaySize(width + 40, height + 40);
  }
}
