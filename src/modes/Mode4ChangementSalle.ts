import type { IGameMode } from '../types/cctp';

export const MODE_CHANGEMENT_DE_SALLE: IGameMode = {
  id: 'CHANGEMENT_DE_SALLE',
  mode_number: 4,
  name: 'Changement de Salle',
  inspired_by: 'Zone Réservée (Hot Zone)',
  format: 'SOLO_COOP',
  duration_seconds: 120,
  target_subject: 'vie_au_college',
  description:
    'Spécial Autonomie 6ème : un extrait d’emploi du temps s’affiche (ex. : « Semaine B - 10h : SVT en Salle 204 »). Évite les Ralentisseurs de Bavardage et capture la bonne salle avant la sonnerie.',
  victory_condition: 'Atteindre 100% de capture sur la salle exacte avant la fin des 2 minutes.',
};

export interface IScheduleDirective {
  week: 'A' | 'B';
  hourLabel: string;
  subjectLabel: string;
  roomCode: string;
  expectedFloorLabel: string;
}

export interface IChangementSalleState {
  directive: IScheduleDirective;
  capturePct: number;
  slowedByChatterMs: number;
}

export class ChangementSalleSession {
  public readonly config = MODE_CHANGEMENT_DE_SALLE;
  private directive: IScheduleDirective = {
    week: 'B',
    hourLabel: '10h00',
    subjectLabel: 'SVT',
    roomCode: '204',
    expectedFloorLabel: '2e étage',
  };
  private capturePct = 0;
  private slowedByChatterMs = 0;

  public setScheduleDirective(directive: IScheduleDirective): void {
    this.directive = directive;
  }

  public hitChatterTrap(): void {
    this.slowedByChatterMs = 2000;
  }

  public advanceCapture(dtSec: number, isInsideCorrectRoom: boolean): boolean {
    if (this.slowedByChatterMs > 0) {
      this.slowedByChatterMs = Math.max(0, this.slowedByChatterMs - dtSec * 1000);
    }
    if (isInsideCorrectRoom) {
      this.capturePct = Math.min(100, this.capturePct + dtSec * 25);
    }
    return this.capturePct >= 100;
  }

  public getState(): IChangementSalleState {
    return {
      directive: this.directive,
      capturePct: Math.round(this.capturePct),
      slowedByChatterMs: this.slowedByChatterMs,
    };
  }
}
