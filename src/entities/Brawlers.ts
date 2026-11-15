import type { BrawlerId, IBrawler } from '../types/cctp';

/**
 * Roster Initial complet (« Les Élèves-Héros ») — Stats Niveau 1 issues du CCTP-BC6E-2026-V2.
 */
export const BRAWLERS_ROSTER: Record<BrawlerId, IBrawler> = {
  TIMO: {
    id: 'TIMO',
    name: 'Timo',
    title: 'Le Stratège du Stade',
    archetype: "Tireur d'Élite / Mobile",
    favorite_subject: 'mathematiques',
    visual_description:
      'Garçon de 10 ans, cheveux blonds ondulés, maillot de foot jaune fluo et baskets assorties.',
    base_hp: 3200,
    speed_tier: 'RAPIDE',
    speed_value: 770,
    max_ammo_bars: 3,
    basic_attack: {
      name: 'Frappe Brossée',
      description: "Ballon d'énergie rapide à longue portée.",
      base_damage: 950,
      projectiles_count: 1,
      range: 540,
    },
    super_ability: {
      name: 'Tacle Pythagore',
      description:
        "Sprint fulgurant qui traverse l'arène, repousse les ennemis et valide instantanément la bonne cible touchée.",
      bonus_objective_points: 2,
      duration_sec: 1.5,
    },
    gadget: {
      name: 'Vision de Jeu',
      description: "Analyse le terrain et entoure la bonne réponse d'un halo doré pendant 4s.",
      charges_per_match: 3,
      duration_sec: 4,
    },
  },
  LEO: {
    id: 'LEO',
    name: 'Léo',
    title: "L'Alchimiste des Mots",
    archetype: 'Artilleur de Zone',
    favorite_subject: 'francais',
    visual_description:
      'Sweat à capuche bleu nuit, lunettes rondes, sacoche de grimoires lumineux.',
    base_hp: 2800,
    speed_tier: 'NORMALE',
    speed_value: 720,
    max_ammo_bars: 3,
    basic_attack: {
      name: "Fiole d'Encre",
      description: 'Tir en cloche par-dessus les murs créant une flaque de dégâts.',
      base_damage: 880,
      projectiles_count: 1,
      range: 500,
    },
    super_ability: {
      name: 'Le Grand Robert',
      description:
        'Invoque une tourelle-dictionnaire qui tire des rayons correcteurs et soigne les alliés de 400 PV/s.',
      bonus_objective_points: 2,
      effect_value: 400,
      duration_sec: 6,
    },
    gadget: {
      name: 'Brouillon Propre',
      description: "Efface une mauvaise cible de l'arène.",
      charges_per_match: 3,
      duration_sec: 1,
    },
  },
  MAYA: {
    id: 'MAYA',
    name: 'Maya',
    title: 'La Gardienne du Temps',
    archetype: 'Tank / Contrôle',
    favorite_subject: 'histoire_geo_sciences',
    visual_description:
      "Veste d'exploratrice kaki, boussole géante-bouclier au bras, bottes renforcées.",
    base_hp: 5200,
    speed_tier: 'NORMALE',
    speed_value: 720,
    max_ammo_bars: 3,
    basic_attack: {
      name: 'Onde Sismique',
      description: 'Cône large à courte portée.',
      base_damage: 1100,
      projectiles_count: 1,
      range: 340,
    },
    super_ability: {
      name: 'Rempart Chronologique',
      description:
        'Érige un bouclier temporel absorbant 6000 dégâts et figeant les ennemis proches pendant 2,5s.',
      bonus_objective_points: 2,
      effect_value: 6000,
      duration_sec: 2.5,
    },
    gadget: {
      name: 'Boussole du CDI',
      description: 'Indique par une flèche au sol la salle ou la cible exacte.',
      charges_per_match: 3,
      duration_sec: 4,
    },
  },
  ZACK: {
    id: 'ZACK',
    name: 'Zack',
    title: 'Le Geek Bilingue',
    archetype: 'Assassin Furtif',
    favorite_subject: 'anglais',
    visual_description: 'Casque audio néon cyan, veste teddy bicolore, rollers magnétiques.',
    base_hp: 3000,
    speed_tier: 'TRES_RAPIDE',
    speed_value: 820,
    max_ammo_bars: 3,
    basic_attack: {
      name: 'Double Beat',
      description: 'Deux salves sonores ultra-rapides en ligne droite (2 × 520 dégâts).',
      base_damage: 520,
      projectiles_count: 2,
      range: 460,
    },
    super_ability: {
      name: 'Teleport-Bus',
      description:
        "Se téléporte instantanément sur l'emplacement de la bonne réponse avec un bouclier de 1500 PV.",
      bonus_objective_points: 2,
      effect_value: 1500,
      duration_sec: 3,
    },
    gadget: {
      name: 'Pause Récré',
      description: "Ralentit tous les ennemis de l'arène de 50% pendant 3,5s.",
      charges_per_match: 3,
      duration_sec: 3.5,
    },
  },
};

export function getBrawlerById(id: BrawlerId): IBrawler {
  return BRAWLERS_ROSTER[id];
}

export function getAllBrawlers(): IBrawler[] {
  return [
    BRAWLERS_ROSTER.TIMO,
    BRAWLERS_ROSTER.LEO,
    BRAWLERS_ROSTER.MAYA,
    BRAWLERS_ROSTER.ZACK,
  ];
}
