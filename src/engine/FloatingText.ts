/**
 * Système de textes flottants animés (rebond élastique + dérive + fondu) :
 * - Dégâts (-1200 !)
 * - Bonus de série (COMBO x3 !)
 * - Correction pédagogique flash immédiate
 */

export type FloatingTextKind = 'damage' | 'combo' | 'correction' | 'info';

export interface IFloatingTextOptions {
  x: number;
  y: number;
  text: string;
  kind?: FloatingTextKind;
  color?: string;
  durationMs?: number;
  fontSize?: number;
}

interface IFloatingTextItem {
  x: number;
  y: number;
  vx: number;
  vy: number;
  text: string;
  kind: FloatingTextKind;
  color: string;
  elapsedMs: number;
  durationMs: number;
  fontSize: number;
}

export class FloatingTextSystem {
  private readonly items: IFloatingTextItem[] = [];

  public clear(): void {
    this.items.length = 0;
  }

  public spawnDamage(x: number, y: number, damage: number, isCritical = false): void {
    this.spawn({
      x: x + (Math.random() - 0.5) * 20,
      y: y - 22,
      text: `-${Math.round(damage)} !`,
      kind: 'damage',
      color: isCritical ? '#fde047' : '#ffffff',
      durationMs: 920,
      fontSize: isCritical ? 25 : 21,
    });
  }

  public spawnComboBonus(x: number, y: number, streak: number, multiplier: number): void {
    this.spawn({
      x,
      y: y - 48,
      text: `COMBO x${streak} (${multiplier.toFixed(2)}x) !`,
      kind: 'combo',
      color: '#38bdf8',
      durationMs: 1150,
      fontSize: 22,
    });
  }

  public spawnCorrection(x: number, y: number, explanation: string): void {
    this.spawn({
      x,
      y: y - 44,
      text: explanation,
      kind: 'correction',
      color: '#fca5a5',
      durationMs: 1350,
      fontSize: 15,
    });
  }

  public spawn(opts: IFloatingTextOptions): void {
    if (this.items.length >= 40) {
      this.items.shift();
    }
    const kind = opts.kind ?? 'info';
    this.items.push({
      x: opts.x,
      y: opts.y,
      vx: kind === 'damage' ? (Math.random() - 0.5) * 32 : 0,
      vy: kind === 'correction' ? -24 : -58,
      text: opts.text,
      kind,
      color: opts.color ?? '#fde047',
      elapsedMs: 0,
      durationMs: opts.durationMs ?? 1000,
      fontSize: opts.fontSize ?? 20,
    });
  }

  public update(dtSec: number): void {
    const dtMs = dtSec * 1000;
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const item = this.items[i];
      item.elapsedMs += dtMs;
      if (item.elapsedMs >= item.durationMs) {
        this.items.splice(i, 1);
        continue;
      }
      item.x += item.vx * dtSec;
      item.y += item.vy * dtSec;
      item.vy *= Math.pow(0.92, dtSec * 60);
    }
  }

  public render(
    ctx: CanvasRenderingContext2D,
    worldToScreen: (wx: number, wy: number) => { x: number; y: number }
  ): void {
    if (this.items.length === 0) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const item of this.items) {
      const progress = Math.min(1, item.elapsedMs / item.durationMs);
      // Rebond initial rapide sur les 180 premières millisecondes
      const popT = Math.min(1, item.elapsedMs / 180);
      const scale =
        popT < 0.65
          ? 0.5 + (popT / 0.65) * 0.78
          : 1.28 - ((popT - 0.65) / 0.35) * 0.28;
      const alpha = progress > 0.68 ? Math.max(0, 1 - (progress - 0.68) / 0.32) : 1;
      if (alpha <= 0.02) continue;

      const pos = worldToScreen(item.x, item.y);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(pos.x, pos.y);
      ctx.scale(scale, scale);

      if (item.kind === 'correction') {
        ctx.font = `700 ${item.fontSize}px 'Fredoka', 'Lilita One', sans-serif`;
        const maxWidth = 300;
        const measured = Math.min(maxWidth, ctx.measureText(item.text).width + 26);
        const boxW = Math.max(180, measured);
        const boxH = 34;

        ctx.fillStyle = 'rgba(127, 29, 29, 0.94)';
        ctx.strokeStyle = '#090d16';
        ctx.lineWidth = 3;
        this.roundRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, 12);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fef2f2';
        ctx.strokeStyle = '#090d16';
        ctx.lineWidth = 3;
        ctx.strokeText(item.text, 0, 1, boxW - 18);
        ctx.fillText(item.text, 0, 1, boxW - 18);
      } else {
        ctx.font = `900 ${item.fontSize}px 'Lilita One', 'Fredoka', sans-serif`;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#090d16';
        ctx.lineWidth = 5;
        ctx.strokeText(item.text, 0, 2);
        ctx.strokeText(item.text, 0, 0);
        ctx.fillStyle = item.color;
        ctx.fillText(item.text, 0, 0);
      }

      ctx.restore();
    }
    ctx.restore();
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
