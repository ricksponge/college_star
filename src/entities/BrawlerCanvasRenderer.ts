import { BrawlerId } from '../types/cctp';

/**
 * Rendu Canvas 2.5D multi-couches (Supercell / Brawl Stars style) pour :
 * - Les 4 Élèves-Héros (Timo, Léo, Maya, Zack) : ombre elliptique, squash & stretch de marche,
 *   oscillation de foulée, orientation claire vers la visée, arme distincte & silhouette cartoonesque.
 * - Les Robots / Drones d'Examen mobiles et Boss : réacteurs, visière lumineuse, antenne et socle.
 */

export interface IHeroCanvasRenderParams {
  x: number;
  y: number;
  radius: number;
  brawlerId: BrawlerId;
  aimAngle: number;
  isMoving: boolean;
  timeSec: number;
  hasShield?: boolean;
  isErrorShield?: boolean;
  superReady?: boolean;
  tintOpacity?: number;
}

export interface IDroneCanvasRenderParams {
  x: number;
  y: number;
  radius: number;
  timeSec: number;
  isBoss?: boolean;
  isCrystal?: boolean;
  highlighted?: boolean;
  frozen?: boolean;
  slowed?: boolean;
  hitFlash?: boolean;
  badgeLetter?: 'A' | 'B' | 'C' | 'D';
  aimVx?: number;
}

interface BrawlerPalette {
  bodyMain: string;
  bodyDark: string;
  accent: string;
  skin: string;
  hair: string;
  weapon: string;
}

const PALETTES: Record<BrawlerId, BrawlerPalette> = {
  TIMO: {
    bodyMain: '#0ea5e9',
    bodyDark: '#0369a1',
    accent: '#facc15',
    skin: '#fdba74',
    hair: '#1e293b',
    weapon: '#38bdf8',
  },
  LEO: {
    bodyMain: '#a855f7',
    bodyDark: '#6b21a8',
    accent: '#f472b6',
    skin: '#fed7aa',
    hair: '#312e81',
    weapon: '#c084fc',
  },
  MAYA: {
    bodyMain: '#10b981',
    bodyDark: '#065f46',
    accent: '#fde047',
    skin: '#f5b882',
    hair: '#451a03',
    weapon: '#34d399',
  },
  ZACK: {
    bodyMain: '#f97316',
    bodyDark: '#c2410c',
    accent: '#22d3ee',
    skin: '#fde68a',
    hair: '#0f172a',
    weapon: '#fb923c',
  },
};

export function drawBrawlerCanvasSprite(
  ctx: CanvasRenderingContext2D,
  p: IHeroCanvasRenderParams
): void {
  const pal = PALETTES[p.brawlerId];
  const r = p.radius;

  // Squash & stretch dynamique (marche vs respiration calme)
  const stride = p.isMoving ? Math.sin(p.timeSec * 14) : 0;
  const bounce = p.isMoving ? Math.abs(Math.sin(p.timeSec * 14)) * 5.5 : Math.sin(p.timeSec * 3.4) * 1.8;
  const scaleX = p.isMoving ? 1 + stride * 0.08 : 1 + Math.sin(p.timeSec * 3.4) * 0.03;
  const scaleY = p.isMoving ? 1 - stride * 0.07 : 1 - Math.sin(p.timeSec * 3.4) * 0.03;
  const tilt = p.isMoving ? stride * 0.09 : Math.sin(p.timeSec * 2.2) * 0.025;

  const cosA = Math.cos(p.aimAngle);
  const sinA = Math.sin(p.aimAngle);
  const facingRight = cosA >= -0.05;

  ctx.save();
  ctx.globalAlpha = p.tintOpacity ?? 1;

  // 1. Ombre portée elliptique au sol
  ctx.fillStyle = 'rgba(9, 13, 22, 0.42)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + r * 0.72, r * 0.96, r * 0.44, 0, 0, Math.PI * 2);
  ctx.fill();

  // Transformation du corps animé (squash & stretch + oscillation)
  ctx.translate(p.x, p.y - bounce);
  ctx.rotate(tilt);
  ctx.scale(scaleX, scaleY);

  // 2. Chaussures / Pieds animés pendant la course
  const footSwing = stride * 7;
  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#090d16';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.ellipse(-r * 0.34, r * 0.56 + footSwing, r * 0.24, r * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(r * 0.34, r * 0.56 - footSwing, r * 0.24, r * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 3. Sac à dos / Cape scolaire derrière
  ctx.fillStyle = pal.bodyDark;
  ctx.beginPath();
  ctx.roundRect(facingRight ? -r * 0.84 : r * 0.32, -r * 0.25, r * 0.52, r * 0.72, 7);
  ctx.fill();
  ctx.stroke();

  // 4. Torse / Veste multi-couches avec contour épais Supercell
  const torsoGrad = ctx.createLinearGradient(0, -r * 0.42, 0, r * 0.55);
  torsoGrad.addColorStop(0, pal.bodyMain);
  torsoGrad.addColorStop(1, pal.bodyDark);
  ctx.fillStyle = torsoGrad;
  ctx.beginPath();
  ctx.roundRect(-r * 0.62, -r * 0.34, r * 1.24, r * 0.86, 11);
  ctx.fill();
  ctx.stroke();

  // Badge pectoral
  ctx.fillStyle = pal.accent;
  ctx.beginPath();
  ctx.arc(cosA * r * 0.16, r * 0.08, r * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.stroke();

  // 5. Arme / Lanceur orienté selon aimAngle
  ctx.save();
  ctx.translate(cosA * r * 0.32, sinA * r * 0.22 + r * 0.05);
  ctx.rotate(p.aimAngle);
  ctx.fillStyle = pal.weapon;
  ctx.strokeStyle = '#090d16';
  ctx.lineWidth = 2.6;

  if (p.brawlerId === 'TIMO') {
    // Canon-ballon étoilé
    ctx.beginPath();
    ctx.roundRect(0, -6, r * 0.82, 12, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(r * 0.78, 0, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (p.brawlerId === 'LEO') {
    // Plume d'alchimiste + fiole
    ctx.beginPath();
    ctx.roundRect(-2, -5, r * 0.78, 10, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f472b6';
    ctx.beginPath();
    ctx.arc(r * 0.75, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (p.brawlerId === 'MAYA') {
    // Bouclier/Chrono-bâton large
    ctx.beginPath();
    ctx.roundRect(0, -8, r * 0.72, 16, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(r * 0.68, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    // Zack Dual Beats
    ctx.beginPath();
    ctx.roundRect(0, -9, r * 0.72, 7, 3.5);
    ctx.roundRect(0, 2, r * 0.72, 7, 3.5);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // 6. Tête expressive + regard orienté vers aimAngle
  ctx.lineWidth = 2.8;
  ctx.fillStyle = pal.skin;
  ctx.beginPath();
  ctx.arc(0, -r * 0.44, r * 0.56, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Cheveux / Casquette / Casque audio selon le héros
  ctx.fillStyle = pal.hair;
  ctx.beginPath();
  ctx.arc(0, -r * 0.56, r * 0.58, Math.PI * 0.95, Math.PI * 2.05);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (p.brawlerId === 'TIMO') {
    // Bandeau de stratège jaune
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.roundRect(-r * 0.56, -r * 0.62, r * 1.12, r * 0.19, 4);
    ctx.fill();
    ctx.stroke();
  } else if (p.brawlerId === 'ZACK') {
    // Casque audio néon
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.arc(-r * 0.56, -r * 0.44, r * 0.16, 0, Math.PI * 2);
    ctx.arc(r * 0.56, -r * 0.44, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Yeux suivant le vecteur de visée
  const lookX = Math.max(-4, Math.min(4, cosA * 4.2));
  const lookY = Math.max(-2.5, Math.min(2.5, sinA * 2.8));
  ctx.fillStyle = '#090d16';
  ctx.beginPath();
  ctx.arc(-r * 0.18 + lookX, -r * 0.42 + lookY, 3, 0, Math.PI * 2);
  ctx.arc(r * 0.18 + lookX, -r * 0.42 + lookY, 3, 0, Math.PI * 2);
  ctx.fill();
  // Reflets blancs yeux
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-r * 0.2 + lookX, -r * 0.45 + lookY, 1.1, 0, Math.PI * 2);
  ctx.arc(r * 0.16 + lookX, -r * 0.45 + lookY, 1.1, 0, Math.PI * 2);
  ctx.fill();

  // Bouclier actif autour du héros
  if (p.hasShield) {
    ctx.strokeStyle = p.isErrorShield ? '#ef4444' : '#38bdf8';
    ctx.fillStyle = p.isErrorShield ? 'rgba(239,68,68,0.18)' : 'rgba(56,189,248,0.18)';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(0, -r * 0.1, r * 1.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

export function drawExamDroneCanvasSprite(
  ctx: CanvasRenderingContext2D,
  d: IDroneCanvasRenderParams
): void {
  const hoverY = d.isCrystal ? Math.sin(d.timeSec * 4) * 3 : Math.sin(d.timeSec * 6.5 + d.x * 0.02) * 4.5;
  const r = d.radius;

  ctx.save();

  // Ombre au sol sous le drone
  ctx.fillStyle = 'rgba(9, 13, 22, 0.36)';
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + r * 0.72, r * 0.88, r * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();

  // Halo doré du Gadget Vision / Boussole
  if (d.highlighted) {
    const pulse = 1 + Math.sin(d.timeSec * 9) * 0.1;
    ctx.strokeStyle = '#facc15';
    ctx.fillStyle = 'rgba(250, 204, 21, 0.22)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(d.x, d.y, (r + 12) * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.translate(d.x, d.y - hoverY);

  if (d.isCrystal) {
    // Cristal d'énergie facetté
    ctx.fillStyle = d.hitFlash ? '#ffffff' : '#0ea5e9';
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.05);
    ctx.lineTo(r * 0.85, -r * 0.2);
    ctx.lineTo(r * 0.58, r * 0.85);
    ctx.lineTo(-r * 0.58, r * 0.85);
    ctx.lineTo(-r * 0.85, -r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#7dd3fc';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.88);
    ctx.lineTo(r * 0.48, -r * 0.18);
    ctx.lineTo(0, r * 0.52);
    ctx.lineTo(-r * 0.48, -r * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }

  // Rotors / Propulseurs latéraux
  const rotorSpin = Math.sin(d.timeSec * 24) * 5;
  ctx.fillStyle = '#64748b';
  ctx.strokeStyle = '#090d16';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(-r * 1.18, -r * 0.25, r * 0.34, r * 0.55, 6);
  ctx.roundRect(r * 0.84, -r * 0.25, r * 0.34, r * 0.55, 6);
  ctx.fill();
  ctx.stroke();

  // Hélices
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-r * 1.24 + rotorSpin, -r * 0.36);
  ctx.lineTo(-r * 0.78 - rotorSpin, -r * 0.36);
  ctx.moveTo(r * 0.78 + rotorSpin, -r * 0.36);
  ctx.lineTo(r * 1.24 - rotorSpin, -r * 0.36);
  ctx.stroke();

  // Antenne sur le dôme du Robot d'Examen
  ctx.strokeStyle = '#090d16';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.75);
  ctx.lineTo(0, -r * 1.12);
  ctx.stroke();
  ctx.fillStyle = d.isBoss ? '#ef4444' : '#facc15';
  ctx.beginPath();
  ctx.arc(0, -r * 1.16, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Châssis principal du Robot d'Examen
  const hullGrad = ctx.createLinearGradient(0, -r * 0.85, 0, r * 0.85);
  if (d.hitFlash) {
    hullGrad.addColorStop(0, '#ffffff');
    hullGrad.addColorStop(1, '#fecaca');
  } else if (d.frozen) {
    hullGrad.addColorStop(0, '#bae6fd');
    hullGrad.addColorStop(1, '#0284c7');
  } else if (d.isBoss) {
    hullGrad.addColorStop(0, '#f43f5e');
    hullGrad.addColorStop(1, '#881337');
  } else {
    hullGrad.addColorStop(0, '#475569');
    hullGrad.addColorStop(1, '#1e293b');
  }

  ctx.fillStyle = hullGrad;
  ctx.strokeStyle = '#090d16';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.roundRect(-r * 0.88, -r * 0.78, r * 1.76, r * 1.48, d.isBoss ? 18 : 14);
  ctx.fill();
  ctx.stroke();

  // Visière numérique expressive
  ctx.fillStyle = '#090d16';
  ctx.beginPath();
  ctx.roundRect(-r * 0.64, -r * 0.42, r * 1.28, r * 0.46, 8);
  ctx.fill();

  const eyeShift = Math.max(-4, Math.min(4, (d.aimVx ?? 0) * 0.04));
  ctx.fillStyle = d.frozen ? '#7dd3fc' : d.isBoss ? '#fb7185' : '#38bdf8';
  ctx.beginPath();
  ctx.arc(-r * 0.24 + eyeShift, -r * 0.19, r * 0.13, 0, Math.PI * 2);
  ctx.arc(r * 0.24 + eyeShift, -r * 0.19, r * 0.13, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
