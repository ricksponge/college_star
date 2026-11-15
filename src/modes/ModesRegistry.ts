import type { BrawlerId, GameModeId, IGameMode } from '../types/cctp';
import { ChasseNotesSession, MODE_CHASSE_AUX_BONNES_NOTES } from './Mode1ChasseNotes';
import { MatchAccordsSession, MODE_MATCH_DES_ACCORDS } from './Mode2MatchAccords';
import { InterroSurpriseSession, MODE_INTERRO_SURPRISE } from './Mode3InterroSurprise';
import { ChangementSalleSession, MODE_CHANGEMENT_DE_SALLE } from './Mode4ChangementSalle';
import { ConseilClasseSession, MODE_CONSEIL_DE_CLASSE } from './Mode5ConseilClasse';
import { GuardiansModeSession, MODE_GUARDIANS_OF_RECRE } from './Mode6Guardians';

export type ModeSession =
  | ChasseNotesSession
  | MatchAccordsSession
  | InterroSurpriseSession
  | ChangementSalleSession
  | ConseilClasseSession
  | GuardiansModeSession;

export const ALL_GAME_MODES: IGameMode[] = [
  MODE_CHASSE_AUX_BONNES_NOTES,
  MODE_MATCH_DES_ACCORDS,
  MODE_INTERRO_SURPRISE,
  MODE_CHANGEMENT_DE_SALLE,
  MODE_CONSEIL_DE_CLASSE,
  MODE_GUARDIANS_OF_RECRE,
];

export function getGameModeById(id: GameModeId): IGameMode {
  return ALL_GAME_MODES.find((m) => m.id === id) ?? MODE_CHASSE_AUX_BONNES_NOTES;
}

export function createModeSession(id: GameModeId): ModeSession {
  switch (id) {
    case 'CHASSE_AUX_BONNES_NOTES':
      return new ChasseNotesSession();
    case 'MATCH_DES_ACCORDS':
      return new MatchAccordsSession();
    case 'INTERRO_SURPRISE':
      return new InterroSurpriseSession();
    case 'CHANGEMENT_DE_SALLE':
      return new ChangementSalleSession();
    case 'CONSEIL_DE_CLASSE':
      return new ConseilClasseSession();
    case 'LES_GARDIENS_DE_LA_RECRE':
      return new GuardiansModeSession();
  }
}

/**
 * Rotation horaire des 5 modes de jeu (Jalon M2 du CCTP).
 */
export function getHourlyRotatedMode(now: Date = new Date()): IGameMode {
  const index = now.getHours() % ALL_GAME_MODES.length;
  return ALL_GAME_MODES[index];
}

export interface IModeQuickGuide {
  modeId: GameModeId;
  icon: string;
  shortTag: string;
  oneLineGoal: string;
  howToWinSteps: [string, string, string];
  recommendedBrawler: BrawlerId;
}

const MODE_QUICK_GUIDES: Record<GameModeId, IModeQuickGuide> = {
  CHASSE_AUX_BONNES_NOTES: {
    modeId: 'CHASSE_AUX_BONNES_NOTES',
    icon: '💎',
    shortTag: '💎 RAMASSE 10 CRISTAUX',
    oneLineGoal: 'Tire sur la bonne gemme et récupère 10 cristaux bleus !',
    howToWinSteps: [
      '1. Lis la question en haut et tire sur la bonne gemme.',
      '2. Passe près du cristal bleu tombé pour le ramasser.',
      '3. Garde 10 cristaux pendant 15 secondes pour gagner !',
    ],
    recommendedBrawler: 'TIMO',
  },
  MATCH_DES_ACCORDS: {
    modeId: 'MATCH_DES_ACCORDS',
    icon: '⚽',
    shortTag: '⚽ MARQUE 2 BUTS',
    oneLineGoal: 'Envoie le ballon dans la cage qui affiche la bonne terminaison !',
    howToWinSteps: [
      '1. Lis la phrase à trou affichée en haut de l’arène.',
      '2. Dribble ou tire le ballon vers la bonne cage (-É ou -ER).',
      '3. Marque 2 buts corrects pour remporter le match !',
    ],
    recommendedBrawler: 'LEO',
  },
  INTERRO_SURPRISE: {
    modeId: 'INTERRO_SURPRISE',
    icon: '⚡',
    shortTag: '⚡ SURVIS & BRILLE',
    oneLineGoal: 'Brise les caisses pour te renforcer et reste dans la cour sûre !',
    howToWinSteps: [
      '1. Casse les caisses d’énergie pour gagner PV et dégâts.',
      '2. Élimine les bonnes cibles sans sortir du cercle sûr.',
      '3. Sois le dernier élève-héros debout avant la sonnerie !',
    ],
    recommendedBrawler: 'MAYA',
  },
  CHANGEMENT_DE_SALLE: {
    modeId: 'CHANGEMENT_DE_SALLE',
    icon: '🏫',
    shortTag: '🏫 TROUVE LA BONNE SALLE',
    oneLineGoal: 'Repère la bonne salle sur l’emploi du temps et capture-la à 100% !',
    howToWinSteps: [
      '1. Lis la salle ou l’étage demandé en haut de l’écran.',
      '2. Évite les bavardages et passe au casier pour capturer plus vite.',
      '3. Reste dans la bonne salle jusqu’à 100% de capture !',
    ],
    recommendedBrawler: 'ZACK',
  },
  CONSEIL_DE_CLASSE: {
    modeId: 'CONSEIL_DE_CLASSE',
    icon: '👑',
    shortTag: '👑 BATS LE BOSS',
    oneLineGoal: 'Mets le Boss à 0 PV et réfugie-toi dans le couloir vert face au laser !',
    howToWinSteps: [
      '1. Repère la bonne réponse et place-toi dans son couloir vert.',
      '2. Esquive le mur laser qui balaye toute l’arène.',
      '3. Enchaîne les tirs et ton Super pour vaincre le Boss !',
    ],
    recommendedBrawler: 'TIMO',
  },
  LES_GARDIENS_DE_LA_RECRE: {
    modeId: 'LES_GARDIENS_DE_LA_RECRE',
    icon: '🛡️',
    shortTag: '🛡️ GARDIENS COOP',
    oneLineGoal: 'Dissipe les nuages de rumeurs et protège les élèves avec des choix solidaires !',
    howToWinSteps: [
      '1. Choisis le réflexe d’écoute, d’entraide ou d’inclusion neuro-diversité.',
      '2. Dissipe les nuages gris avant qu’ils ne touchent un camarade.',
      '3. Active le Bouclier Solidaire d’équipe pour sécuriser la cour !',
    ],
    recommendedBrawler: 'MAYA',
  },
};

/**
 * Retourne un guide express lisible immédiatement pour un élève de CM2/6ème.
 */
export function getModeQuickGuide(modeId: GameModeId): IModeQuickGuide {
  const guide = MODE_QUICK_GUIDES[modeId] ?? MODE_QUICK_GUIDES.CHASSE_AUX_BONNES_NOTES;
  return {
    ...guide,
    howToWinSteps: [...guide.howToWinSteps] as [string, string, string],
  };
}

export {
  CAMPUS_EXPLORATION_INFO,
  CampusExplorationSession,
  type ICampusExplorationInfo,
  type ICampusExplorationState,
  type ICampusPositionUpdateResult,
} from './Mode6CampusExploration';

export {
  CAMPUS_BADGE_SPAWNS,
  CAMPUS_HEIGHT,
  CAMPUS_NPCS,
  CAMPUS_OBSTACLES,
  CAMPUS_ROOMS,
  CAMPUS_SPAWN_POINT,
  CAMPUS_WIDTH,
  CAMPUS_WORLD_DATA,
  getNpcById,
  getRoomAtPosition,
  getRoomById,
  type ICampusBadgeSpawn,
} from './CampusMapLayout';
