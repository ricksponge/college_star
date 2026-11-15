import type { BrawlerId } from '../types/cctp';

// ============================================================================
// TYPES & CONTRATS DU PIPELINE SVG MULTI-COUCHES
// ============================================================================

export type SkinId = 'RENTREE' | 'DELEGUE_OR' | 'CYBER_6EME';

export type BrawlerExpression = 'IDLE' | 'FOCUS' | 'HAPPY_STAR' | 'HURT' | 'SUPER_RAGE';

export interface ISkinPalette {
  primary: string;
  primaryShade: string;
  secondary: string;
  secondaryShade: string;
  accent: string;
  accentGlow: string;
  pants: string;
  pantsShade: string;
  shoe: string;
  sole: string;
  skin: string;
  skinShade: string;
  hair: string;
  hairShade: string;
  eye: string;
  ink: string;
  trim: string;
  weaponCore: string;
  weaponGlow: string;
  auraPrimary: string;
  auraSecondary: string;
}

export interface ISkinDefinition {
  id: SkinId;
  brawlerId: BrawlerId;
  name: string;
  displayTitle: string;
  badgeLabel: string;
  rarity: 'COMMUN' | 'EPIQUE' | 'LEGENDAIRE';
  description: string;
  palette: ISkinPalette;
}

export interface IBrawlerSvgOptions {
  brawlerId: BrawlerId;
  skinId?: SkinId;
  expression?: BrawlerExpression;
  weaponAngleRad?: number;
  superCharged?: boolean;
  walkPhaseRad?: number;
  width?: number;
  height?: number;
  instanceId?: string;
  className?: string;
}

export interface ISvgCharacterRig extends SVGSVGElement {
  readonly brawlerId: BrawlerId;
  readonly skinId: SkinId;
  readonly pivotX: number;
  readonly pivotY: number;
  setWeaponAngle(rad: number): void;
  setExpression(expr: BrawlerExpression): void;
  setSuperCharged(active: boolean): void;
  setWalkPhase(phaseRad: number): void;
}

// ============================================================================
// CONSTANTES GÉOMÉTRIQUES & CATALOGUE COMPLET (4 HÉROS × 3 SKINS)
// ============================================================================

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEWBOX_SIZE = 256;
const WEAPON_PIVOT_X = 162;
const WEAPON_PIVOT_Y = 148;
const BODY_BASE_Y = 0;

let svgInstanceSeq = 0;

export const ALL_BRAWLER_IDS: readonly BrawlerId[] = ['TIMO', 'LEO', 'MAYA', 'ZACK'];
export const ALL_SKIN_IDS: readonly SkinId[] = ['RENTREE', 'DELEGUE_OR', 'CYBER_6EME'];
export const ALL_EXPRESSIONS: readonly BrawlerExpression[] = [
  'IDLE',
  'FOCUS',
  'HAPPY_STAR',
  'HURT',
  'SUPER_RAGE',
];

const SKIN_META: Record<
  SkinId,
  { name: string; badgeLabel: string; rarity: 'COMMUN' | 'EPIQUE' | 'LEGENDAIRE' }
> = {
  RENTREE: { name: 'Rentrée', badgeLabel: 'RENTRÉE', rarity: 'COMMUN' },
  DELEGUE_OR: { name: 'Délégué Or', badgeLabel: 'DÉLÉGUÉ OR', rarity: 'EPIQUE' },
  CYBER_6EME: { name: 'Cyber-6ème', badgeLabel: 'CYBER-6ÈME', rarity: 'LEGENDAIRE' },
};

function makeSkin(
  brawlerId: BrawlerId,
  id: SkinId,
  displayTitle: string,
  description: string,
  palette: ISkinPalette
): ISkinDefinition {
  const meta = SKIN_META[id];
  return {
    id,
    brawlerId,
    name: meta.name,
    displayTitle,
    badgeLabel: meta.badgeLabel,
    rarity: meta.rarity,
    description,
    palette,
  };
}

export const SKIN_CATALOG: Record<BrawlerId, Record<SkinId, ISkinDefinition>> = {
  TIMO: {
    RENTREE: makeSkin(
      'TIMO',
      'RENTREE',
      'Timo Rentrée',
      'Maillot jaune stade #10, brassard rouge et ballon énergie Frappe Brossée.',
      {
        primary: '#facc15',
        primaryShade: '#eab308',
        secondary: '#2563eb',
        secondaryShade: '#1d4ed8',
        accent: '#ef4444',
        accentGlow: '#38bdf8',
        pants: '#1d4ed8',
        pantsShade: '#1e3a8a',
        shoe: '#2563eb',
        sole: '#f8fafc',
        skin: '#fed7aa',
        skinShade: '#fdba74',
        hair: '#fde047',
        hairShade: '#eab308',
        eye: '#0284c7',
        ink: '#090d16',
        trim: '#f8fafc',
        weaponCore: '#fef08a',
        weaponGlow: '#38bdf8',
        auraPrimary: '#facc15',
        auraSecondary: '#38bdf8',
      }
    ),
    DELEGUE_OR: makeSkin(
      'TIMO',
      'DELEGUE_OR',
      'Timo Délégué Or',
      'Vareuse royale or et bleu nuit, écharpe tricolore de délégué, laurier et ballon d’or.',
      {
        primary: '#fbbf24',
        primaryShade: '#d97706',
        secondary: '#1e3a8a',
        secondaryShade: '#0f172a',
        accent: '#fef08a',
        accentGlow: '#fde047',
        pants: '#1e293b',
        pantsShade: '#0f172a',
        shoe: '#b45309',
        sole: '#fef9c3',
        skin: '#fed7aa',
        skinShade: '#fdba74',
        hair: '#fde047',
        hairShade: '#d97706',
        eye: '#0284c7',
        ink: '#090d16',
        trim: '#fef08a',
        weaponCore: '#fde047',
        weaponGlow: '#fffbeb',
        auraPrimary: '#fbbf24',
        auraSecondary: '#fef08a',
      }
    ),
    CYBER_6EME: makeSkin(
      'TIMO',
      'CYBER_6EME',
      'Timo Cyber-6ème',
      'Armure carbone néon, visière holo cyan, circuits lumineux et sphère plasma.',
      {
        primary: '#0f172a',
        primaryShade: '#020617',
        secondary: '#06b6d4',
        secondaryShade: '#0e7490',
        accent: '#f43f5e',
        accentGlow: '#22d3ee',
        pants: '#1e293b',
        pantsShade: '#0f172a',
        shoe: '#0f172a',
        sole: '#22d3ee',
        skin: '#fed7aa',
        skinShade: '#fdba74',
        hair: '#38bdf8',
        hairShade: '#0284c7',
        eye: '#22d3ee',
        ink: '#090d16',
        trim: '#22d3ee',
        weaponCore: '#22d3ee',
        weaponGlow: '#e879f9',
        auraPrimary: '#22d3ee',
        auraSecondary: '#f43f5e',
      }
    ),
  },
  LEO: {
    RENTREE: makeSkin(
      'LEO',
      'RENTREE',
      'Léo Rentrée',
      'Sweat à capuche bleu nuit, lunettes dorées, sacoche de grimoire et fiole d’encre.',
      {
        primary: '#312e81',
        primaryShade: '#1e1b4b',
        secondary: '#4f46e5',
        secondaryShade: '#3730a3',
        accent: '#a855f7',
        accentGlow: '#22d3ee',
        pants: '#1e1b4b',
        pantsShade: '#0f172a',
        shoe: '#6d28d9',
        sole: '#fbbf24',
        skin: '#fed7aa',
        skinShade: '#fdba74',
        hair: '#5c280a',
        hairShade: '#451a03',
        eye: '#9333ea',
        ink: '#090d16',
        trim: '#fbbf24',
        weaponCore: '#a855f7',
        weaponGlow: '#e879f9',
        auraPrimary: '#a855f7',
        auraSecondary: '#22d3ee',
      }
    ),
    DELEGUE_OR: makeSkin(
      'LEO',
      'DELEGUE_OR',
      'Léo Délégué Or',
      'Toge académique prune et or, écharpe de délégué, laurier et plume calligraphique dorée.',
      {
        primary: '#4c1d95',
        primaryShade: '#2e1065',
        secondary: '#f59e0b',
        secondaryShade: '#b45309',
        accent: '#fde047',
        accentGlow: '#fef08a',
        pants: '#1e1b4b',
        pantsShade: '#0f172a',
        shoe: '#92400e',
        sole: '#fef08a',
        skin: '#fed7aa',
        skinShade: '#fdba74',
        hair: '#5c280a',
        hairShade: '#451a03',
        eye: '#a855f7',
        ink: '#090d16',
        trim: '#fbbf24',
        weaponCore: '#fbbf24',
        weaponGlow: '#fef08a',
        auraPrimary: '#fbbf24',
        auraSecondary: '#c084fc',
      }
    ),
    CYBER_6EME: makeSkin(
      'LEO',
      'CYBER_6EME',
      'Léo Cyber-6ème',
      'Capuche holo-synthèse, visière néon magenta, grimoire digital et stylet laser.',
      {
        primary: '#111827',
        primaryShade: '#030712',
        secondary: '#7e22ce',
        secondaryShade: '#581c87',
        accent: '#22d3ee',
        accentGlow: '#e879f9',
        pants: '#0f172a',
        pantsShade: '#020617',
        shoe: '#1e1b4b',
        sole: '#e879f9',
        skin: '#fed7aa',
        skinShade: '#fdba74',
        hair: '#c084fc',
        hairShade: '#7e22ce',
        eye: '#e879f9',
        ink: '#090d16',
        trim: '#22d3ee',
        weaponCore: '#e879f9',
        weaponGlow: '#22d3ee',
        auraPrimary: '#22d3ee',
        auraSecondary: '#e879f9',
      }
    ),
  },
  MAYA: {
    RENTREE: makeSkin(
      'MAYA',
      'RENTREE',
      'Maya Rentrée',
      'Veste kaki d’exploratrice, chapeau aventure, sangles cuir et boussole-bouclier.',
      {
        primary: '#65a30d',
        primaryShade: '#4d7c0f',
        secondary: '#78350f',
        secondaryShade: '#451a03',
        accent: '#f59e0b',
        accentGlow: '#38bdf8',
        pants: '#3f6212',
        pantsShade: '#365314',
        shoe: '#78350f',
        sole: '#d97706',
        skin: '#fdba74',
        skinShade: '#fb923c',
        hair: '#7c2d12',
        hairShade: '#431407',
        eye: '#10b981',
        ink: '#090d16',
        trim: '#fbbf24',
        weaponCore: '#0284c7',
        weaponGlow: '#38bdf8',
        auraPrimary: '#38bdf8',
        auraSecondary: '#facc15',
      }
    ),
    DELEGUE_OR: makeSkin(
      'MAYA',
      'DELEGUE_OR',
      'Maya Déléguée Or',
      'Uniforme d’expédition ivoire & or, écharpe de déléguée, couronne de laurier et astrolabe.',
      {
        primary: '#eab308',
        primaryShade: '#b45309',
        secondary: '#1e3a8a',
        secondaryShade: '#172554',
        accent: '#fef08a',
        accentGlow: '#fbbf24',
        pants: '#1e293b',
        pantsShade: '#0f172a',
        shoe: '#78350f',
        sole: '#fde047',
        skin: '#fdba74',
        skinShade: '#fb923c',
        hair: '#7c2d12',
        hairShade: '#431407',
        eye: '#10b981',
        ink: '#090d16',
        trim: '#fde047',
        weaponCore: '#f59e0b',
        weaponGlow: '#fef08a',
        auraPrimary: '#fbbf24',
        auraSecondary: '#38bdf8',
      }
    ),
    CYBER_6EME: makeSkin(
      'MAYA',
      'CYBER_6EME',
      'Maya Cyber-6ème',
      'Exo-armure émeraude-carbone, visière holo tactique et bouclier radar hexagonal.',
      {
        primary: '#0f172a',
        primaryShade: '#020617',
        secondary: '#10b981',
        secondaryShade: '#047857',
        accent: '#22d3ee',
        accentGlow: '#f43f5e',
        pants: '#1e293b',
        pantsShade: '#0f172a',
        shoe: '#064e3b',
        sole: '#22d3ee',
        skin: '#fdba74',
        skinShade: '#fb923c',
        hair: '#34d399',
        hairShade: '#059669',
        eye: '#22d3ee',
        ink: '#090d16',
        trim: '#22d3ee',
        weaponCore: '#06b6d4',
        weaponGlow: '#34d399',
        auraPrimary: '#22d3ee',
        auraSecondary: '#34d399',
      }
    ),
  },
  ZACK: {
    RENTREE: makeSkin(
      'ZACK',
      'RENTREE',
      'Zack Rentrée',
      'Veste teddy cyan & magenta, casque audio néon, rollers magnétiques et Double Beat.',
      {
        primary: '#06b6d4',
        primaryShade: '#0891b2',
        secondary: '#ec4899',
        secondaryShade: '#db2777',
        accent: '#22d3ee',
        accentGlow: '#22d3ee',
        pants: '#0f172a',
        pantsShade: '#020617',
        shoe: '#1e293b',
        sole: '#22d3ee',
        skin: '#fed7aa',
        skinShade: '#fdba74',
        hair: '#1e293b',
        hairShade: '#090d16',
        eye: '#06b6d4',
        ink: '#090d16',
        trim: '#f8fafc',
        weaponCore: '#ec4899',
        weaponGlow: '#22d3ee',
        auraPrimary: '#22d3ee',
        auraSecondary: '#ec4899',
      }
    ),
    DELEGUE_OR: makeSkin(
      'ZACK',
      'DELEGUE_OR',
      'Zack Délégué Or',
      'Teddy prestige noir & or, casque platine, écharpe de délégué et blaster VIP.',
      {
        primary: '#1e293b',
        primaryShade: '#0f172a',
        secondary: '#fbbf24',
        secondaryShade: '#d97706',
        accent: '#fde047',
        accentGlow: '#fef08a',
        pants: '#0f172a',
        pantsShade: '#020617',
        shoe: '#78350f',
        sole: '#fde047',
        skin: '#fed7aa',
        skinShade: '#fdba74',
        hair: '#0f172a',
        hairShade: '#020617',
        eye: '#f59e0b',
        ink: '#090d16',
        trim: '#fde047',
        weaponCore: '#f59e0b',
        weaponGlow: '#fef08a',
        auraPrimary: '#fbbf24',
        auraSecondary: '#f8fafc',
      }
    ),
    CYBER_6EME: makeSkin(
      'ZACK',
      'CYBER_6EME',
      'Zack Cyber-6ème',
      'Combinaison néon synthwave, visière holo double spectre et pulse-blaster cyan/magenta.',
      {
        primary: '#090d16',
        primaryShade: '#020617',
        secondary: '#f43f5e',
        secondaryShade: '#be123c',
        accent: '#22d3ee',
        accentGlow: '#e879f9',
        pants: '#111827',
        pantsShade: '#030712',
        shoe: '#0f172a',
        sole: '#e879f9',
        skin: '#fed7aa',
        skinShade: '#fdba74',
        hair: '#22d3ee',
        hairShade: '#0284c7',
        eye: '#f43f5e',
        ink: '#090d16',
        trim: '#22d3ee',
        weaponCore: '#22d3ee',
        weaponGlow: '#f43f5e',
        auraPrimary: '#22d3ee',
        auraSecondary: '#e879f9',
      }
    ),
  },
};

export function getSkinDefinition(brawlerId: BrawlerId, skinId: SkinId = 'RENTREE'): ISkinDefinition {
  return SKIN_CATALOG[brawlerId][skinId];
}

export function getSkinsForBrawler(brawlerId: BrawlerId): ISkinDefinition[] {
  return ALL_SKIN_IDS.map((skinId) => SKIN_CATALOG[brawlerId][skinId]);
}

// ============================================================================
// HELPERS DE CALCUL TRANSFORMS & COULEURS
// ============================================================================

function computeWeaponTransform(angleRad: number, pivotX = WEAPON_PIVOT_X, pivotY = WEAPON_PIVOT_Y): string {
  const deg = (angleRad * 180) / Math.PI;
  const flipY = Math.cos(angleRad) < 0 ? -1 : 1;
  if (flipY < 0) {
    return `rotate(${deg.toFixed(2)} ${pivotX} ${pivotY}) translate(${pivotX} ${pivotY}) scale(1 -1) translate(${-pivotX} ${-pivotY})`;
  }
  return `rotate(${deg.toFixed(2)} ${pivotX} ${pivotY})`;
}

interface IWalkOffsets {
  bodyTranslateY: number;
  leftLegTransform: string;
  rightLegTransform: string;
  shadowScaleX: number;
}

function computeWalkOffsets(phaseRad: number): IWalkOffsets {
  const stride = Math.sin(phaseRad);
  const bounce = -Math.abs(stride) * 4.5;
  const leftY = Math.max(0, stride) * -6;
  const rightY = Math.max(0, -stride) * -6;
  const leftRot = stride * 12;
  const rightRot = -stride * 12;
  const shadowScaleX = 1 - Math.abs(stride) * 0.08;
  return {
    bodyTranslateY: BODY_BASE_Y + bounce,
    leftLegTransform: `translate(0 ${leftY.toFixed(2)}) rotate(${leftRot.toFixed(2)} 110 186)`,
    rightLegTransform: `translate(0 ${rightY.toFixed(2)}) rotate(${rightRot.toFixed(2)} 146 186)`,
    shadowScaleX,
  };
}

// ============================================================================
// GÉNÉRATEUR DES COUCHES VECTORIELLES HD (BRAWL STARS / CEL-SHADING)
// ============================================================================

function buildDefs(uid: string, p: ISkinPalette): string {
  return `
  <defs>
    <radialGradient id="${uid}_auraGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${p.auraSecondary}" stop-opacity="0.72" />
      <stop offset="52%" stop-color="${p.auraPrimary}" stop-opacity="0.38" />
      <stop offset="100%" stop-color="${p.auraPrimary}" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="${uid}_torsoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${p.primary}" />
      <stop offset="100%" stop-color="${p.primaryShade}" />
    </linearGradient>
    <linearGradient id="${uid}_secGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${p.secondary}" />
      <stop offset="100%" stop-color="${p.secondaryShade}" />
    </linearGradient>
    <linearGradient id="${uid}_skinGrad" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="${p.skin}" />
      <stop offset="100%" stop-color="${p.skinShade}" />
    </linearGradient>
    <linearGradient id="${uid}_hairGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${p.hair}" />
      <stop offset="100%" stop-color="${p.hairShade}" />
    </linearGradient>
    <radialGradient id="${uid}_weaponGrad" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="35%" stop-color="${p.weaponGlow}" />
      <stop offset="100%" stop-color="${p.weaponCore}" />
    </radialGradient>
    <linearGradient id="${uid}_visorGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.58" />
      <stop offset="50%" stop-color="#e879f9" stop-opacity="0.38" />
      <stop offset="100%" stop-color="#22d3ee" stop-opacity="0.62" />
    </linearGradient>
    <linearGradient id="${uid}_goldTrim" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="50%" stop-color="#fbbf24" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>
  </defs>`;
}

function buildShadowLayer(walk: IWalkOffsets): string {
  return `
  <g data-layer="shadow" transform="translate(128 228) scale(${walk.shadowScaleX.toFixed(3)} 1)">
    <ellipse cx="0" cy="0" rx="58" ry="15" fill="#090d16" fill-opacity="0.38" />
    <ellipse cx="0" cy="-1" rx="42" ry="9" fill="#090d16" fill-opacity="0.28" />
  </g>`;
}

function buildAuraLayer(uid: string, p: ISkinPalette, superCharged: boolean): string {
  const opacity = superCharged ? '1' : '0';
  const spikes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const x1 = 128 + Math.cos(a) * 82;
    const y1 = 136 + Math.sin(a) * 82;
    const x2 = 128 + Math.cos(a) * 108;
    const y2 = 136 + Math.sin(a) * 108;
    spikes.push(
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${
        i % 2 === 0 ? p.auraPrimary : p.auraSecondary
      }" stroke-width="5" stroke-linecap="round" />`
    );
  }
  return `
  <g data-layer="fx-aura" data-super-active="${superCharged ? 'true' : 'false'}" opacity="${opacity}">
    <circle cx="128" cy="136" r="106" fill="url(#${uid}_auraGrad)" />
    <circle cx="128" cy="136" r="90" fill="none" stroke="${p.auraPrimary}" stroke-width="4" stroke-dasharray="18 10" />
    <circle cx="128" cy="136" r="78" fill="none" stroke="${p.auraSecondary}" stroke-width="2.5" stroke-dasharray="9 12" />
    <path d="M44 108 L58 96 L52 114 L68 102" fill="none" stroke="${p.auraSecondary}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M210 104 L196 116 L204 122 L188 134" fill="none" stroke="${p.auraPrimary}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
    ${spikes.join('')}
  </g>`;
}

function buildLeg(
  partName: 'leg-left' | 'leg-right',
  cx: number,
  p: ISkinPalette,
  brawlerId: BrawlerId,
  skinId: SkinId,
  transform: string
): string {
  const isZack = brawlerId === 'ZACK';
  const isTimo = brawlerId === 'TIMO';
  const legWidth = 22;
  const sockBand = isTimo
    ? `<rect x="${cx - 10}" y="198" width="20" height="5" rx="2" fill="${p.trim}" />`
    : '';
  const skateWheels = isZack
    ? `<circle cx="${cx - 9}" cy="225" r="5.5" fill="${p.sole}" stroke="${p.ink}" stroke-width="3" />
       <circle cx="${cx + 9}" cy="225" r="5.5" fill="${p.sole}" stroke="${p.ink}" stroke-width="3" />`
    : '';
  const cyberKneepad =
    skinId === 'CYBER_6EME'
      ? `<polygon points="${cx - 9},188 ${cx + 9},188 ${cx + 6},198 ${cx - 6},198" fill="${p.accentGlow}" stroke="${p.ink}" stroke-width="2.5" />`
      : '';

  return `
    <g data-part="${partName}" transform="${transform}">
      <rect x="${cx - legWidth / 2}" y="180" width="${legWidth}" height="28" rx="9" fill="${p.pants}" stroke="${p.ink}" stroke-width="4.5" />
      <rect x="${cx - legWidth / 2 + 2}" y="182" width="7" height="22" rx="3" fill="${p.pantsShade}" opacity="0.45" />
      ${sockBand}
      ${cyberKneepad}
      <path d="M${cx - 14} 206 Q${cx} 201 ${cx + 16} 206 L${cx + 18} 218 Q${cx} 222 ${cx - 16} 218 Z" fill="${p.shoe}" stroke="${p.ink}" stroke-width="4.5" stroke-linejoin="round" />
      <path d="M${cx - 16} 215 L${cx + 18} 215 L${cx + 17} 222 Q${cx} 225 ${cx - 15} 222 Z" fill="${p.sole}" stroke="${p.ink}" stroke-width="3.5" stroke-linejoin="round" />
      ${skateWheels}
    </g>`;
}

function buildDelegateSash(uid: string): string {
  return `
    <g data-part="delegate-sash">
      <path d="M97 132 L112 130 L160 182 L145 186 Z" fill="#2563eb" stroke="#090d16" stroke-width="3.5" stroke-linejoin="round" />
      <path d="M104 131 L110 130 L156 183 L150 185 Z" fill="#f8fafc" />
      <path d="M108 130 L114 130 L160 182 L155 184 Z" fill="#ef4444" />
      <path d="M97 132 L160 182" stroke="url(#${uid}_goldTrim)" stroke-width="3" />
      <circle cx="145" cy="175" r="8" fill="url(#${uid}_goldTrim)" stroke="#090d16" stroke-width="3" />
      <polygon points="145,170 146.8,173.8 150.8,174.2 147.8,176.8 148.6,180.6 145,178.5 141.4,180.6 142.2,176.8 139.2,174.2 143.2,173.8" fill="#ffffff" />
    </g>`;
}

function buildCyberArmorLines(p: ISkinPalette): string {
  return `
    <g data-part="cyber-circuits" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M100 138 L114 152 L114 172" stroke="${p.accentGlow}" stroke-width="3" />
      <path d="M156 138 L142 152 L142 172" stroke="${p.accent}" stroke-width="3" />
      <polygon points="128,144 136,154 128,164 120,154" fill="${p.accentGlow}" stroke="${p.ink}" stroke-width="2.5" />
      <circle cx="128" cy="154" r="3" fill="#ffffff" />
    </g>`;
}

function buildHeroTorsoDetails(brawlerId: BrawlerId, skinId: SkinId, p: ISkinPalette): string {
  if (brawlerId === 'TIMO') {
    const numberColor = skinId === 'CYBER_6EME' ? p.accentGlow : '#f8fafc';
    return `
      <rect x="117" y="135" width="22" height="46" fill="${p.secondary}" />
      <path d="M114 133 L128 146 L142 133" fill="none" stroke="${p.trim}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
      <text x="128" y="167" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="19" fill="${numberColor}" stroke="${p.ink}" stroke-width="2.5" paint-order="stroke">10</text>`;
  }
  if (brawlerId === 'LEO') {
    return `
      <path d="M106 134 Q128 146 150 134" fill="none" stroke="${p.secondary}" stroke-width="8" stroke-linecap="round" />
      <path d="M116 140 L114 162" stroke="${p.trim}" stroke-width="3.2" stroke-linecap="round" />
      <path d="M140 140 L142 162" stroke="${p.trim}" stroke-width="3.2" stroke-linecap="round" />
      <circle cx="114" cy="164" r="3" fill="${p.trim}" />
      <circle cx="142" cy="164" r="3" fill="${p.trim}" />
      <rect x="108" y="164" width="40" height="15" rx="6" fill="${p.secondaryShade}" stroke="${p.ink}" stroke-width="3" />
      <path d="M97 136 L148 182" stroke="#78350f" stroke-width="6.5" stroke-linecap="round" />
      <rect x="82" y="156" width="22" height="28" rx="5" fill="#78350f" stroke="${p.ink}" stroke-width="3.5" />
      <rect x="85" y="150" width="14" height="14" rx="2" transform="rotate(-12 92 157)" fill="#581c87" stroke="${p.ink}" stroke-width="2.5" />
      <polygon points="92,153 95,157 92,161 89,157" fill="${p.accentGlow}" />`;
  }
  if (brawlerId === 'MAYA') {
    return `
      <rect x="88" y="138" width="16" height="36" rx="6" fill="#713f12" stroke="${p.ink}" stroke-width="3.5" />
      <rect x="110" y="134" width="7" height="46" fill="${p.secondary}" stroke="${p.ink}" stroke-width="2.5" />
      <rect x="139" y="134" width="7" height="46" fill="${p.secondary}" stroke="${p.ink}" stroke-width="2.5" />
      <rect x="108" y="154" width="11" height="8" rx="2" fill="${p.trim}" stroke="${p.ink}" stroke-width="2" />
      <rect x="137" y="154" width="11" height="8" rx="2" fill="${p.trim}" stroke="${p.ink}" stroke-width="2" />
      <line x1="128" y1="136" x2="128" y2="180" stroke="${p.ink}" stroke-width="3" />`;
  }
  // ZACK
  return `
    <rect x="122" y="134" width="12" height="46" fill="${p.trim}" stroke="${p.ink}" stroke-width="2.5" />
    <path d="M108 134 Q128 144 148 134" fill="none" stroke="${p.trim}" stroke-width="6" stroke-linecap="round" />
    <rect x="96" y="175" width="64" height="7" rx="3" fill="${p.trim}" stroke="${p.ink}" stroke-width="2.5" />
    <polygon points="140,145 151,145 142,156 151,156" fill="none" stroke="${p.accentGlow}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />`;
}

function buildBodyLayer(
  uid: string,
  brawlerId: BrawlerId,
  skinId: SkinId,
  p: ISkinPalette,
  walk: IWalkOffsets
): string {
  const backArmFill = brawlerId === 'ZACK' ? p.secondary : p.primary;
  const armband =
    brawlerId === 'TIMO'
      ? `<rect x="78" y="150" width="18" height="8" rx="2" transform="rotate(14 87 154)" fill="${p.accent}" stroke="${p.ink}" stroke-width="2.5" />`
      : '';

  const skinOverlay =
    skinId === 'DELEGUE_OR'
      ? buildDelegateSash(uid)
      : skinId === 'CYBER_6EME'
      ? buildCyberArmorLines(p)
      : '';

  return `
  <g data-layer="body" transform="translate(0 ${walk.bodyTranslateY.toFixed(2)})">
    ${buildLeg('leg-left', 110, p, brawlerId, skinId, walk.leftLegTransform)}
    ${buildLeg('leg-right', 146, p, brawlerId, skinId, walk.rightLegTransform)}

    <!-- Bras gauche (appui) -->
    <g data-part="arm-left">
      <path d="M98 138 Q82 146 80 168" fill="none" stroke="${p.ink}" stroke-width="23" stroke-linecap="round" />
      <path d="M98 138 Q82 146 80 168" fill="none" stroke="${backArmFill}" stroke-width="14.5" stroke-linecap="round" />
      ${armband}
      <circle cx="80" cy="171" r="9.5" fill="url(#${uid}_skinGrad)" stroke="${p.ink}" stroke-width="4" />
    </g>

    <!-- Torse héroïque cel-shaded -->
    <path d="M96 136 Q128 128 160 136 L163 180 Q128 190 93 180 Z" fill="url(#${uid}_torsoGrad)" stroke="${p.ink}" stroke-width="5" stroke-linejoin="round" />
    <path d="M99 138 L109 138 L106 180 L96 178 Z" fill="#ffffff" fill-opacity="0.2" />
    ${buildHeroTorsoDetails(brawlerId, skinId, p)}
    ${skinOverlay}

    <!-- Ceinture + boucle -->
    <rect x="94" y="176" width="68" height="10" rx="4" fill="${p.pantsShade}" stroke="${p.ink}" stroke-width="3.5" />
    <rect x="120" y="174" width="16" height="14" rx="3" fill="${p.trim}" stroke="${p.ink}" stroke-width="3" />
    <!-- Cou -->
    <rect x="118" y="122" width="20" height="16" rx="6" fill="url(#${uid}_skinGrad)" stroke="${p.ink}" stroke-width="4" />
  </g>`;
}

export function buildExpressionFaceMarkup(
  expression: BrawlerExpression,
  p: ISkinPalette
): string {
  const leftEyeX = 112;
  const rightEyeX = 144;
  const eyeY = 92;

  const blush = `
    <ellipse cx="97" cy="103" rx="6.5" ry="3.8" fill="#fb7185" fill-opacity="0.58" />
    <ellipse cx="159" cy="103" rx="6.5" ry="3.8" fill="#fb7185" fill-opacity="0.58" />`;

  const nose = `<ellipse cx="128" cy="99" rx="3.8" ry="2.6" fill="${p.skinShade}" stroke="${p.ink}" stroke-width="2" />`;

  const buildStandardEye = (cx: number, irisScale = 1): string => {
    return `
      <ellipse cx="${cx}" cy="${eyeY}" rx="9.5" ry="11.5" fill="#ffffff" stroke="${p.ink}" stroke-width="3.2" />
      <circle cx="${cx}" cy="${eyeY + 1}" r="${(6.2 * irisScale).toFixed(1)}" fill="${p.eye}" />
      <circle cx="${cx}" cy="${eyeY + 1}" r="${(3.6 * irisScale).toFixed(1)}" fill="${p.ink}" />
      <circle cx="${cx + 2.8}" cy="${eyeY - 3.2}" r="2.4" fill="#ffffff" />
      <circle cx="${cx - 2.4}" cy="${eyeY + 3.2}" r="1.2" fill="#ffffff" />
      <path d="M${cx - 10} ${eyeY - 5} Q${cx} ${eyeY - 14} ${cx + 10} ${eyeY - 5}" fill="none" stroke="${p.ink}" stroke-width="3.6" stroke-linecap="round" />`;
  };

  switch (expression) {
    case 'IDLE':
      return `
        ${blush}
        ${buildStandardEye(leftEyeX)}
        ${buildStandardEye(rightEyeX)}
        <path d="M101 74 Q112 70 122 75" fill="none" stroke="${p.ink}" stroke-width="4" stroke-linecap="round" />
        <path d="M134 75 Q144 70 155 74" fill="none" stroke="${p.ink}" stroke-width="4" stroke-linecap="round" />
        ${nose}
        <path d="M117 109 Q128 119 139 109 Z" fill="#ffffff" stroke="${p.ink}" stroke-width="3.2" stroke-linejoin="round" />`;

    case 'FOCUS':
      return `
        ${blush}
        ${buildStandardEye(leftEyeX, 0.85)}
        ${buildStandardEye(rightEyeX, 0.85)}
        <path d="M100 73 L123 79" fill="none" stroke="${p.ink}" stroke-width="4.5" stroke-linecap="round" />
        <path d="M156 73 L133 79" fill="none" stroke="${p.ink}" stroke-width="4.5" stroke-linecap="round" />
        ${nose}
        <path d="M119 112 Q128 109 138 111" fill="none" stroke="${p.ink}" stroke-width="3.6" stroke-linecap="round" />
        <path d="M167 74 L173 68 M169 80 L177 79" stroke="#facc15" stroke-width="3" stroke-linecap="round" />`;

    case 'HAPPY_STAR': {
      const star = (cx: number, cy: number): string =>
        `<polygon points="${cx},${cy - 8} ${cx + 2.5},${cy - 2.5} ${cx + 8},${cy} ${cx + 2.5},${cy + 2.5} ${cx},${cy + 8} ${cx - 2.5},${cy + 2.5} ${cx - 8},${cy} ${cx - 2.5},${cy - 2.5}" fill="#fde047" stroke="${p.ink}" stroke-width="2" stroke-linejoin="round" />`;
      return `
        ${blush}
        ${buildStandardEye(leftEyeX, 1.05)}
        ${buildStandardEye(rightEyeX, 1.05)}
        ${star(leftEyeX, eyeY)}
        ${star(rightEyeX, eyeY)}
        <path d="M102 72 Q112 66 121 72" fill="none" stroke="${p.ink}" stroke-width="4" stroke-linecap="round" />
        <path d="M135 72 Q144 66 154 72" fill="none" stroke="${p.ink}" stroke-width="4" stroke-linecap="round" />
        ${nose}
        <path d="M114 107 Q128 123 142 107 Z" fill="#fb7185" stroke="${p.ink}" stroke-width="3.4" stroke-linejoin="round" />
        <path d="M117 108 L139 108 L136 113 L120 113 Z" fill="#ffffff" />
        ${star(80, 74)}
        ${star(176, 74)}`;
    }

    case 'HURT':
      return `
        <path d="M103 86 L120 92 L103 98" fill="none" stroke="${p.ink}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M153 86 L136 92 L153 98" fill="none" stroke="${p.ink}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M102 79 L120 73" fill="none" stroke="${p.ink}" stroke-width="4" stroke-linecap="round" />
        <path d="M154 79 L136 73" fill="none" stroke="${p.ink}" stroke-width="4" stroke-linecap="round" />
        ${nose}
        <path d="M115 113 Q121 107 128 113 Q135 119 141 113" fill="none" stroke="${p.ink}" stroke-width="3.8" stroke-linecap="round" />
        <path d="M168 68 Q176 80 168 86 Q160 80 168 68 Z" fill="#38bdf8" stroke="${p.ink}" stroke-width="2.5" />`;

    case 'SUPER_RAGE':
      return `
        <ellipse cx="${leftEyeX}" cy="${eyeY}" rx="10.5" ry="12" fill="#090d16" stroke="#facc15" stroke-width="2.5" />
        <ellipse cx="${rightEyeX}" cy="${eyeY}" rx="10.5" ry="12" fill="#090d16" stroke="#facc15" stroke-width="2.5" />
        <circle cx="${leftEyeX}" cy="${eyeY}" r="5.5" fill="#22d3ee" />
        <circle cx="${rightEyeX}" cy="${eyeY}" r="5.5" fill="#22d3ee" />
        <circle cx="${leftEyeX}" cy="${eyeY}" r="2.6" fill="#ffffff" />
        <circle cx="${rightEyeX}" cy="${eyeY}" r="2.6" fill="#ffffff" />
        <path d="M98 70 L124 81" fill="none" stroke="${p.ink}" stroke-width="5" stroke-linecap="round" />
        <path d="M158 70 L132 81" fill="none" stroke="${p.ink}" stroke-width="5" stroke-linecap="round" />
        ${nose}
        <path d="M114 108 Q128 124 142 108 Z" fill="#7f1d1d" stroke="${p.ink}" stroke-width="3.5" stroke-linejoin="round" />
        <path d="M117 109 L139 109 L138 113 L118 113 Z" fill="#ffffff" />
        <path d="M119 117 L137 117" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" />
        <path d="M77 88 L88 94 M179 88 L168 94" stroke="#facc15" stroke-width="3.5" stroke-linecap="round" />`;
  }
}

function buildHeadAccessories(
  uid: string,
  brawlerId: BrawlerId,
  skinId: SkinId,
  p: ISkinPalette
): string {
  const parts: string[] = [];

  if (brawlerId === 'TIMO') {
    parts.push(`
      <path d="M82 82 Q82 40 128 40 Q174 40 174 82 Q160 64 144 68 Q128 52 110 68 Q94 64 82 82 Z" fill="url(#${uid}_hairGrad)" stroke="${p.ink}" stroke-width="4.5" stroke-linejoin="round" />
      <polygon points="104,48 118,22 128,44 142,20 150,48 168,36 164,62 90,62 88,38" fill="url(#${uid}_hairGrad)" stroke="${p.ink}" stroke-width="4.5" stroke-linejoin="round" />`);
  } else if (brawlerId === 'LEO') {
    parts.push(`
      <path d="M78 102 Q74 36 128 32 Q182 36 178 102 Q168 72 152 60 Q128 50 104 60 Q88 72 78 102 Z" fill="url(#${uid}_secGrad)" stroke="${p.ink}" stroke-width="5" stroke-linejoin="round" />
      <path d="M98 58 L112 72 L126 56 L142 72 L156 58 Q128 48 98 58 Z" fill="url(#${uid}_hairGrad)" stroke="${p.ink}" stroke-width="3.5" stroke-linejoin="round" />
      <g data-part="leo-glasses">
        <circle cx="112" cy="92" r="14.5" fill="#bae6fd" fill-opacity="0.28" stroke="${p.trim}" stroke-width="4" />
        <circle cx="144" cy="92" r="14.5" fill="#bae6fd" fill-opacity="0.28" stroke="${p.trim}" stroke-width="4" />
        <line x1="126.5" y1="92" x2="129.5" y2="92" stroke="${p.trim}" stroke-width="4" />
      </g>`);
  } else if (brawlerId === 'MAYA') {
    parts.push(`
      <path d="M84 94 Q78 116 88 122" fill="none" stroke="${p.hair}" stroke-width="10" stroke-linecap="round" />
      <path d="M172 94 Q178 116 168 122" fill="none" stroke="${p.hair}" stroke-width="10" stroke-linecap="round" />
      <path d="M90 62 L98 36 Q128 28 158 36 L166 62 Z" fill="url(#${uid}_torsoGrad)" stroke="${p.ink}" stroke-width="4.5" stroke-linejoin="round" />
      <rect x="92" y="51" width="72" height="9" rx="3" fill="${p.secondary}" stroke="${p.ink}" stroke-width="3" />
      <rect x="120" y="49" width="16" height="13" rx="2.5" fill="${p.trim}" stroke="${p.ink}" stroke-width="2.5" />
      <ellipse cx="128" cy="64" rx="58" ry="12" fill="${p.primaryShade}" stroke="${p.ink}" stroke-width="4.5" />`);
  } else {
    // ZACK
    parts.push(`
      <path d="M84 78 Q90 36 128 38 Q166 36 172 78 Q154 60 128 64 Q102 60 84 78 Z" fill="url(#${uid}_hairGrad)" stroke="${p.ink}" stroke-width="4.5" stroke-linejoin="round" />
      <polygon points="104,48 116,24 128,42 146,24 152,50" fill="url(#${uid}_hairGrad)" stroke="${p.ink}" stroke-width="4" stroke-linejoin="round" />
      <path d="M80 86 Q82 32 128 32 Q174 32 176 86" fill="none" stroke="${p.ink}" stroke-width="11" stroke-linecap="round" />
      <path d="M80 86 Q82 32 128 32 Q174 32 176 86" fill="none" stroke="${p.accent}" stroke-width="4.5" stroke-linecap="round" />
      <rect x="70" y="76" width="16" height="28" rx="7" fill="#0f172a" stroke="${p.ink}" stroke-width="4" />
      <circle cx="78" cy="90" r="5" fill="${p.accentGlow}" />
      <rect x="170" y="76" width="16" height="28" rx="7" fill="#0f172a" stroke="${p.ink}" stroke-width="4" />
      <circle cx="178" cy="90" r="5" fill="${p.accentGlow}" />
      <path d="M78 102 Q88 114 106 112" fill="none" stroke="${p.ink}" stroke-width="3.5" stroke-linecap="round" />
      <circle cx="107" cy="112" r="3.5" fill="${p.accentGlow}" stroke="${p.ink}" stroke-width="2" />`);
  }

  if (skinId === 'DELEGUE_OR') {
    parts.push(`
      <g data-part="delegate-laurel">
        <path d="M98 44 Q86 34 88 24 Q98 28 104 38" fill="url(#${uid}_goldTrim)" stroke="${p.ink}" stroke-width="2.5" />
        <path d="M158 44 Q170 34 168 24 Q158 28 152 38" fill="url(#${uid}_goldTrim)" stroke="${p.ink}" stroke-width="2.5" />
        <polygon points="114,34 118,20 128,28 138,20 142,34" fill="url(#${uid}_goldTrim)" stroke="${p.ink}" stroke-width="3" stroke-linejoin="round" />
      </g>`);
  } else if (skinId === 'CYBER_6EME') {
    parts.push(`
      <g data-part="cyber-holo-visor">
        <path d="M92 82 L164 82 L159 102 L134 102 L128 96 L122 102 L97 102 Z" fill="url(#${uid}_visorGrad)" stroke="${p.accentGlow}" stroke-width="2.8" stroke-linejoin="round" />
        <line x1="99" y1="88" x2="118" y2="88" stroke="#ffffff" stroke-width="2" stroke-opacity="0.7" stroke-linecap="round" />
        <circle cx="90" cy="90" r="3.5" fill="${p.accent}" stroke="${p.ink}" stroke-width="2" />
        <circle cx="166" cy="90" r="3.5" fill="${p.accent}" stroke="${p.ink}" stroke-width="2" />
      </g>`);
  }

  return parts.join('');
}

function buildHeadLayer(
  uid: string,
  brawlerId: BrawlerId,
  skinId: SkinId,
  expression: BrawlerExpression,
  p: ISkinPalette,
  walk: IWalkOffsets
): string {
  const showEars = brawlerId === 'TIMO' || brawlerId === 'MAYA';
  const ears = showEars
    ? `<ellipse cx="82" cy="92" rx="7" ry="10" fill="url(#${uid}_skinGrad)" stroke="${p.ink}" stroke-width="4" />
       <ellipse cx="174" cy="92" rx="7" ry="10" fill="url(#${uid}_skinGrad)" stroke="${p.ink}" stroke-width="4" />`
    : '';

  return `
  <g data-layer="head" transform="translate(0 ${walk.bodyTranslateY.toFixed(2)})">
    ${ears}
    <ellipse cx="128" cy="88" rx="45" ry="43" fill="url(#${uid}_skinGrad)" stroke="${p.ink}" stroke-width="5" />
    <path d="M92 72 Q108 52 132 54" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="5" stroke-linecap="round" />
    <g data-part="face-expression">
      ${buildExpressionFaceMarkup(expression, p)}
    </g>
    ${buildHeadAccessories(uid, brawlerId, skinId, p)}
  </g>`;
}

function buildWeaponGraphic(
  uid: string,
  brawlerId: BrawlerId,
  skinId: SkinId,
  p: ISkinPalette
): string {
  const sleeveFill = brawlerId === 'ZACK' ? p.secondary : p.primary;
  const cyberAccent = skinId === 'CYBER_6EME';
  const goldAccent = skinId === 'DELEGUE_OR';

  const armAndHand = `
    <path d="M160 138 L178 148" fill="none" stroke="${p.ink}" stroke-width="22" stroke-linecap="round" />
    <path d="M160 138 L178 148" fill="none" stroke="${sleeveFill}" stroke-width="14" stroke-linecap="round" />
    <circle cx="182" cy="148" r="9.5" fill="url(#${uid}_skinGrad)" stroke="${p.ink}" stroke-width="4" />`;

  if (brawlerId === 'TIMO') {
    const coreFill = goldAccent ? `url(#${uid}_goldTrim)` : `url(#${uid}_weaponGrad)`;
    return `
      ${armAndHand}
      <g data-part="weapon-ball">
        <ellipse cx="204" cy="148" rx="22" ry="22" fill="${coreFill}" stroke="${p.ink}" stroke-width="4.5" />
        <polygon points="204,136 213,143 210,154 198,154 195,143" fill="${p.secondary}" stroke="${p.ink}" stroke-width="2.5" stroke-linejoin="round" />
        <ellipse cx="204" cy="148" rx="28" ry="11" transform="rotate(-24 204 148)" fill="none" stroke="${p.weaponGlow}" stroke-width="3.5" />
        ${
          cyberAccent
            ? `<circle cx="204" cy="148" r="16" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="5 4" />`
            : ''
        }
        <path d="M174 134 Q188 126 200 128" fill="none" stroke="${p.weaponGlow}" stroke-width="3" stroke-linecap="round" />
      </g>`;
  }

  if (brawlerId === 'LEO') {
    const flaskFill = goldAccent ? `url(#${uid}_goldTrim)` : `url(#${uid}_weaponGrad)`;
    return `
      ${armAndHand}
      <g data-part="weapon-ink-quill">
        <circle cx="200" cy="150" r="18" fill="#f3e8ff" fill-opacity="0.72" stroke="${p.ink}" stroke-width="4.5" />
        <path d="M185 152 Q200 144 215 152 A16 16 0 0 1 185 152 Z" fill="${flaskFill}" />
        <rect x="194" y="126" width="12" height="9" rx="2" fill="${p.trim}" stroke="${p.ink}" stroke-width="3" />
        <rect x="195" y="121" width="10" height="6" rx="2" fill="#b45309" stroke="${p.ink}" stroke-width="2.5" />
        <path d="M184 134 L228 118 Q222 132 204 139 Z" fill="${goldAccent ? '#fde047' : p.accentGlow}" stroke="${p.ink}" stroke-width="3" stroke-linejoin="round" />
        <ellipse cx="200" cy="150" rx="24" ry="8" transform="rotate(20 200 150)" fill="none" stroke="${p.weaponGlow}" stroke-width="2.8" />
      </g>`;
  }

  if (brawlerId === 'MAYA') {
    const rimStroke = goldAccent ? `url(#${uid}_goldTrim)` : p.trim;
    return `
      ${armAndHand}
      <g data-part="weapon-compass-shield">
        <polygon points="200,118 205,127 195,127" fill="${p.trim}" stroke="${p.ink}" stroke-width="2.5" />
        <polygon points="200,178 205,169 195,169" fill="${p.trim}" stroke="${p.ink}" stroke-width="2.5" />
        <polygon points="170,148 179,143 179,153" fill="${p.trim}" stroke="${p.ink}" stroke-width="2.5" />
        <polygon points="230,148 221,143 221,153" fill="${p.trim}" stroke="${p.ink}" stroke-width="2.5" />
        <circle cx="200" cy="148" r="23" fill="${p.weaponCore}" stroke="${p.ink}" stroke-width="5" />
        <circle cx="200" cy="148" r="20" fill="none" stroke="${rimStroke}" stroke-width="4" />
        <polygon points="200,132 204,148 200,152 196,148" fill="#ef4444" stroke="${p.ink}" stroke-width="1.8" />
        <polygon points="200,148 214,148 200,152" fill="#fef08a" stroke="${p.ink}" stroke-width="1.8" />
        <circle cx="200" cy="148" r="4" fill="#fde047" stroke="${p.ink}" stroke-width="2" />
        <path d="M234 136 Q242 148 234 160" fill="none" stroke="${p.weaponGlow}" stroke-width="3.2" stroke-linecap="round" />
      </g>`;
  }

  // ZACK: Double boombox/blaster sonore
  return `
    ${armAndHand}
    <g data-part="weapon-double-blaster">
      <rect x="180" y="135" width="32" height="26" rx="5" fill="${p.weaponCore}" stroke="${p.ink}" stroke-width="4" />
      <rect x="210" y="138" width="16" height="7" rx="2.5" fill="#0f172a" stroke="${p.ink}" stroke-width="3" />
      <rect x="210" y="151" width="16" height="7" rx="2.5" fill="#0f172a" stroke="${p.ink}" stroke-width="3" />
      <circle cx="195" cy="148" r="7.5" fill="#0f172a" stroke="${p.weaponGlow}" stroke-width="2.5" />
      <circle cx="195" cy="148" r="3" fill="${p.weaponGlow}" />
      <rect x="187" y="129" width="16" height="6" rx="2" fill="${p.weaponGlow}" stroke="${p.ink}" stroke-width="2.5" />
      <circle cx="227" cy="141.5" r="3.2" fill="${p.weaponGlow}" />
      <circle cx="227" cy="154.5" r="3.2" fill="${p.weaponGlow}" />
      <path d="M234 138 Q241 148 234 158" fill="none" stroke="${p.weaponGlow}" stroke-width="3" stroke-linecap="round" />
    </g>`;
}

function buildWeaponLayer(
  uid: string,
  brawlerId: BrawlerId,
  skinId: SkinId,
  p: ISkinPalette,
  angleRad: number
): string {
  const transform = computeWeaponTransform(angleRad, WEAPON_PIVOT_X, WEAPON_PIVOT_Y);
  return `
  <g data-layer="weapon" data-pivot-x="${WEAPON_PIVOT_X}" data-pivot-y="${WEAPON_PIVOT_Y}" transform="${transform}">
    ${buildWeaponGraphic(uid, brawlerId, skinId, p)}
  </g>`;
}

// ============================================================================
// API PUBLIQUE : MARKUP, RIG INTERACTIF & THUMBNAILS DATA-URL
// ============================================================================

export function generateBrawlerSvgMarkup(options: IBrawlerSvgOptions): string {
  const brawlerId = options.brawlerId;
  const skinId: SkinId = options.skinId ?? 'RENTREE';
  const expression: BrawlerExpression = options.expression ?? 'IDLE';
  const weaponAngleRad = options.weaponAngleRad ?? 0;
  const superCharged = options.superCharged ?? false;
  const walkPhaseRad = options.walkPhaseRad ?? 0;

  const skin = getSkinDefinition(brawlerId, skinId);
  const p = skin.palette;
  const uid = options.instanceId ?? `bsvg_${++svgInstanceSeq}`;
  const walk = computeWalkOffsets(walkPhaseRad);

  const widthAttr = options.width !== undefined ? ` width="${options.width}"` : '';
  const heightAttr = options.height !== undefined ? ` height="${options.height}"` : '';
  const classAttr = options.className ? ` class="${options.className}"` : '';

  return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}"${widthAttr}${heightAttr}${classAttr} data-brawler="${brawlerId}" data-skin="${skinId}" data-expression="${expression}">
  ${buildDefs(uid, p)}
  ${buildShadowLayer(walk)}
  ${buildAuraLayer(uid, p, superCharged)}
  ${buildBodyLayer(uid, brawlerId, skinId, p, walk)}
  ${buildHeadLayer(uid, brawlerId, skinId, expression, p, walk)}
  ${buildWeaponLayer(uid, brawlerId, skinId, p, weaponAngleRad)}
</svg>`;
}

export function createBrawlerSvgRig(options: IBrawlerSvgOptions): ISvgCharacterRig {
  if (typeof document === 'undefined') {
    throw new Error('createBrawlerSvgRig nécessite un environnement DOM (document).');
  }

  const skinId: SkinId = options.skinId ?? 'RENTREE';
  const skin = getSkinDefinition(options.brawlerId, skinId);
  const markup = generateBrawlerSvgMarkup(options);

  const parser = new DOMParser();
  const parsedDoc = parser.parseFromString(markup, 'image/svg+xml');
  const parsedRoot = parsedDoc.documentElement;
  const svg = document.importNode(parsedRoot, true) as unknown as ISvgCharacterRig;

  const shadowLayer = svg.querySelector<SVGGElement>('g[data-layer="shadow"]');
  const auraLayer = svg.querySelector<SVGGElement>('g[data-layer="fx-aura"]');
  const bodyLayer = svg.querySelector<SVGGElement>('g[data-layer="body"]');
  const headLayer = svg.querySelector<SVGGElement>('g[data-layer="head"]');
  const weaponLayer = svg.querySelector<SVGGElement>('g[data-layer="weapon"]');
  const faceGroup = svg.querySelector<SVGGElement>('g[data-part="face-expression"]');
  const leftLeg = svg.querySelector<SVGGElement>('g[data-part="leg-left"]');
  const rightLeg = svg.querySelector<SVGGElement>('g[data-part="leg-right"]');

  const replaceGroupInnerSvg = (target: SVGGElement | null, innerMarkup: string): void => {
    if (!target) {
      return;
    }
    const wrapperDoc = parser.parseFromString(
      `<svg xmlns="${SVG_NS}">${innerMarkup}</svg>`,
      'image/svg+xml'
    );
    while (target.firstChild) {
      target.removeChild(target.firstChild);
    }
    const children = Array.from(wrapperDoc.documentElement.childNodes);
    for (const child of children) {
      target.appendChild(document.importNode(child, true));
    }
  };

  Object.defineProperties(svg, {
    brawlerId: { value: options.brawlerId, enumerable: true },
    skinId: { value: skinId, enumerable: true },
    pivotX: { value: WEAPON_PIVOT_X, enumerable: true },
    pivotY: { value: WEAPON_PIVOT_Y, enumerable: true },
  });

  svg.setWeaponAngle = (rad: number): void => {
    if (weaponLayer) {
      weaponLayer.setAttribute('transform', computeWeaponTransform(rad, WEAPON_PIVOT_X, WEAPON_PIVOT_Y));
    }
  };

  svg.setExpression = (expr: BrawlerExpression): void => {
    svg.setAttribute('data-expression', expr);
    replaceGroupInnerSvg(faceGroup, buildExpressionFaceMarkup(expr, skin.palette));
  };

  svg.setSuperCharged = (active: boolean): void => {
    if (auraLayer) {
      auraLayer.setAttribute('data-super-active', active ? 'true' : 'false');
      auraLayer.setAttribute('opacity', active ? '1' : '0');
    }
  };

  svg.setWalkPhase = (phaseRad: number): void => {
    const walk = computeWalkOffsets(phaseRad);
    if (bodyLayer) {
      bodyLayer.setAttribute('transform', `translate(0 ${walk.bodyTranslateY.toFixed(2)})`);
    }
    if (headLayer) {
      headLayer.setAttribute('transform', `translate(0 ${walk.bodyTranslateY.toFixed(2)})`);
    }
    if (leftLeg) {
      leftLeg.setAttribute('transform', walk.leftLegTransform);
    }
    if (rightLeg) {
      rightLeg.setAttribute('transform', walk.rightLegTransform);
    }
    if (shadowLayer) {
      shadowLayer.setAttribute(
        'transform',
        `translate(128 228) scale(${walk.shadowScaleX.toFixed(3)} 1)`
      );
    }
  };

  return svg;
}

export function svgToDataUrl(svg: string | SVGSVGElement): string {
  const markup =
    typeof svg === 'string'
      ? svg
      : typeof XMLSerializer !== 'undefined'
      ? new XMLSerializer().serializeToString(svg)
      : svg.outerHTML;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

let cachedThumbnailMap: Record<BrawlerId, Record<SkinId, string>> | null = null;

export function preloadSkinThumbnailDataUrls(options?: {
  expression?: BrawlerExpression;
  superCharged?: boolean;
  width?: number;
  height?: number;
}): Record<BrawlerId, Record<SkinId, string>> {
  const hasCustomOptions =
    options !== undefined &&
    (options.expression !== undefined ||
      options.superCharged !== undefined ||
      options.width !== undefined ||
      options.height !== undefined);

  if (!hasCustomOptions && cachedThumbnailMap) {
    return cachedThumbnailMap;
  }

  const result = {} as Record<BrawlerId, Record<SkinId, string>>;
  for (const brawlerId of ALL_BRAWLER_IDS) {
    const perSkin = {} as Record<SkinId, string>;
    for (const skinId of ALL_SKIN_IDS) {
      const markup = generateBrawlerSvgMarkup({
        brawlerId,
        skinId,
        expression: options?.expression ?? 'IDLE',
        superCharged: options?.superCharged ?? false,
        width: options?.width ?? VIEWBOX_SIZE,
        height: options?.height ?? VIEWBOX_SIZE,
        instanceId: `thumb_${brawlerId}_${skinId}`,
      });
      perSkin[skinId] = svgToDataUrl(markup);
    }
    result[brawlerId] = perSkin;
  }

  if (!hasCustomOptions) {
    cachedThumbnailMap = result;
  }
  return result;
}
