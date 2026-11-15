import Phaser from 'phaser';
import gsap from 'gsap';
import type { BrawlerId, GameModeId } from '../types/cctp';
import { getNeuroTraitProfile } from '../entities/NeuroTraits';
import { ModeRulesConnector, soundFX } from '../engine/SoundFX';
import { TEXTURE_KEYS, TextureFactory } from '../engine/TextureFactory';

export interface ILobbySceneInitData {
  brawlerId?: BrawlerId;
  modeId?: GameModeId;
  playerNickname?: string;
  trophies?: number;
  onPlayRequested?: (brawlerId: BrawlerId, modeId: GameModeId) => void;
}

const FONT_SUPERCELL = '"Lilita One", "Arial Black", sans-serif';

/**
 * Scène Lobby WebGL Phaser 3/4 style Supercell (podium 2.5D, rayons rotatifs,
 * sélection rapide et transition directe vers ArenaScene + HUDScene).
 */
export class LobbyScene extends Phaser.Scene {
  private initData: ILobbySceneInitData = {};
  private selectedBrawlerId: BrawlerId = 'TIMO';
  private selectedModeId: GameModeId = 'CHASSE_AUX_BONNES_NOTES';
  private raysTween: gsap.core.Tween | null = null;

  constructor() {
    super({ key: 'LobbyScene' });
  }

  public init(data?: ILobbySceneInitData): void {
    this.initData = data ?? {};
    this.selectedBrawlerId = this.initData.brawlerId ?? 'TIMO';
    this.selectedModeId = this.initData.modeId ?? 'CHASSE_AUX_BONNES_NOTES';
  }

  public create(): void {
    TextureFactory.generateAll(this);

    const { width, height } = this.scale;
    const cx = width * 0.5;
    const cy = height * 0.5;

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0b1538, 0x0b1538, 0x020617, 0x020617, 1);
    bg.fillRect(0, 0, width, height);

    const raysContainer = this.add.container(cx, cy - 10);
    for (let i = 0; i < 10; i += 1) {
      const ray = this.add.image(0, 0, TEXTURE_KEYS.LIGHT_RAY_BEAM);
      ray.setOrigin(0.5, 1);
      ray.setAngle((360 / 10) * i);
      ray.setAlpha(0.28);
      ray.setScale(0.85, 1.45);
      raysContainer.add(ray);
    }

    this.raysTween = gsap.to(raysContainer, {
      rotation: Math.PI * 2,
      duration: 18,
      repeat: -1,
      ease: 'none',
    });

    const brawler = ModeRulesConnector.getBrawler(this.selectedBrawlerId);
    const rules = ModeRulesConnector.getRules(this.selectedModeId);
    const neuroTrait = getNeuroTraitProfile(this.selectedBrawlerId);

    this.add.image(cx, cy + 56, TEXTURE_KEYS.SHADOW_ELLIPSE).setScale(1.45, 0.9);
    const heroImg = this.add
      .image(cx, cy - 12, TextureFactory.getBrawlerTextureKey(this.selectedBrawlerId))
      .setScale(1.55);

    this.tweens.add({
      targets: heroImg,
      y: cy - 22,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const nick = this.initData.playerNickname ?? brawler.name;
    const trophies = this.initData.trophies ?? 0;

    this.add
      .text(cx, 44, `🎒 ${nick.toUpperCase()}  •  🏆 ${trophies} TROPHÉES`, {
        fontFamily: FONT_SUPERCELL,
        fontSize: '20px',
        color: '#facc15',
        stroke: '#020617',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy + 88, `${brawler.name.toUpperCase()} — ${neuroTrait.icon} ${neuroTrait.cognitiveBadge}`, {
        fontFamily: FONT_SUPERCELL,
        fontSize: '22px',
        color: '#e0f2fe',
        stroke: '#020617',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy + 122, `${rules.bannerTag} : ${rules.mode.name}`, {
        fontFamily: FONT_SUPERCELL,
        fontSize: '16px',
        color: '#38bdf8',
        stroke: '#020617',
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    const playBtn = this.add
      .text(cx, height - 68, '⚔️ JOUER !', {
        fontFamily: FONT_SUPERCELL,
        fontSize: '28px',
        color: '#0f172a',
        backgroundColor: '#facc15',
        padding: { left: 34, right: 34, top: 12, bottom: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    playBtn.on('pointerdown', () => {
      soundFX.unlock();
      soundFX.playSuperReady();
      if (this.initData.onPlayRequested) {
        this.initData.onPlayRequested(this.selectedBrawlerId, this.selectedModeId);
      } else {
        this.scene.start('ArenaScene', {
          brawlerId: this.selectedBrawlerId,
          modeId: this.selectedModeId,
          questions: this.registry.get('questionsPool300'),
        });
        this.scene.launch('HUDScene');
      }
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.raysTween?.kill();
      this.raysTween = null;
    });
  }
}
