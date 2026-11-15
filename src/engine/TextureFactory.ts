import type Phaser from 'phaser';
import type { BrawlerId, StarrDropRarity } from '../types/cctp';

export const TEXTURE_KEYS = {
  BRAWLER_TIMO: 'brawler_TIMO',
  BRAWLER_LEO: 'brawler_LEO',
  BRAWLER_MAYA: 'brawler_MAYA',
  BRAWLER_ZACK: 'brawler_ZACK',
  SHADOW_ELLIPSE: 'shadow_ellipse',
  HERO_RING: 'hero_ring',
  TARGET_A: 'target_robot_A',
  TARGET_B: 'target_robot_B',
  TARGET_C: 'target_robot_C',
  TARGET_D: 'target_robot_D',
  TARGET_HIT: 'target_robot_hit',
  TARGET_SHIELD_ERR: 'target_shield_err',
  PROJ_TIMO: 'proj_TIMO',
  PROJ_LEO: 'proj_LEO',
  PROJ_MAYA: 'proj_MAYA',
  PROJ_ZACK: 'proj_ZACK',
  PROJ_SUPER_GOLD: 'proj_super_gold',
  ISO_TILE_LIGHT: 'iso_tile_light',
  ISO_TILE_DARK: 'iso_tile_dark',
  ISO_TILE_ACCENT: 'iso_tile_accent',
  WALL_3D_BLOCK: 'wall_3d_block',
  WALL_3D_CRATE: 'wall_3d_crate',
  WALL_3D_BUSH: 'wall_3d_bush',
  PARTICLE_SPARK: 'particle_spark',
  PARTICLE_STAR: 'particle_star',
  PARTICLE_SMOKE: 'particle_smoke',
  PARTICLE_HEAL: 'particle_heal',
  STARR_DROP_CORE: 'starr_drop_core',
  LIGHT_RAY_BEAM: 'light_ray_beam',
} as const;

interface IBrawlerPalette {
  primary: string;
  secondary: string;
  accent: string;
  skin: string;
  hair: string;
}

const BRAWLER_PALETTES: Record<BrawlerId, IBrawlerPalette> = {
  TIMO: {
    primary: '#facc15',
    secondary: '#1d4ed8',
    accent: '#fef08a',
    skin: '#fed7aa',
    hair: '#fde047',
  },
  LEO: {
    primary: '#312e81',
    secondary: '#c084fc',
    accent: '#e9d5ff',
    skin: '#ffedd5',
    hair: '#334155',
  },
  MAYA: {
    primary: '#16a34a',
    secondary: '#4ade80',
    accent: '#facc15',
    skin: '#fdba74',
    hair: '#451a03',
  },
  ZACK: {
    primary: '#0891b2',
    secondary: '#22d3ee',
    accent: '#f43f5e',
    skin: '#fed7aa',
    hair: '#0f172a',
  },
};

const TARGET_BADGES: ReadonlyArray<{
  letter: 'A' | 'B' | 'C' | 'D';
  key: string;
  rim: string;
  core: string;
}> = [
  { letter: 'A', key: TEXTURE_KEYS.TARGET_A, rim: '#38bdf8', core: '#0284c7' },
  { letter: 'B', key: TEXTURE_KEYS.TARGET_B, rim: '#c084fc', core: '#7e22ce' },
  { letter: 'C', key: TEXTURE_KEYS.TARGET_C, rim: '#4ade80', core: '#15803d' },
  { letter: 'D', key: TEXTURE_KEYS.TARGET_D, rim: '#facc15', core: '#ca8a04' },
];

export const RARITY_COLORS: Record<
  StarrDropRarity,
  { hex: number; css: string; glowCss: string; label: string }
> = {
  RARE: { hex: 0x4ade80, css: '#4ade80', glowCss: 'rgba(74, 222, 128, 0.55)', label: 'RARE' },
  SUPER_RARE: {
    hex: 0x38bdf8,
    css: '#38bdf8',
    glowCss: 'rgba(56, 189, 248, 0.6)',
    label: 'SUPER RARE',
  },
  EPIQUE: {
    hex: 0xc084fc,
    css: '#c084fc',
    glowCss: 'rgba(192, 132, 252, 0.65)',
    label: 'ÉPIQUE',
  },
  LEGENDAIRE: {
    hex: 0xfacc15,
    css: '#facc15',
    glowCss: 'rgba(250, 204, 21, 0.8)',
    label: 'LÉGENDAIRE',
  },
};

type CanvasDrawFn = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

/**
 * Générateur procédural de textures HD mises en cache GPU (Phaser TextureManager).
 * Garantit zéro asset externe bloquant et un rendu cartoon net style Supercell.
 */
export class TextureFactory {
  public static generateAll(scene: Phaser.Scene): void {
    this.generateBaseShadowsAndRings(scene);
    this.generateBrawlers(scene);
    this.generateTargetRobots(scene);
    this.generateProjectiles(scene);
    this.generateIsometricTiles(scene);
    this.generateWalls3D(scene);
    this.generateParticlesAndStarrDrop(scene);
  }

  public static getBrawlerTextureKey(id: BrawlerId): string {
    switch (id) {
      case 'TIMO':
        return TEXTURE_KEYS.BRAWLER_TIMO;
      case 'LEO':
        return TEXTURE_KEYS.BRAWLER_LEO;
      case 'MAYA':
        return TEXTURE_KEYS.BRAWLER_MAYA;
      case 'ZACK':
        return TEXTURE_KEYS.BRAWLER_ZACK;
    }
  }

  public static getProjectileTextureKey(id: BrawlerId): string {
    switch (id) {
      case 'TIMO':
        return TEXTURE_KEYS.PROJ_TIMO;
      case 'LEO':
        return TEXTURE_KEYS.PROJ_LEO;
      case 'MAYA':
        return TEXTURE_KEYS.PROJ_MAYA;
      case 'ZACK':
        return TEXTURE_KEYS.PROJ_ZACK;
    }
  }

  public static getTargetRobotTextureKey(index: number): string {
    const entry = TARGET_BADGES[((index % TARGET_BADGES.length) + TARGET_BADGES.length) % TARGET_BADGES.length];
    return entry.key;
  }

  private static createCanvasTex(
    scene: Phaser.Scene,
    key: string,
    width: number,
    height: number,
    draw: CanvasDrawFn
  ): void {
    if (scene.textures.exists(key)) {
      return;
    }
    const canvasTex = scene.textures.createCanvas(key, width, height);
    if (!canvasTex) {
      return;
    }
    const ctx = canvasTex.getContext();
    ctx.clearRect(0, 0, width, height);
    draw(ctx, width, height);
    canvasTex.refresh();
  }

  private static generateBaseShadowsAndRings(scene: Phaser.Scene): void {
    this.createCanvasTex(scene, TEXTURE_KEYS.SHADOW_ELLIPSE, 76, 40, (ctx, w, h) => {
      const grad = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * 0.46);
      grad.addColorStop(0, 'rgba(2, 6, 23, 0.58)');
      grad.addColorStop(0.7, 'rgba(2, 6, 23, 0.34)');
      grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, w * 0.45, h * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    this.createCanvasTex(scene, TEXTURE_KEYS.HERO_RING, 96, 62, (ctx, w, h) => {
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4.5;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, w * 0.41, h * 0.36, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, w * 0.33, h * 0.28, 0, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      ctx.restore();
    });
  }

  private static generateBrawlers(scene: Phaser.Scene): void {
    const entries: Array<[BrawlerId, string]> = [
      ['TIMO', TEXTURE_KEYS.BRAWLER_TIMO],
      ['LEO', TEXTURE_KEYS.BRAWLER_LEO],
      ['MAYA', TEXTURE_KEYS.BRAWLER_MAYA],
      ['ZACK', TEXTURE_KEYS.BRAWLER_ZACK],
    ];

    for (const [id, key] of entries) {
      const pal = BRAWLER_PALETTES[id];
      this.createCanvasTex(scene, key, 96, 96, (ctx, w, h) => {
        const cx = w / 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // Baskets / Bottes
        ctx.fillStyle = '#0f172a';
        this.roundRect(ctx, cx - 22, 74, 17, 13, 6);
        ctx.fill();
        this.roundRect(ctx, cx + 5, 74, 17, 13, 6);
        ctx.fill();
        ctx.fillStyle = pal.accent;
        this.roundRect(ctx, cx - 19, 77, 11, 5, 3);
        ctx.fill();
        this.roundRect(ctx, cx + 8, 77, 11, 5, 3);
        ctx.fill();

        // Torse / Veste héroïque avec contour Supercell épais
        const torsoGrad = ctx.createLinearGradient(cx, 38, cx, 78);
        torsoGrad.addColorStop(0, pal.primary);
        torsoGrad.addColorStop(1, pal.secondary);
        ctx.fillStyle = torsoGrad;
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 4;
        this.roundRect(ctx, cx - 23, 42, 46, 35, 14);
        ctx.fill();
        ctx.stroke();

        // Éclat / Bande maillot
        ctx.fillStyle = pal.accent;
        this.roundRect(ctx, cx - 12, 49, 24, 10, 5);
        ctx.fill();

        // Bras gauche & droit
        ctx.fillStyle = pal.skin;
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(cx - 26, 56, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + 26, 56, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Tête cartoon expressive
        ctx.fillStyle = pal.skin;
        ctx.beginPath();
        ctx.arc(cx, 29, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Cheveux / Capuche / Casque selon le héros
        if (id === 'LEO') {
          ctx.fillStyle = pal.primary;
          ctx.beginPath();
          ctx.arc(cx, 25, 22, Math.PI * 0.9, Math.PI * 2.1);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = pal.hair;
          ctx.beginPath();
          ctx.arc(cx, 22, 19, Math.PI * 0.95, Math.PI * 2.05);
          ctx.lineTo(cx + 12, 23);
          ctx.lineTo(cx, 15);
          ctx.lineTo(cx - 12, 23);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        // Yeux stylisés Brawl Stars
        ctx.fillStyle = '#020617';
        ctx.beginPath();
        ctx.ellipse(cx - 7, 30, 3.2, 4.4, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 7, 30, 3.2, 4.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx - 8, 28.5, 1.3, 0, Math.PI * 2);
        ctx.arc(cx + 6, 28.5, 1.3, 0, Math.PI * 2);
        ctx.fill();

        // Accessoire signature
        if (id === 'TIMO') {
          // Ballon énergétique au poing droit
          ctx.fillStyle = '#fef08a';
          ctx.beginPath();
          ctx.arc(cx + 30, 61, 9.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (id === 'LEO') {
          // Lunettes rondes dorées
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(cx - 7, 30, 5.8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx + 7, 30, 5.8, 0, Math.PI * 2);
          ctx.stroke();
        } else if (id === 'MAYA') {
          // Bouclier-boussole doré sur le bras gauche
          ctx.fillStyle = '#facc15';
          ctx.strokeStyle = '#020617';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx - 30, 57, 11, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(cx - 30, 57, 4.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (id === 'ZACK') {
          // Casque audio néon cyan
          ctx.fillStyle = '#22d3ee';
          ctx.strokeStyle = '#020617';
          ctx.lineWidth = 3;
          this.roundRect(ctx, cx - 24, 21, 8, 17, 4);
          ctx.fill();
          ctx.stroke();
          this.roundRect(ctx, cx + 16, 21, 8, 17, 4);
          ctx.fill();
          ctx.stroke();
        }

        void h;
      });
    }
  }

  private static generateTargetRobots(scene: Phaser.Scene): void {
    for (const badge of TARGET_BADGES) {
      this.createCanvasTex(scene, badge.key, 88, 92, (ctx, w) => {
        const cx = w / 2;

        // Flamme de propulsion inférieure
        const flame = ctx.createRadialGradient(cx, 77, 2, cx, 79, 14);
        flame.addColorStop(0, '#ffffff');
        flame.addColorStop(0.5, badge.rim);
        flame.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = flame;
        ctx.beginPath();
        ctx.ellipse(cx, 78, 15, 9, 0, 0, Math.PI * 2);
        ctx.fill();

        // Antenne lumineuse
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx, 20);
        ctx.lineTo(cx, 8);
        ctx.stroke();
        ctx.fillStyle = badge.rim;
        ctx.beginPath();
        ctx.arc(cx, 8, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Châssis robotique 2.5D
        const bodyGrad = ctx.createLinearGradient(cx, 18, cx, 72);
        bodyGrad.addColorStop(0, '#e2e8f0');
        bodyGrad.addColorStop(0.45, '#64748b');
        bodyGrad.addColorStop(1, '#1e293b');
        ctx.fillStyle = bodyGrad;
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 4;
        this.roundRect(ctx, cx - 28, 20, 56, 52, 16);
        ctx.fill();
        ctx.stroke();

        // Écran facial sombre + bande colorée
        ctx.fillStyle = '#0f172a';
        this.roundRect(ctx, cx - 21, 27, 42, 34, 10);
        ctx.fill();
        ctx.strokeStyle = badge.rim;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Badge circulaire A / B / C / D
        ctx.fillStyle = badge.core;
        ctx.beginPath();
        ctx.arc(cx, 44, 13.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 17px "Lilita One", "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badge.letter, cx, 45);
      });
    }

    this.createCanvasTex(scene, TEXTURE_KEYS.TARGET_HIT, 88, 92, (ctx, w, h) => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 32, 0, Math.PI * 2);
      ctx.fill();
    });

    this.createCanvasTex(scene, TEXTURE_KEYS.TARGET_SHIELD_ERR, 104, 104, (ctx, w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      const grad = ctx.createRadialGradient(cx, cy, 18, cx, cy, 48);
      grad.addColorStop(0, 'rgba(239, 68, 68, 0.08)');
      grad.addColorStop(0.75, 'rgba(239, 68, 68, 0.35)');
      grad.addColorStop(1, 'rgba(248, 113, 113, 0.85)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, 46, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 3.5;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, 44, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  private static generateProjectiles(scene: Phaser.Scene): void {
    const specs: Array<{ key: string; inner: string; outer: string }> = [
      { key: TEXTURE_KEYS.PROJ_TIMO, inner: '#fef9c3', outer: '#facc15' },
      { key: TEXTURE_KEYS.PROJ_LEO, inner: '#f3e8ff', outer: '#a855f7' },
      { key: TEXTURE_KEYS.PROJ_MAYA, inner: '#dcfce7', outer: '#22c55e' },
      { key: TEXTURE_KEYS.PROJ_ZACK, inner: '#cffafe', outer: '#06b6d4' },
      { key: TEXTURE_KEYS.PROJ_SUPER_GOLD, inner: '#ffffff', outer: '#f59e0b' },
    ];

    for (const spec of specs) {
      this.createCanvasTex(scene, spec.key, 38, 38, (ctx, w, h) => {
        const cx = w / 2;
        const cy = h / 2;
        const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 18);
        glow.addColorStop(0, spec.inner);
        glow.addColorStop(0.55, spec.outer);
        glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = spec.inner;
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 8.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }
  }

  private static generateIsometricTiles(scene: Phaser.Scene): void {
    // Ratio cos(50°) ≈ 0.6428 -> 128 x 82
    const variants: Array<{ key: string; top: string; rim: string; grid: string }> = [
      { key: TEXTURE_KEYS.ISO_TILE_LIGHT, top: '#1e3a5f', rim: '#38bdf8', grid: 'rgba(148, 163, 184, 0.2)' },
      { key: TEXTURE_KEYS.ISO_TILE_DARK, top: '#162c49', rim: '#0ea5e9', grid: 'rgba(148, 163, 184, 0.16)' },
      { key: TEXTURE_KEYS.ISO_TILE_ACCENT, top: '#1e40af', rim: '#facc15', grid: 'rgba(250, 204, 21, 0.25)' },
    ];

    for (const v of variants) {
      this.createCanvasTex(scene, v.key, 128, 82, (ctx, w, h) => {
        ctx.beginPath();
        ctx.moveTo(w / 2, 2);
        ctx.lineTo(w - 2, h / 2);
        ctx.lineTo(w / 2, h - 2);
        ctx.lineTo(2, h / 2);
        ctx.closePath();

        ctx.fillStyle = v.top;
        ctx.fill();
        ctx.strokeStyle = v.grid;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Reflet biseauté sur l'arête supérieure
        ctx.strokeStyle = v.rim;
        ctx.globalAlpha = 0.22;
        ctx.beginPath();
        ctx.moveTo(6, h / 2);
        ctx.lineTo(w / 2, 5);
        ctx.lineTo(w - 6, h / 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    }
  }

  private static generateWalls3D(scene: Phaser.Scene): void {
    // Mur / Casier 3D extrudé
    this.createCanvasTex(scene, TEXTURE_KEYS.WALL_3D_BLOCK, 96, 112, (ctx, w, h) => {
      ctx.lineJoin = 'round';
      // Ombre au sol
      ctx.fillStyle = 'rgba(2, 6, 23, 0.42)';
      this.roundRect(ctx, 8, h - 18, w - 16, 14, 6);
      ctx.fill();

      // Face frontale (extrusion verticale)
      const frontGrad = ctx.createLinearGradient(0, 44, 0, h - 10);
      frontGrad.addColorStop(0, '#334155');
      frontGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = frontGrad;
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 4;
      this.roundRect(ctx, 10, 42, w - 20, h - 54, 10);
      ctx.fill();
      ctx.stroke();

      // Détail casiers collège (fentes d'aération)
      ctx.fillStyle = '#475569';
      this.roundRect(ctx, 22, 62, 20, 6, 3);
      ctx.fill();
      this.roundRect(ctx, 54, 62, 20, 6, 3);
      ctx.fill();

      // Face supérieure éclairée (inclinaison 50°)
      const topGrad = ctx.createLinearGradient(0, 10, 0, 50);
      topGrad.addColorStop(0, '#60a5fa');
      topGrad.addColorStop(1, '#2563eb');
      ctx.fillStyle = topGrad;
      this.roundRect(ctx, 10, 12, w - 20, 38, 10);
      ctx.fill();
      ctx.stroke();

      // Reflet spéculaire supérieur
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      this.roundRect(ctx, 18, 17, w - 36, 8, 4);
      ctx.fill();
    });

    // Caisse d'énergie / Bureau 3D
    this.createCanvasTex(scene, TEXTURE_KEYS.WALL_3D_CRATE, 84, 96, (ctx, w, h) => {
      ctx.lineJoin = 'round';
      ctx.fillStyle = '#92400e';
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 4;
      this.roundRect(ctx, 10, 32, w - 20, h - 42, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      this.roundRect(ctx, 10, 12, w - 20, 32, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 20px "Lilita One", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', w / 2, 58);
    });

    // Buisson / Haie stylisée de cour de collège
    this.createCanvasTex(scene, TEXTURE_KEYS.WALL_3D_BUSH, 88, 78, (ctx, w, h) => {
      ctx.fillStyle = '#15803d';
      ctx.strokeStyle = '#052e16';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(w * 0.32, h * 0.56, 20, 0, Math.PI * 2);
      ctx.arc(w * 0.68, h * 0.56, 20, 0, Math.PI * 2);
      ctx.arc(w * 0.5, h * 0.38, 23, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.arc(w * 0.45, h * 0.32, 11, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private static generateParticlesAndStarrDrop(scene: Phaser.Scene): void {
    this.createCanvasTex(scene, TEXTURE_KEYS.PARTICLE_SPARK, 24, 24, (ctx, w, h) => {
      const grad = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, 11);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.5, '#fde047');
      grad.addColorStop(1, 'rgba(250, 204, 21, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    });

    this.createCanvasTex(scene, TEXTURE_KEYS.PARTICLE_STAR, 32, 32, (ctx, w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      ctx.fillStyle = '#fef08a';
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? 13 : 6;
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    this.createCanvasTex(scene, TEXTURE_KEYS.PARTICLE_SMOKE, 36, 36, (ctx, w, h) => {
      const grad = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, 17);
      grad.addColorStop(0, 'rgba(248, 250, 252, 0.8)');
      grad.addColorStop(1, 'rgba(248, 250, 252, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    });

    this.createCanvasTex(scene, TEXTURE_KEYS.PARTICLE_HEAL, 28, 28, (ctx, w, h) => {
      ctx.fillStyle = '#4ade80';
      ctx.strokeStyle = '#052e16';
      ctx.lineWidth = 2;
      this.roundRect(ctx, w / 2 - 4, 4, 8, h - 8, 2);
      ctx.fill();
      ctx.stroke();
      this.roundRect(ctx, 4, h / 2 - 4, w - 8, 8, 2);
      ctx.fill();
      ctx.stroke();
    });

    // Casier Mystère (Starr Drop Étoile / Casier doré)
    this.createCanvasTex(scene, TEXTURE_KEYS.STARR_DROP_CORE, 164, 164, (ctx, w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      ctx.lineJoin = 'round';

      // Aura arrière
      const halo = ctx.createRadialGradient(cx, cy, 14, cx, cy, 78);
      halo.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
      halo.addColorStop(0.5, 'rgba(250, 204, 21, 0.35)');
      halo.addColorStop(1, 'rgba(250, 204, 21, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      // Étoile Casier Mystère stylisée
      const starGrad = ctx.createLinearGradient(cx, 16, cx, h - 16);
      starGrad.addColorStop(0, '#fef08a');
      starGrad.addColorStop(0.55, '#facc15');
      starGrad.addColorStop(1, '#d97706');
      ctx.fillStyle = starGrad;
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 6;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? 64 : 35;
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Visage souriant du Casier Mystère
      ctx.fillStyle = '#020617';
      ctx.beginPath();
      ctx.ellipse(cx - 14, cy - 4, 5, 7, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 14, cy - 4, 5, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy + 7, 13, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    });

    // Rayon lumineux triangulaire pour l'ouverture GSAP
    this.createCanvasTex(scene, TEXTURE_KEYS.LIGHT_RAY_BEAM, 120, 420, (ctx, w, h) => {
      const grad = ctx.createLinearGradient(w / 2, h, w / 2, 0);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.72)');
      grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.24)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(w / 2 - 12, h);
      ctx.lineTo(0, 0);
      ctx.lineTo(w, 0);
      ctx.lineTo(w / 2 + 12, h);
      ctx.closePath();
      ctx.fill();
    });
  }

  private static roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}
