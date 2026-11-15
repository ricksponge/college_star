import type { BrawlerId, GameModeId } from '../types/cctp';

export const ISO_ANGLE_DEG = 50;
export const ISO_ANGLE_RAD = (ISO_ANGLE_DEG * Math.PI) / 180;
/** Facteur de compression verticale dû à la caméra inclinée à 50° */
export const ISO_Y_SCALE = Math.cos(ISO_ANGLE_RAD);
/** +35% de visibilité vers le haut de l'écran (sens naturel d'attaque bas -> haut) */
export const UPWARD_VISIBILITY_BIAS = 0.35;

export interface IRenderVec2 {
  x: number;
  y: number;
}

export interface IRenderObstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: 'wall' | 'desk' | 'bush' | 'goal_left' | 'goal_right' | 'safe_zone';
  label?: string;
}

export interface IRenderTarget {
  id: string;
  x: number;
  y: number;
  radius: number;
  label: string;
  isCorrect: boolean;
  hp: number;
  maxHp: number;
  highlighted: boolean;
  isCrystal?: boolean;
  isBoss?: boolean;
  frozen?: boolean;
  slowed?: boolean;
}

export interface IRenderProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  isLobbed?: boolean;
  heightZ?: number;
}

export interface IRenderPlayer {
  x: number;
  y: number;
  aimAngle: number;
  brawlerId: BrawlerId;
  name: string;
  hp: number;
  maxHp: number;
  ammoBars: number;
  maxAmmoBars: number;
  superGaugePct: number;
  gadgetCharges: number;
  shieldHp: number;
  errorShieldRemainingMs: number;
  penaltyCooldownMs: number;
  comboMultiplier: number;
}

export interface IRenderJoystick {
  active: boolean;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  color: string;
}

export interface IRenderFlashBubble {
  text: string;
  x: number;
  y: number;
  remainingMs: number;
  isPositive?: boolean;
}

export interface IRenderFrameState {
  modeId: GameModeId;
  arenaWidth: number;
  arenaHeight: number;
  player: IRenderPlayer;
  targets: IRenderTarget[];
  projectiles: IRenderProjectile[];
  obstacles: IRenderObstacle[];
  hudPrompt: string;
  objectiveScore: number;
  objectiveLabel: string;
  remainingSeconds: number;
  shrinkRadius?: number;
  laserSweepY?: number;
  turretPos?: IRenderVec2 | null;
  compassTargetPos?: IRenderVec2 | null;
  flashBubble: IRenderFlashBubble | null;
  leftStick: IRenderJoystick;
  rightStick: IRenderJoystick;
}

const BRAWLER_COLORS: Record<BrawlerId, { primary: string; accent: string }> = {
  TIMO: { primary: '#facc15', accent: '#2563eb' },
  LEO: { primary: '#312e81', accent: '#a855f7' },
  MAYA: { primary: '#4d7c0f', accent: '#f59e0b' },
  ZACK: { primary: '#06b6d4', accent: '#ec4899' },
};

export class IsometricRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private cameraX = 0;
  private cameraY = 0;
  private zoom = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Impossible d’initialiser le contexte 2D Canvas.');
    }
    this.ctx = context;
  }

  /**
   * Adapte la résolution interne du canvas en mode Paysage (16:9 ou 4:3)
   * avec prise en charge HiDPI sans dépasser 2x pour maintenir 60 FPS.
   */
  public resizeToContainer(): void {
    const parent = this.canvas.parentElement;
    const width = parent ? parent.clientWidth : window.innerWidth;
    const height = parent ? parent.clientHeight : window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.max(640, Math.floor(width));
    const targetH = Math.max(360, Math.floor(height));

    if (this.canvas.width !== targetW * dpr || this.canvas.height !== targetH * dpr) {
      this.canvas.width = targetW * dpr;
      this.canvas.height = targetH * dpr;
      this.canvas.style.width = `${targetW}px`;
      this.canvas.style.height = `${targetH}px`;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.zoom = Math.min(targetW / 960, targetH / 540);
  }

  /**
   * Projection isométrique verrouillée à 50° avec +35% de visibilité vers le haut.
   */
  public worldToScreen(wx: number, wy: number, wz = 0): IRenderVec2 {
    const cssW = this.canvas.clientWidth || 960;
    const cssH = this.canvas.clientHeight || 540;
    const playerBiasY = cssH * (0.5 + UPWARD_VISIBILITY_BIAS * 0.42);
    const dx = (wx - this.cameraX) * this.zoom;
    const dy = (wy - this.cameraY) * ISO_Y_SCALE * this.zoom - wz * this.zoom;

    return {
      x: cssW * 0.5 + dx,
      y: playerBiasY + dy,
    };
  }

  public screenToWorld(sx: number, sy: number): IRenderVec2 {
    const cssW = this.canvas.clientWidth || 960;
    const cssH = this.canvas.clientHeight || 540;
    const playerBiasY = cssH * (0.5 + UPWARD_VISIBILITY_BIAS * 0.42);
    const wx = this.cameraX + (sx - cssW * 0.5) / this.zoom;
    const wy = this.cameraY + (sy - playerBiasY) / (ISO_Y_SCALE * this.zoom);
    return { x: wx, y: wy };
  }

  public render(state: IRenderFrameState): void {
    const cssW = this.canvas.clientWidth || 960;
    const cssH = this.canvas.clientHeight || 540;

    // Caméra verrouillée sur le joueur avec léger lissage
    this.cameraX += (state.player.x - this.cameraX) * 0.18;
    this.cameraY += (state.player.y - this.cameraY) * 0.18;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, cssW, cssH);

    // Fond de cour de collège
    const bgGrad = ctx.createLinearGradient(0, 0, 0, cssH);
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, cssW, cssH);

    this.drawArenaFloor(state);
    this.drawObstacles(state.obstacles);

    if (state.shrinkRadius !== undefined) {
      this.drawShrinkZone(state.arenaWidth * 0.5, state.arenaHeight * 0.5, state.shrinkRadius);
    }

    if (state.laserSweepY !== undefined) {
      this.drawLaserSweep(state.arenaWidth, state.laserSweepY);
    }

    if (state.turretPos) {
      this.drawTurret(state.turretPos);
    }

    if (state.compassTargetPos) {
      this.drawCompassArrow(state.player, state.compassTargetPos);
    }

    // Tri en profondeur (painter's algorithm) pour le rendu 50°
    const sortedTargets = [...state.targets].sort((a, b) => a.y - b.y);
    for (const target of sortedTargets) {
      this.drawTarget(target);
    }

    this.drawPlayer(state.player);

    for (const proj of state.projectiles) {
      this.drawProjectile(proj);
    }

    if (state.flashBubble) {
      this.drawFlashBubble(state.flashBubble);
    }

    this.drawJoysticks(state.leftStick, state.rightStick);
    this.drawHudOverlay(state, cssW);
  }

  private drawArenaFloor(state: IRenderFrameState): void {
    const ctx = this.ctx;
    const tl = this.worldToScreen(0, 0);
    const br = this.worldToScreen(state.arenaWidth, state.arenaHeight);
    const w = br.x - tl.x;
    const h = br.y - tl.y;

    ctx.save();
    ctx.fillStyle = state.modeId === 'MATCH_DES_ACCORDS' ? '#166534' : '#334155';
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 4;
    ctx.fillRect(tl.x, tl.y, w, h);
    ctx.strokeRect(tl.x, tl.y, w, h);

    // Dalles isométriques de la cour du collège
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    const step = 100;
    for (let x = step; x < state.arenaWidth; x += step) {
      const p1 = this.worldToScreen(x, 0);
      const p2 = this.worldToScreen(x, state.arenaHeight);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    for (let y = step; y < state.arenaHeight; y += step) {
      const p1 = this.worldToScreen(0, y);
      const p2 = this.worldToScreen(state.arenaWidth, y);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // Ligne médiane
    const midL = this.worldToScreen(0, state.arenaHeight * 0.5);
    const midR = this.worldToScreen(state.arenaWidth, state.arenaHeight * 0.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(midL.x, midL.y);
    ctx.lineTo(midR.x, midR.y);
    ctx.stroke();
    ctx.restore();
  }

  private drawObstacles(obstacles: IRenderObstacle[]): void {
    const ctx = this.ctx;
    for (const obs of obstacles) {
      const tl = this.worldToScreen(obs.x, obs.y);
      const br = this.worldToScreen(obs.x + obs.width, obs.y + obs.height);
      const w = br.x - tl.x;
      const h = br.y - tl.y;

      ctx.save();
      if (obs.kind === 'goal_left' || obs.kind === 'goal_right') {
        ctx.fillStyle = obs.kind === 'goal_left' ? 'rgba(59,130,246,0.35)' : 'rgba(234,179,8,0.35)';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.fillRect(tl.x, tl.y, w, h);
        ctx.strokeRect(tl.x, tl.y, w, h);
      } else if (obs.kind === 'safe_zone') {
        ctx.fillStyle = 'rgba(34,197,94,0.28)';
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 2.5;
        ctx.fillRect(tl.x, tl.y, w, h);
        ctx.strokeRect(tl.x, tl.y, w, h);
      } else {
        // Effet 2.5D incliné 50°
        const depth = 22 * this.zoom;
        ctx.fillStyle = obs.kind === 'bush' ? '#15803d' : '#475569';
        ctx.fillRect(tl.x, tl.y - depth, w, h + depth);
        ctx.fillStyle = obs.kind === 'bush' ? '#22c55e' : '#94a3b8';
        ctx.fillRect(tl.x, tl.y - depth, w, h);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.strokeRect(tl.x, tl.y - depth, w, h);
      }

      if (obs.label) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(12, Math.round(15 * this.zoom))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(obs.label, tl.x + w * 0.5, tl.y + h * 0.5);
      }
      ctx.restore();
    }
  }

  private drawShrinkZone(cx: number, cy: number, radius: number): void {
    const ctx = this.ctx;
    const center = this.worldToScreen(cx, cy);
    ctx.save();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.ellipse(
      center.x,
      center.y,
      radius * this.zoom,
      radius * ISO_Y_SCALE * this.zoom,
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.restore();
  }

  private drawLaserSweep(arenaWidth: number, laserY: number): void {
    const ctx = this.ctx;
    const left = this.worldToScreen(0, laserY, 10);
    const right = this.worldToScreen(arenaWidth, laserY, 10);
    ctx.save();
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
    ctx.lineWidth = 10 * this.zoom;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.stroke();
    ctx.restore();
  }

  private drawTurret(pos: IRenderVec2): void {
    const ctx = this.ctx;
    const p = this.worldToScreen(pos.x, pos.y, 12);
    ctx.save();
    ctx.fillStyle = '#7c3aed';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 18 * this.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(11 * this.zoom)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('ROBERT', p.x, p.y - 24 * this.zoom);
    ctx.restore();
  }

  private drawCompassArrow(player: IRenderPlayer, target: IRenderVec2): void {
    const ctx = this.ctx;
    const p1 = this.worldToScreen(player.x, player.y, 8);
    const p2 = this.worldToScreen(target.x, target.y, 8);
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    ctx.save();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(p1.x + Math.cos(angle) * 35, p1.y + Math.sin(angle) * 35);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  }

  private drawTarget(target: IRenderTarget): void {
    const ctx = this.ctx;
    const screen = this.worldToScreen(target.x, target.y, 12);
    const shadow = this.worldToScreen(target.x, target.y, 0);
    const r = target.radius * this.zoom;

    ctx.save();
    // Ombre au sol
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(shadow.x, shadow.y, r * 0.9, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    // Halo doré du Gadget "Vision de Jeu"
    if (target.highlighted) {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, r + 9 * this.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Corps du drone / gemme / boss
    ctx.fillStyle = target.isCrystal
      ? '#38bdf8'
      : target.isBoss
        ? '#dc2626'
        : target.frozen
          ? '#93c5fd'
          : '#f97316';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Étiquette de réponse (1 à 2 mots max, lisible immédiatement)
    const fontSize = Math.max(13, Math.round(15 * this.zoom));
    ctx.font = `800 ${fontSize}px system-ui, sans-serif`;
    const metrics = ctx.measureText(target.label);
    const pillW = Math.max(54 * this.zoom, metrics.width + 18 * this.zoom);
    const pillH = 26 * this.zoom;
    const pillX = screen.x - pillW * 0.5;
    const pillY = screen.y - r - pillH - 12 * this.zoom;

    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = target.highlighted ? '#facc15' : '#e2e8f0';
    ctx.lineWidth = 2;
    this.roundRect(pillX, pillY, pillW, pillH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(target.label, screen.x, pillY + pillH * 0.5);

    // Barre de PV cible
    const hpRatio = Math.max(0, Math.min(1, target.hp / target.maxHp));
    const barW = 46 * this.zoom;
    const barH = 6 * this.zoom;
    const barX = screen.x - barW * 0.5;
    const barY = screen.y - r - 8 * this.zoom;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(barX, barY, barW * hpRatio, barH);
    ctx.restore();
  }

  private drawPlayer(player: IRenderPlayer): void {
    const ctx = this.ctx;
    const screen = this.worldToScreen(player.x, player.y, 14);
    const shadow = this.worldToScreen(player.x, player.y, 0);
    const palette = BRAWLER_COLORS[player.brawlerId];
    const r = 24 * this.zoom;

    ctx.save();
    // Ombre
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(shadow.x, shadow.y, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Anneau de jauge Super (jaune si prêt à 100%)
    if (player.superGaugePct >= 100) {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(shadow.x, shadow.y, r + 8 * this.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Bouclier actif (erreur ou Super Maya/Zack)
    if (player.errorShieldRemainingMs > 0 || player.shieldHp > 0) {
      ctx.strokeStyle = player.shieldHp > 0 ? '#38bdf8' : '#f87171';
      ctx.fillStyle = player.shieldHp > 0 ? 'rgba(56,189,248,0.18)' : 'rgba(248,113,113,0.18)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, r + 10 * this.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Corps du héros
    ctx.fillStyle = palette.primary;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Indicateur de direction de visée
    const aimLen = r + 14 * this.zoom;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(screen.x, screen.y);
    ctx.lineTo(
      screen.x + Math.cos(player.aimAngle) * aimLen,
      screen.y + Math.sin(player.aimAngle) * aimLen * ISO_Y_SCALE
    );
    ctx.stroke();

    // Nom & barre de PV
    const barW = 64 * this.zoom;
    const barH = 7 * this.zoom;
    const barX = screen.x - barW * 0.5;
    const barY = screen.y - r - 22 * this.zoom;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle = '#22c55e';
    const hpRatio = Math.max(0, Math.min(1, player.hp / player.maxHp));
    ctx.fillRect(barX, barY, barW * hpRatio, barH);

    // 3 barres de munitions
    const ammoW = (barW - 4) / player.maxAmmoBars;
    for (let i = 0; i < player.maxAmmoBars; i++) {
      const fill = Math.max(0, Math.min(1, player.ammoBars - i));
      ctx.fillStyle = '#334155';
      ctx.fillRect(barX + i * (ammoW + 2), barY + barH + 3, ammoW, 4 * this.zoom);
      if (fill > 0) {
        ctx.fillStyle = fill >= 1 ? '#fb923c' : '#fed7aa';
        ctx.fillRect(barX + i * (ammoW + 2), barY + barH + 3, ammoW * fill, 4 * this.zoom);
      }
    }

    ctx.fillStyle = '#f8fafc';
    ctx.font = `bold ${Math.round(12 * this.zoom)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(player.name, screen.x, barY - 7 * this.zoom);
    ctx.restore();
  }

  private drawProjectile(proj: IRenderProjectile): void {
    const ctx = this.ctx;
    const p = this.worldToScreen(proj.x, proj.y, proj.heightZ ?? 12);
    ctx.save();
    ctx.fillStyle = proj.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, proj.radius * this.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawFlashBubble(bubble: IRenderFlashBubble): void {
    const ctx = this.ctx;
    const p = this.worldToScreen(bubble.x, bubble.y, 44);
    ctx.save();
    ctx.font = 'bold 14px system-ui, sans-serif';
    const w = Math.min(360, ctx.measureText(bubble.text).width + 28);
    const h = 34;
    ctx.fillStyle = bubble.isPositive ? 'rgba(21,128,61,0.95)' : 'rgba(185,28,28,0.95)';
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 2;
    this.roundRect(p.x - w * 0.5, p.y - h - 18, w, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bubble.text, p.x, p.y - h * 0.5 - 18);
    ctx.restore();
  }

  private drawJoysticks(left: IRenderJoystick, right: IRenderJoystick): void {
    for (const stick of [left, right]) {
      if (!stick.active) continue;
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = stick.color;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(stick.originX, stick.originY, 48, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = stick.color;
      ctx.beginPath();
      ctx.arc(stick.currentX, stick.currentY, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawHudOverlay(state: IRenderFrameState, cssW: number): void {
    const ctx = this.ctx;
    ctx.save();

    // Bandeau supérieur : Défi Flash (7 mots max)
    const bannerW = Math.min(540, cssW * 0.62);
    const bannerH = 44;
    const bannerX = (cssW - bannerW) * 0.5;
    const bannerY = 12;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.5;
    this.roundRect(bannerX, bannerY, bannerW, bannerH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fef08a';
    ctx.font = '800 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.hudPrompt, cssW * 0.5, bannerY + bannerH * 0.5);

    // Chrono & Score d'objectif (coin haut gauche)
    const mins = Math.floor(state.remainingSeconds / 60);
    const secs = Math.floor(state.remainingSeconds % 60);
    const timeText = `${mins}:${secs.toString().padStart(2, '0')}`;

    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    this.roundRect(14, 12, 165, 44, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`⏱ ${timeText}  |  ${state.objectiveLabel}: ${state.objectiveScore}`, 24, 34);

    // Combo & Super (coin haut droit)
    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    this.roundRect(cssW - 190, 12, 176, 44, 10);
    ctx.fill();
    ctx.fillStyle = state.player.superGaugePct >= 100 ? '#facc15' : '#38bdf8';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(
      `x${state.player.comboMultiplier.toFixed(2)} | SUPER ${Math.round(state.player.superGaugePct)}%`,
      cssW - 24,
      34
    );

    ctx.restore();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
