import type { GameModeId, IGameMode } from '../types/cctp';
import { ChasseNotesSession, MODE_CHASSE_AUX_BONNES_NOTES } from './Mode1ChasseNotes';
import { MatchAccordsSession, MODE_MATCH_DES_ACCORDS } from './Mode2MatchAccords';
import { InterroSurpriseSession, MODE_INTERRO_SURPRISE } from './Mode3InterroSurprise';
import { ChangementSalleSession, MODE_CHANGEMENT_DE_SALLE } from './Mode4ChangementSalle';
import { ConseilClasseSession, MODE_CONSEIL_DE_CLASSE } from './Mode5ConseilClasse';

export type ModeSession =
  | ChasseNotesSession
  | MatchAccordsSession
  | InterroSurpriseSession
  | ChangementSalleSession
  | ConseilClasseSession;

export const ALL_GAME_MODES: IGameMode[] = [
  MODE_CHASSE_AUX_BONNES_NOTES,
  MODE_MATCH_DES_ACCORDS,
  MODE_INTERRO_SURPRISE,
  MODE_CHANGEMENT_DE_SALLE,
  MODE_CONSEIL_DE_CLASSE,
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
  }
}

/**
 * Rotation horaire des 5 modes de jeu (Jalon M2 du CCTP).
 */
export function getHourlyRotatedMode(now: Date = new Date()): IGameMode {
  const index = now.getHours() % ALL_GAME_MODES.length;
  return ALL_GAME_MODES[index];
}
