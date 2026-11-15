import type { CampusRoomId, ICampusNpc, ICampusRoomZone } from '../types/cctp';
import type { IRenderObstacle } from '../engine/IsometricRenderer';

export const CAMPUS_WIDTH = 2400;
export const CAMPUS_HEIGHT = 1800;
export const CAMPUS_SPAWN_POINT: { x: number; y: number } = { x: 1030, y: 1500 };

export interface ICampusBadgeSpawn {
  id: string;
  room_id: CampusRoomId;
  x: number;
  y: number;
  label: string;
}

/**
 * Les 10 zones du Collège disposées en 3 rangées (Nord, Centrale, Sud)
 * sans chevauchement, séparées par de larges couloirs de circulation.
 */
export const CAMPUS_ROOMS: ICampusRoomZone[] = [
  // Rangée Nord (y: 60, height: 480)
  {
    id: 'SALLE_201_ANGLAIS',
    name: 'Salle 201 — Anglais',
    floor_label: '2e étage',
    subject: 'anglais',
    bounds: { x: 80, y: 60, width: 640, height: 480 },
    floor_color: '#132a3e',
    accent_color: '#22d3ee',
    description:
      "Salle d'Anglais LV1 au 2e étage : vocabulaire du quotidien, verbes et dialogues.",
  },
  {
    id: 'CDI_BIBLIOTHEque',
    name: 'CDI & Bibliothèque',
    floor_label: '1er étage',
    subject: 'histoire_geo_sciences',
    bounds: { x: 840, y: 60, width: 720, height: 480 },
    floor_color: '#2a231c',
    accent_color: '#f59e0b',
    description:
      "Centre de Documentation et d'Information : recherches, lectures et culture générale.",
  },
  {
    id: 'SALLE_204_SCIENCES',
    name: 'Salle 204 — Sciences & H-G',
    floor_label: '2e étage',
    subject: 'histoire_geo_sciences',
    bounds: { x: 1680, y: 60, width: 640, height: 480 },
    floor_color: '#16302b',
    accent_color: '#34d399',
    description:
      'Laboratoire de Sciences, Histoire-Géo et EMC situé au 2e étage (porte 04).',
  },

  // Rangée Centrale (y: 640, height: 500)
  {
    id: 'SALLE_101_MATHS',
    name: 'Salle 101 — Maths',
    floor_label: '1er étage',
    subject: 'mathematiques',
    bounds: { x: 80, y: 640, width: 640, height: 500 },
    floor_color: '#172554',
    accent_color: '#facc15',
    description:
      'Salle de Mathématiques au 1er étage : calcul mental, fractions, géométrie et logique.',
  },
  {
    id: 'HALL_CASIERS',
    name: 'Hall des Casiers',
    floor_label: 'RDC',
    subject: 'vie_au_college',
    bounds: { x: 840, y: 640, width: 720, height: 500 },
    floor_color: '#1e293b',
    accent_color: '#38bdf8',
    description:
      "Grand hall du rez-de-chaussée abritant les casiers et la borne d'emploi du temps.",
  },
  {
    id: 'SALLE_102_FRANCAIS',
    name: 'Salle 102 — Français',
    floor_label: '1er étage',
    subject: 'francais',
    bounds: { x: 1680, y: 640, width: 640, height: 500 },
    floor_color: '#311b3f',
    accent_color: '#c084fc',
    description:
      'Salle de Français au 1er étage : orthographe, conjugaison, accords et grammaire.',
  },

  // Rangée Sud (y: 1240, height: 480)
  {
    id: 'VIE_SCOLAIRE_CPE',
    name: 'Vie Scolaire (CPE)',
    floor_label: 'RDC',
    subject: 'vie_au_college',
    bounds: { x: 80, y: 1240, width: 540, height: 480 },
    floor_color: '#272038',
    accent_color: '#a855f7',
    description:
      'Bureau de M. Toure (CPE) : gestion des retards, carnets de liaison et sorties.',
  },
  {
    id: 'COUR_HONNEUR',
    name: "Cour d'Honneur",
    floor_label: 'RDC Extérieur',
    bounds: { x: 700, y: 1240, width: 660, height: 480 },
    floor_color: '#1f3a2e',
    accent_color: '#22c55e',
    description:
      'Cour centrale du collège où se retrouvent les élèves avant de rejoindre leurs salles.',
  },
  {
    id: 'CANTINE_SELF',
    name: 'Cantine & Self',
    floor_label: 'RDC',
    subject: 'vie_au_college',
    bounds: { x: 1440, y: 1240, width: 420, height: 480 },
    floor_color: '#332218',
    accent_color: '#fb923c',
    description:
      'Réfectoire du collège où recharger ses batteries et récupérer des badges de pause.',
  },
  {
    id: 'GYMNASE_SPORTS',
    name: 'Gymnase & Sports',
    floor_label: 'RDC Gymnase',
    subject: 'mathematiques',
    bounds: { x: 1920, y: 1240, width: 400, height: 480 },
    floor_color: '#2c1e24',
    accent_color: '#f43f5e',
    description:
      "Halle sportive du collège pour les épreuves d'endurance, mesures et défis d'équipe.",
  },
];

/**
 * Obstacles, cloisons avec larges ouvertures (>= 180 unités), mobilier et zones portails.
 */
export const CAMPUS_OBSTACLES: IRenderObstacle[] = [
  // --- SALLE_201_ANGLAIS (80..720, 60..540) ---
  { x: 80, y: 60, width: 640, height: 24, kind: 'wall' },
  { x: 80, y: 84, width: 24, height: 432, kind: 'wall' },
  { x: 696, y: 84, width: 24, height: 126, kind: 'wall' },
  { x: 696, y: 390, width: 24, height: 126, kind: 'wall' },
  { x: 80, y: 516, width: 220, height: 24, kind: 'wall' },
  { x: 500, y: 516, width: 220, height: 24, kind: 'wall' },
  { x: 165, y: 165, width: 96, height: 44, kind: 'desk' },
  { x: 165, y: 395, width: 96, height: 44, kind: 'desk' },
  { x: 540, y: 405, width: 96, height: 44, kind: 'desk' },
  { x: 545, y: 125, width: 110, height: 65, kind: 'safe_zone', label: 'ARENE ANGLAIS' },

  // --- CDI_BIBLIOTHEque (840..1560, 60..540) ---
  { x: 840, y: 60, width: 720, height: 24, kind: 'wall' },
  { x: 840, y: 84, width: 24, height: 126, kind: 'wall' },
  { x: 840, y: 390, width: 24, height: 126, kind: 'wall' },
  { x: 1536, y: 84, width: 24, height: 126, kind: 'wall' },
  { x: 1536, y: 390, width: 24, height: 126, kind: 'wall' },
  { x: 840, y: 516, width: 240, height: 24, kind: 'wall' },
  { x: 1320, y: 516, width: 240, height: 24, kind: 'wall' },
  { x: 930, y: 145, width: 110, height: 44, kind: 'desk', label: 'RAYONS CDI' },
  { x: 930, y: 400, width: 110, height: 44, kind: 'desk' },
  { x: 1360, y: 400, width: 110, height: 44, kind: 'desk' },
  { x: 1360, y: 125, width: 120, height: 65, kind: 'safe_zone', label: 'PORTAIL CDI' },

  // --- SALLE_204_SCIENCES (1680..2320, 60..540) ---
  { x: 1680, y: 60, width: 640, height: 24, kind: 'wall' },
  { x: 2296, y: 84, width: 24, height: 432, kind: 'wall' },
  { x: 1680, y: 84, width: 24, height: 126, kind: 'wall' },
  { x: 1680, y: 390, width: 24, height: 126, kind: 'wall' },
  { x: 1680, y: 516, width: 220, height: 24, kind: 'wall' },
  { x: 2100, y: 516, width: 220, height: 24, kind: 'wall' },
  { x: 1765, y: 165, width: 100, height: 44, kind: 'desk', label: 'LABO 204' },
  { x: 1765, y: 400, width: 100, height: 44, kind: 'desk' },
  { x: 2135, y: 400, width: 100, height: 44, kind: 'desk' },
  { x: 2135, y: 125, width: 115, height: 65, kind: 'safe_zone', label: 'PORTAIL 204' },

  // --- SALLE_101_MATHS (80..720, 640..1140) ---
  { x: 80, y: 640, width: 220, height: 24, kind: 'wall' },
  { x: 500, y: 640, width: 220, height: 24, kind: 'wall' },
  { x: 80, y: 1116, width: 220, height: 24, kind: 'wall' },
  { x: 500, y: 1116, width: 220, height: 24, kind: 'wall' },
  { x: 80, y: 664, width: 24, height: 452, kind: 'wall' },
  { x: 696, y: 664, width: 24, height: 136, kind: 'wall' },
  { x: 696, y: 980, width: 24, height: 136, kind: 'wall' },
  { x: 165, y: 760, width: 96, height: 44, kind: 'desk' },
  { x: 165, y: 990, width: 96, height: 44, kind: 'desk' },
  { x: 540, y: 995, width: 96, height: 44, kind: 'desk' },
  { x: 545, y: 715, width: 110, height: 65, kind: 'safe_zone', label: 'ARENE MATHS' },

  // --- HALL_CASIERS (840..1560, 640..1140) ---
  { x: 840, y: 640, width: 240, height: 24, kind: 'wall' },
  { x: 1320, y: 640, width: 240, height: 24, kind: 'wall' },
  { x: 840, y: 1116, width: 240, height: 24, kind: 'wall' },
  { x: 1320, y: 1116, width: 240, height: 24, kind: 'wall' },
  { x: 840, y: 664, width: 24, height: 136, kind: 'wall' },
  { x: 840, y: 980, width: 24, height: 136, kind: 'wall' },
  { x: 1536, y: 664, width: 24, height: 136, kind: 'wall' },
  { x: 1536, y: 980, width: 24, height: 136, kind: 'wall' },
  { x: 905, y: 710, width: 130, height: 38, kind: 'wall', label: 'CASIERS' },
  { x: 1365, y: 710, width: 130, height: 38, kind: 'wall', label: 'CASIERS' },
  { x: 905, y: 1020, width: 130, height: 38, kind: 'wall', label: 'CASIERS' },
  { x: 1365, y: 1020, width: 130, height: 38, kind: 'wall', label: 'CASIERS' },
  { x: 1140, y: 765, width: 120, height: 65, kind: 'safe_zone', label: 'BORNE EDT' },

  // --- SALLE_102_FRANCAIS (1680..2320, 640..1140) ---
  { x: 1680, y: 640, width: 220, height: 24, kind: 'wall' },
  { x: 2100, y: 640, width: 220, height: 24, kind: 'wall' },
  { x: 1680, y: 1116, width: 220, height: 24, kind: 'wall' },
  { x: 2100, y: 1116, width: 220, height: 24, kind: 'wall' },
  { x: 2296, y: 664, width: 24, height: 452, kind: 'wall' },
  { x: 1680, y: 664, width: 24, height: 136, kind: 'wall' },
  { x: 1680, y: 980, width: 24, height: 136, kind: 'wall' },
  { x: 1765, y: 760, width: 96, height: 44, kind: 'desk' },
  { x: 1765, y: 990, width: 96, height: 44, kind: 'desk' },
  { x: 2135, y: 995, width: 96, height: 44, kind: 'desk' },
  { x: 2135, y: 715, width: 115, height: 65, kind: 'safe_zone', label: 'ARENE ACCORDS' },

  // --- VIE_SCOLAIRE_CPE (80..620, 1240..1720) ---
  { x: 80, y: 1240, width: 180, height: 24, kind: 'wall' },
  { x: 440, y: 1240, width: 180, height: 24, kind: 'wall' },
  { x: 80, y: 1696, width: 540, height: 24, kind: 'wall' },
  { x: 80, y: 1264, width: 24, height: 432, kind: 'wall' },
  { x: 596, y: 1264, width: 24, height: 126, kind: 'wall' },
  { x: 596, y: 1570, width: 24, height: 126, kind: 'wall' },
  { x: 155, y: 1350, width: 100, height: 44, kind: 'desk', label: 'BUREAU CPE' },
  { x: 155, y: 1580, width: 100, height: 44, kind: 'desk' },
  { x: 430, y: 1575, width: 120, height: 65, kind: 'safe_zone', label: 'PORTAIL CPE' },

  // --- COUR_HONNEUR (700..1360, 1240..1720) ---
  { x: 740, y: 1280, width: 70, height: 50, kind: 'bush' },
  { x: 1250, y: 1280, width: 70, height: 50, kind: 'bush' },
  { x: 740, y: 1630, width: 70, height: 50, kind: 'bush' },
  { x: 1250, y: 1630, width: 70, height: 50, kind: 'bush' },
  { x: 845, y: 1350, width: 115, height: 65, kind: 'safe_zone', label: 'PORTAIL ARENE' },

  // --- CANTINE_SELF (1440..1860, 1240..1720) ---
  { x: 1440, y: 1240, width: 120, height: 24, kind: 'wall' },
  { x: 1740, y: 1240, width: 120, height: 24, kind: 'wall' },
  { x: 1440, y: 1696, width: 420, height: 24, kind: 'wall' },
  { x: 1440, y: 1264, width: 24, height: 126, kind: 'wall' },
  { x: 1440, y: 1570, width: 24, height: 126, kind: 'wall' },
  { x: 1836, y: 1264, width: 24, height: 126, kind: 'wall' },
  { x: 1836, y: 1570, width: 24, height: 126, kind: 'wall' },
  { x: 1515, y: 1340, width: 90, height: 42, kind: 'desk', label: 'SELF' },
  { x: 1695, y: 1600, width: 90, height: 42, kind: 'desk' },

  // --- GYMNASE_SPORTS (1920..2320, 1240..1720) ---
  { x: 1920, y: 1240, width: 110, height: 24, kind: 'wall' },
  { x: 2210, y: 1240, width: 110, height: 24, kind: 'wall' },
  { x: 1920, y: 1696, width: 400, height: 24, kind: 'wall' },
  { x: 2296, y: 1264, width: 24, height: 432, kind: 'wall' },
  { x: 1920, y: 1264, width: 24, height: 126, kind: 'wall' },
  { x: 1920, y: 1570, width: 24, height: 126, kind: 'wall' },
  { x: 2210, y: 1300, width: 65, height: 34, kind: 'desk' },
  { x: 2050, y: 1580, width: 140, height: 65, kind: 'safe_zone', label: 'TERRAIN GYM' },
];

/**
 * Les 9 PNJ et bornes interactives répartis dans les salles du collège.
 */
export const CAMPUS_NPCS: ICampusNpc[] = [
  {
    id: 'NPC_DELEGUE',
    name: 'Inès',
    title: 'Déléguée 6e',
    role: 'DELEGUE_ELEVE',
    room_id: 'COUR_HONNEUR',
    x: 1030,
    y: 1380,
    interaction_radius: 95,
    primary_color: '#22c55e',
    accent_color: '#facc15',
    greeting_flash:
      "Salut ! Bienvenue au collège, explore le Hall et viens relever les défis d'arène !",
    linked_arena_mode: 'CHASSE_AUX_BONNES_NOTES',
  },
  {
    id: 'NPC_PANNEAU_EDT',
    name: 'Borne Emploi du Temps',
    title: 'Borne Interactive Semaine A/B',
    role: 'PANNEAU_EDT',
    room_id: 'HALL_CASIERS',
    x: 1200,
    y: 820,
    interaction_radius: 95,
    primary_color: '#38bdf8',
    accent_color: '#0284c7',
    greeting_flash:
      'Emploi du temps actif : Semaine B — Salle 204 au 2e étage, porte 04 !',
  },
  {
    id: 'NPC_CPE',
    name: 'M. Toure',
    title: 'Conseiller Principal d’Éducation (CPE)',
    role: 'CPE',
    room_id: 'VIE_SCOLAIRE_CPE',
    x: 340,
    y: 1410,
    interaction_radius: 95,
    primary_color: '#a855f7',
    accent_color: '#e9d5ff',
    greeting_flash:
      'Carnet de liaison prêt ? Prouve que tu maîtrises les changements de salle !',
    linked_arena_mode: 'CHANGEMENT_DE_SALLE',
  },
  {
    id: 'NPC_PROF_MATHS',
    name: 'Mme Thalès',
    title: 'Professeure de Mathématiques',
    role: 'PROF_MATHS',
    room_id: 'SALLE_101_MATHS',
    x: 400,
    y: 760,
    interaction_radius: 95,
    primary_color: '#eab308',
    accent_color: '#2563eb',
    greeting_flash:
      'Tables, fractions et géométrie : prêt pour une Chasse aux Bonnes Notes ?',
    linked_arena_mode: 'CHASSE_AUX_BONNES_NOTES',
  },
  {
    id: 'NPC_PROF_FRANCAIS',
    name: 'M. Voltaire',
    title: 'Professeur de Français',
    role: 'PROF_FRANCAIS',
    room_id: 'SALLE_102_FRANCAIS',
    x: 2000,
    y: 760,
    interaction_radius: 95,
    primary_color: '#7c3aed',
    accent_color: '#f472b6',
    greeting_flash:
      'Attention aux homophones et aux accords : entre sur le terrain du Match des Accords !',
    linked_arena_mode: 'MATCH_DES_ACCORDS',
  },
  {
    id: 'NPC_DOC_CDI',
    name: 'Mme Page',
    title: 'Documentaliste du CDI',
    role: 'DOCUMENTALISTE_CDI',
    room_id: 'CDI_BIBLIOTHEque',
    x: 1200,
    y: 170,
    interaction_radius: 95,
    primary_color: '#f59e0b',
    accent_color: '#fef3c7',
    greeting_flash:
      'Au CDI, chaque énigme résolue te prépare pour le grand Conseil de Classe !',
    linked_arena_mode: 'CONSEIL_DE_CLASSE',
  },
  {
    id: 'NPC_PROF_ANGLAIS',
    name: 'Mr. Sherlock',
    title: 'Professeur d’Anglais LV1',
    role: 'PROF_ANGLAIS',
    room_id: 'SALLE_201_ANGLAIS',
    x: 400,
    y: 170,
    interaction_radius: 95,
    primary_color: '#06b6d4',
    accent_color: '#ef4444',
    greeting_flash: 'Hello challenger! Ready for an Interro Surprise in English?',
    linked_arena_mode: 'INTERRO_SURPRISE',
  },
  {
    id: 'NPC_PROF_SCIENCES',
    name: 'Dr. Darwin',
    title: 'Professeur de Sciences & Histoire-Géo',
    role: 'PROF_SCIENCES',
    room_id: 'SALLE_204_SCIENCES',
    x: 2000,
    y: 170,
    interaction_radius: 95,
    primary_color: '#10b981',
    accent_color: '#a7f3d0',
    greeting_flash:
      'Bienvenue en Salle 204 ! Affronte le Boss du Conseil de Classe pour décrocher le diplôme !',
    linked_arena_mode: 'CONSEIL_DE_CLASSE',
  },
  {
    id: 'NPC_COACH_GYM',
    name: 'Coach Penalty',
    title: 'Professeur d’EPS',
    role: 'COACH_GYM',
    room_id: 'GYMNASE_SPORTS',
    x: 2120,
    y: 1410,
    interaction_radius: 95,
    primary_color: '#f43f5e',
    accent_color: '#facc15',
    greeting_flash:
      'Échauffement terminé ! Fonce marquer dans les bonnes cages au Match des Accords !',
    linked_arena_mode: 'MATCH_DES_ACCORDS',
  },
];

/**
 * Points d'apparition des badges collectables dans le collège.
 */
export const CAMPUS_BADGE_SPAWNS: ICampusBadgeSpawn[] = [
  // 3 badges dans CANTINE_SELF (Q_08_PAUSE_CANTINE)
  {
    id: 'BADGE_CANTINE_1',
    room_id: 'CANTINE_SELF',
    x: 1650,
    y: 1370,
    label: 'Plateau Équilibré',
  },
  {
    id: 'BADGE_CANTINE_2',
    room_id: 'CANTINE_SELF',
    x: 1545,
    y: 1595,
    label: 'Ticket Self',
  },
  {
    id: 'BADGE_CANTINE_3',
    room_id: 'CANTINE_SELF',
    x: 1745,
    y: 1475,
    label: 'Carafe Fraîche',
  },

  // 3 badges dans HALL_CASIERS (Q_11_INSPECTEUR_COLLEGE)
  {
    id: 'BADGE_HALL_1',
    room_id: 'HALL_CASIERS',
    x: 970,
    y: 890,
    label: 'Cadenas 6e',
  },
  {
    id: 'BADGE_HALL_2',
    room_id: 'HALL_CASIERS',
    x: 1430,
    y: 890,
    label: 'Règle Graduée',
  },
  {
    id: 'BADGE_HALL_3',
    room_id: 'HALL_CASIERS',
    x: 1200,
    y: 1020,
    label: 'Carnet de Liaison',
  },

  // Badges bonus dans COUR_HONNEUR, CDI_BIBLIOTHEque, SALLE_204_SCIENCES
  {
    id: 'BADGE_COUR_1',
    room_id: 'COUR_HONNEUR',
    x: 870,
    y: 1540,
    label: 'Étoile de Récré',
  },
  {
    id: 'BADGE_COUR_2',
    room_id: 'COUR_HONNEUR',
    x: 1190,
    y: 1540,
    label: 'Boussole 6e',
  },
  {
    id: 'BADGE_CDI_1',
    room_id: 'CDI_BIBLIOTHEque',
    x: 1060,
    y: 290,
    label: "Marque-Page d'Or",
  },
  {
    id: 'BADGE_CDI_2',
    room_id: 'CDI_BIBLIOTHEque',
    x: 1340,
    y: 290,
    label: 'Dictionnaire Pocket',
  },
  {
    id: 'BADGE_204_1',
    room_id: 'SALLE_204_SCIENCES',
    x: 1880,
    y: 290,
    label: 'Loupe de Darwin',
  },
  {
    id: 'BADGE_204_2',
    room_id: 'SALLE_204_SCIENCES',
    x: 2120,
    y: 290,
    label: 'Atlas 6ème',
  },
];

export function getRoomAtPosition(x: number, y: number): ICampusRoomZone | undefined {
  return CAMPUS_ROOMS.find(
    (room) =>
      x >= room.bounds.x &&
      x <= room.bounds.x + room.bounds.width &&
      y >= room.bounds.y &&
      y <= room.bounds.y + room.bounds.height
  );
}

export function getRoomById(id: CampusRoomId): ICampusRoomZone {
  return CAMPUS_ROOMS.find((room) => room.id === id) ?? CAMPUS_ROOMS[0];
}

export function getNpcById(id: string): ICampusNpc | undefined {
  return CAMPUS_NPCS.find((npc) => npc.id === id);
}

export const CAMPUS_WORLD_DATA = {
  width: CAMPUS_WIDTH,
  height: CAMPUS_HEIGHT,
  spawnPoint: CAMPUS_SPAWN_POINT,
  rooms: CAMPUS_ROOMS,
  obstacles: CAMPUS_OBSTACLES,
  npcs: CAMPUS_NPCS,
  badges: CAMPUS_BADGE_SPAWNS,
  getRoomAtPosition,
  getRoomById,
};
