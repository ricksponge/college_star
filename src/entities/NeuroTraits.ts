import type { BrawlerId } from '../types/cctp';

export type NeuroSuperpowerKind =
  | 'HYPER_LOGIQUE_ARBORESCENCE'
  | 'ENERGIE_CINETIQUE_TDAH'
  | 'VISION_SPATIALE_3D_DYS'
  | 'BOUCLIER_EMPATHIE_TSA';

export interface INeuroTraitProfile {
  brawlerId: BrawlerId;
  heroName: string;
  superpowerKind: NeuroSuperpowerKind;
  superpowerTitle: string;
  cognitiveBadge: string;
  icon: string;
  accentColor: string;
  loreSummary: string;
  strengthsInClass: [string, string, string];
  helpfulAccommodations: [string, string];
  inclusiveQuote: string;
}

export const BRAWLER_NEURO_TRAITS: Record<BrawlerId, INeuroTraitProfile> = {
  TIMO: {
    brawlerId: 'TIMO',
    heroName: 'Timo',
    superpowerKind: 'HYPER_LOGIQUE_ARBORESCENCE',
    superpowerTitle: 'Hyper-Logique en Arborescence',
    cognitiveBadge: 'Pensée en Réseau',
    icon: '🧠',
    accentColor: '#facc15',
    loreSummary:
      'Timo relie dix idées en une fraction de seconde : quand une question s’affiche, son cerveau trace un arbre de solutions lumineux à travers le terrain.',
    strengthsInClass: [
      'Repère immédiatement les motifs logiques et les régularités cachées.',
      'Anticipe les trajectoires de jeu et résout les problèmes sous plusieurs angles.',
      'Adore expliquer ses astuces visuelles à ses coéquipiers.',
    ],
    helpfulAccommodations: [
      'Avoir un brouillon ou une carte mentale pour poser ses idées rapides.',
      'Connaître le programme de la séance à l’avance pour rester serein.',
    ],
    inclusiveQuote: '« Penser en arborescence, c’est voir tous les chemins vers la solution ! »',
  },
  LEO: {
    brawlerId: 'LEO',
    heroName: 'Léo',
    superpowerKind: 'ENERGIE_CINETIQUE_TDAH',
    superpowerTitle: 'Énergie Cinétique TDAH',
    cognitiveBadge: 'Créativité Turbo',
    icon: '⚡',
    accentColor: '#c084fc',
    loreSummary:
      'L’esprit de Léo fuse à 100 à l’heure ! Canaliser son énergie cinétique lui donne une créativité fulgurante pour inventer des images mémorables et défendre ses amis.',
    strengthsInClass: [
      'Enthousiasme communicatif qui motive toute l’équipe.',
      'Hyper-focus impressionnant dès qu’un défi l’intéresse vraiment.',
      'Trouve des idées originales auxquelles personne n’avait pensé.',
    ],
    helpfulAccommodations: [
      'Consignes courtes étape par étape et mots-clés en couleur.',
      'Micro-pauses actives ou outil discret d’assise/antistress (PAP).',
    ],
    inclusiveQuote: '« Mon énergie n’est pas un défaut : c’est mon moteur pour aider les autres ! »',
  },
  MAYA: {
    brawlerId: 'MAYA',
    heroName: 'Maya',
    superpowerKind: 'VISION_SPATIALE_3D_DYS',
    superpowerTitle: 'Vision Spatiale 3D Dys',
    cognitiveBadge: 'Architecte Visuelle',
    icon: '🧭',
    accentColor: '#4ade80',
    loreSummary:
      'Maya lit parfois les lignes plus lentement, mais son cerveau visualise les volumes et les cartes du collège en 3D haute définition pour guider toute l’escouade.',
    strengthsInClass: [
      'Orientation spatiale exceptionnelle dans les couloirs et en géométrie 3D.',
      'Grande capacité de compréhension globale par schémas et cartes.',
      'Mémoire auditive fine lorsque les consignes sont lues à voix haute.',
    ],
    helpfulAccommodations: [
      'Police aérée, interlignage augmenté et synthèse vocale hors-ligne.',
      'Temps adapté (tiers-temps / gel de 3 secondes) pour lire sans pression.',
    ],
    inclusiveQuote: '« Lire différemment m’a appris à voir le monde en 3 dimensions ! »',
  },
  ZACK: {
    brawlerId: 'ZACK',
    heroName: 'Zack',
    superpowerKind: 'BOUCLIER_EMPATHIE_TSA',
    superpowerTitle: 'Bouclier d’Empathie',
    cognitiveBadge: 'Capteur Sensoriel Fin',
    icon: '🎧',
    accentColor: '#22d3ee',
    loreSummary:
      'Avec son casque protecteur qui filtre le brouhaha de la cour, Zack perçoit aussitôt quand un camarade se sent seul ou triste et déploie son Bouclier d’Empathie.',
    strengthsInClass: [
      'Sens aigu de la justice et fidélité totale envers ses amis.',
      'Précision remarquable sur les détails et les règles justes.',
      'Capacité à calmer le groupe en repérant vite les signaux de surcharge.',
    ],
    helpfulAccommodations: [
      'Casque anti-bruit ou mode Confort Sensoriel sans flashs ni secousses.',
      'Accès libre au Coin Calme si la cour devient trop bruyante.',
    ],
    inclusiveQuote: '« Protéger sa sensibilité permet d’écouter les autres avec encore plus de cœur ! »',
  },
};

export function getNeuroTraitProfile(brawlerId: BrawlerId): INeuroTraitProfile {
  return BRAWLER_NEURO_TRAITS[brawlerId];
}

export function getAllNeuroTraitProfiles(): INeuroTraitProfile[] {
  return [
    BRAWLER_NEURO_TRAITS.TIMO,
    BRAWLER_NEURO_TRAITS.LEO,
    BRAWLER_NEURO_TRAITS.MAYA,
    BRAWLER_NEURO_TRAITS.ZACK,
  ];
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderNeuroProfileCardHtml(brawlerId: BrawlerId): string {
  const trait = getNeuroTraitProfile(brawlerId);
  const strengthsHtml = trait.strengthsInClass
    .map((s) => `<li style="margin-bottom:4px;">✨ ${escapeHtml(s)}</li>`)
    .join('');
  const accommodationsHtml = trait.helpfulAccommodations
    .map((a) => `<li style="margin-bottom:4px;">🧩 ${escapeHtml(a)}</li>`)
    .join('');

  return `
    <article data-neuro-card="${trait.brawlerId}" style="
      background:linear-gradient(155deg,#0f172a,#1e293b);
      border:2px solid ${trait.accentColor};border-radius:18px;padding:16px;color:#f8fafc;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <span style="font-size:32px;">${trait.icon}</span>
        <div>
          <div style="font-size:11px;font-weight:900;color:${trait.accentColor};text-transform:uppercase;">
            ${escapeHtml(trait.cognitiveBadge)}
          </div>
          <div style="font-size:17px;font-weight:900;">
            ${escapeHtml(trait.heroName)} — ${escapeHtml(trait.superpowerTitle)}
          </div>
        </div>
      </div>
      <p style="font-size:13px;line-height:1.5;color:#cbd5e1;margin:0 0 10px 0;">
        ${escapeHtml(trait.loreSummary)}
      </p>
      <div style="font-size:12px;font-weight:800;color:${trait.accentColor};margin-bottom:4px;">Super-pouvoirs en classe :</div>
      <ul style="margin:0 0 10px 0;padding-left:16px;font-size:12px;color:#e2e8f0;list-style:none;">
        ${strengthsHtml}
      </ul>
      <div style="font-size:12px;font-weight:800;color:#38bdf8;margin-bottom:4px;">Aménagements bienveillants :</div>
      <ul style="margin:0 0 10px 0;padding-left:16px;font-size:12px;color:#cbd5e1;list-style:none;">
        ${accommodationsHtml}
      </ul>
      <div style="font-size:12px;font-style:italic;color:#fde047;border-top:1px solid rgba(255,255,255,0.12);padding-top:8px;">
        ${escapeHtml(trait.inclusiveQuote)}
      </div>
    </article>
  `;
}
