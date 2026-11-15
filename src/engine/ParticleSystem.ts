/**
 * Moteur de particules 2.5D haute performance (60 FPS, pool pré-alloué sans GC).
 * Gère :
 * - Poussière de course sous les pieds du héros
 * - Traînées de projectiles (ballons, encre, ondes, doubles beats)
 * - Explosion d'étoiles dorées/turquoises sur bonne réponse
 * - Fumée rouge d'alerte sur mauvaise cible
 */

export type ParticleKind = 'dust' | 'trail' | 'star' | 'smoke' | 'spark';

interface IParticleSlot {
  active: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  endSize: number;
  lifeMs: number;
  maxLifeMs: number;
  color: string;
  rotation: number;
  vRot: number;
  drag: number;
}

const MAX_PARTICLES = 360;

export class ParticleSystem {
  private readonly pool: IParticleSlot[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      this.pool.push({
        active: false,
        kind: 'dust',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 6,
        endSize: 2,
        lifeMs: 0,
        maxLifeMs: 300,
        color: '#ffffff',
        rotation: 0,
        vRot: 0,
        drag: 0.92,
      });
    }
  }

  public clear(): void {
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      this.pool[i].active = false;
    }
  }

  private alloc(): IParticleSlot {
    for (let n = 0; n < MAX_PARTICLES; n += 1) {
      const idx = (this.cursor + n) % MAX_PARTICLES;
      if (!this.pool[idx].active) {
        this.cursor = (idx + 1) % MAX_PARTICLES;
        this.pool[idx].active = true;
        return this.pool[idx];
      }
    }
    const fallback = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    fallback.active = true;
    return fallback;
  }

  public spawnFootstepDust(x: number, y: number): void {
    for (let i = 0; i < 2; i += 1) {
      const p = this.alloc();
      const angle = Math.random() * Math.PI * 2;
      const speed = 18 + Math.random() * 28;
      p.kind = 'dust';
      p.x = x + (Math.random() - 0.5) * 14;
      p.y = y + (Math.random() - 0.5) * 10;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - 8;
      p.size = 6 + Math.random() * 5;
      p.endSize = 1.5;
      p.lifeMs = 0;
      p.maxLifeMs = 260 + Math.random() * 140;
      p.color = i === 0 ? '#e2e8f0' : '#cbd5e1';
      p.rotation = Math.random() * Math.PI;
      p.vRot = (Math.random() - 0.5) * 3;
      p.drag = 0.88;
    }
  }

  public spawnProjectileTrail(x: number, y: number, color: string, isLobbed = false): void {
    const p = this.alloc();
    const jitter = isLobbed ? 14 : 6;
    p.kind = 'trail';
    p.x = x + (Math.random() - 0.5) * jitter;
    p.y = y + (Math.random() - 0.5) * jitter;
    p.vx = (Math.random() - 0.5) * 24;
    p.vy = (Math.random() - 0.5) * 24 - (isLobbed ? 18 : 4);
    p.size = isLobbed ? 7.5 : 5.5;
    p.endSize = 1;
    p.lifeMs = 0;
    p.maxLifeMs = isLobbed ? 260 : 180;
    p.color = color;
    p.rotation = 0;
    p.vRot = 0;
    p.drag = 0.9;
  }

  public spawnStarExplosion(x: number, y: number, accentColor = '#facc15'): void {
    const starColors = [accentColor, '#fde047', '#38bdf8', '#4ade80'];
    for (let i = 0; i < 14; i += 1) {
      const p = this.alloc();
      const angle = (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const speed = 95 + Math.random() * 165;
      p.kind = i % 3 === 0 ? 'spark' : 'star';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.size = p.kind === 'star' ? 9 + Math.random() * 5 : 5 + Math.random() * 4;
      p.endSize = 2;
      p.lifeMs = 0;
      p.maxLifeMs = 420 + Math.random() * 200;
      p.color = starColors[i % starColors.length];
      p.rotation = Math.random() * Math.PI * 2;
      p.vRot = (Math.random() - 0.5) * 10;
      p.drag = 0.91;
    }
  }

  public spawnRedErrorSmoke(x: number, y: number): void {
    const smokeColors = ['#ef4444', '#dc2626', '#991b1b', '#fca5a5'];
    for (let i = 0; i < 12; i += 1) {
      const p = this.alloc();
      const angle = Math.random() * Math.PI * 2;
      const speed = 38 + Math.random() * 95;
      p.kind = i < 8 ? 'smoke' : 'spark';
      p.x = x + (Math.random() - 0.5) * 18;
      p.y = y + (Math.random() - 0.5) * 18;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - 22;
      p.size = p.kind === 'smoke' ? 11 + Math.random() * 7 : 5;
      p.endSize = p.kind === 'smoke' ? 22 : 1;
      p.lifeMs = 0;
      p.maxLifeMs = 460 + Math.random() * 200;
      p.color = smokeColors[i % smokeColors.length];
      p.rotation = Math.random() * Math.PI * 2;
      p.vRot = (Math.random() - 0.5) * 5;
      p.drag = 0.9;
    }
  }

  public update(dtSec: number): void {
    const dtMs = dtSec * 1000;
    const dampStep = Math.pow(60, dtSec);
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.lifeMs += dtMs;
      if (p.lifeMs >= p.maxLifeMs) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      const damp = Math.pow(p.drag, dampStep);
      p.vx *= damp;
      p.vy *= damp;
      p.rotation += p.vRot * dtSec;
    }
  }

  public render(
    ctx: CanvasRenderingContext2D,
    worldToScreen: (wx: number, wy: number) => { x: number; y: number },
    zoom = 1
  ): void {
    ctx.save();
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      const p = this.pool[i];
      if (!p.active) continue;

      const t = Math.min(1, p.lifeMs / p.maxLifeMs);
      const alpha = p.kind === 'smoke' ? (1 - t) * 0.72 : 1 - t * t;
      if (alpha <= 0.02) continue;

      const pos = worldToScreen(p.x, p.y);
      const radius = (p.size + (p.endSize - p.size) * t) * zoom;

      ctx.globalAlpha = alpha;
      if (p.kind === 'star') {
        this.drawStar(ctx, pos.x, pos.y, radius, p.rotation, p.color);
      } else if (p.kind === 'spark') {
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = '#090d16';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(-radius * 1.1, -radius * 0.45, radius * 2.2, radius * 0.9);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else if (p.kind === 'smoke') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawStar(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    outerR: number,
    rot: number,
    fill: string
  ): void {
    const innerR = outerR * 0.48;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (i * Math.PI) / 5;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#090d16';
    ctx.stroke();
    ctx.restore();
  }
}
