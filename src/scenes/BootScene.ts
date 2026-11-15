import Phaser from 'phaser';
import { SensoryProfile } from '../accessibility/SensoryProfile';
import { preloadSkinThumbnailDataUrls } from '../art/BrawlerSvgGenerator';
import { TextureFactory } from '../engine/TextureFactory';
import { TouchLock } from '../pwa/TouchLock';
import { ALL_QUESTIONS_300 } from '../services/QuestionProvider';
import { ArenaScene, type IArenaSceneInitData } from './ArenaScene';
import { HUDScene } from './HUDScene';
import { LobbyScene } from './LobbyScene';

export interface IBootSceneInitData extends IArenaSceneInitData {
  autoLaunchHud?: boolean;
  startInLobby?: boolean;
  touchLock?: TouchLock;
}

const LILITA_FONT_URL =
  'https://fonts.googleapis.com/css2?family=Lilita+One&display=swap';

export class BootScene extends Phaser.Scene {
  private initData: IBootSceneInitData;

  constructor(initData: IBootSceneInitData = {}) {
    super({ key: 'BootScene' });
    this.initData = initData;
  }

  public init(data?: IBootSceneInitData): void {
    if (data && Object.keys(data).length > 0) {
      this.initData = { ...this.initData, ...data };
    }
  }

  public create(): void {
    const { width, height } = this.scale;
    const cx = width * 0.5;
    const cy = height * 0.5;

    const title = this.add
      .text(cx, cy - 42, 'BRAWL COLLÈGE 6ÈME', {
        fontFamily: '"Lilita One", "Arial Black", sans-serif',
        fontSize: '32px',
        color: '#facc15',
        stroke: '#020617',
        strokeThickness: 8,
      })
      .setOrigin(0.5, 0.5);

    const barBg = this.add.graphics();
    barBg.fillStyle(0x1e293b, 1);
    barBg.lineStyle(3, 0x475569, 1);
    barBg.fillRoundedRect(cx - 160, cy + 4, 320, 24, 12);
    barBg.strokeRoundedRect(cx - 160, cy + 4, 320, 24, 12);

    const barFill = this.add.graphics();
    const updateProgress = (pct: number) => {
      barFill.clear();
      barFill.fillStyle(0xfacc15, 1);
      barFill.fillRoundedRect(cx - 156, cy + 8, Math.max(12, 312 * pct), 16, 8);
    };

    updateProgress(0.25);

    // Préchauffe toutes les textures HD GPU + SVG HD + base de 300 questions (200 scolaires + 100 prévention)
    TextureFactory.generateAll(this);
    preloadSkinThumbnailDataUrls();

    const pool300 =
      this.initData.questions && this.initData.questions.length > 0
        ? this.initData.questions
        : ALL_QUESTIONS_300;
    this.initData.questions = pool300;
    this.registry.set('questionsPool300', pool300);

    const sensoryProfile = this.initData.sensoryProfile ?? new SensoryProfile();
    this.initData.sensoryProfile = sensoryProfile;
    this.registry.set('sensoryProfile', sensoryProfile);

    this.initData.touchLock?.attach();
    updateProgress(0.7);

    void this.ensureGoogleFontLoaded().finally(() => {
      if (!this.scene.isActive('BootScene')) {
        return;
      }
      updateProgress(1.0);
      title.setText('PRÊT POUR L’ARÈNE !');

      this.time.delayedCall(90, () => {
        if (!this.scene.isActive('BootScene')) {
          return;
        }
        if (this.initData.startInLobby) {
          this.scene.start('LobbyScene', {
            brawlerId: this.initData.brawlerId,
            modeId: this.initData.modeId,
            playerNickname: this.initData.playerNickname,
          });
          return;
        }
        this.scene.start('ArenaScene', this.initData);
        if (this.initData.autoLaunchHud !== false) {
          this.scene.launch('HUDScene');
        }
      });
    });
  }

  private async ensureGoogleFontLoaded(): Promise<void> {
    if (typeof document === 'undefined') {
      return;
    }

    const existing = document.querySelector(`link[href="${LILITA_FONT_URL}"]`);
    if (!existing) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LILITA_FONT_URL;
      document.head.appendChild(link);
    }

    const fontsReady = document.fonts?.ready;
    if (!fontsReady) {
      return;
    }

    await Promise.race([
      fontsReady.then(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, 400)),
    ]);
  }
}

/**
 * Instancie le moteur Phaser WebGL configuré pour le mode paysage 60 FPS mobile & desktop.
 */
export function createPhaserBrawlGame(
  parent: HTMLElement | string,
  initData: IBootSceneInitData = {}
): Phaser.Game {
  const width =
    typeof parent !== 'string' && parent.clientWidth > 0 ? parent.clientWidth : 1280;
  const height =
    typeof parent !== 'string' && parent.clientHeight > 0 ? parent.clientHeight : 720;

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    width,
    height,
    backgroundColor: '#020617',
    antialias: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: {
      activePointers: 4,
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scene: [new BootScene(initData), LobbyScene, ArenaScene, HUDScene],
  };

  return new Phaser.Game(config);
}
