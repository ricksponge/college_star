import type { IGameMode } from '../types/cctp';

export const MODE_CHASSE_AUX_BONNES_NOTES: IGameMode = {
  id: 'CHASSE_AUX_BONNES_NOTES',
  mode_number: 1,
  name: 'Chasse aux Bonnes Notes',
  inspired_by: 'Razzia de Gemmes (Gem Grab)',
  format: '3v3',
  duration_seconds: 135,
  description:
    "Le puits central éjecte des gemmes numériques ou lexicales. L'énoncé change toutes les 12 secondes : tire sur la bonne gemme pour la transformer en cristal bleu à ramasser.",
  victory_condition: 'Collecter 10 cristaux bleus et tenir 15 secondes (ou score le plus élevé à 2m15).',
};

export interface IChasseNotesState {
  crystalsCollected: number;
  countdownActive: boolean;
  countdownRemainingSec: number;
  promptCycleRemainingSec: number;
}

export class ChasseNotesSession {
  public readonly config = MODE_CHASSE_AUX_BONNES_NOTES;
  private crystalsCollected = 0;
  private countdownActive = false;
  private countdownRemainingSec = 15;
  private promptCycleRemainingSec = 12;

  public tick(dtSec: number): { shouldRotatePrompt: boolean; victoryByCountdown: boolean } {
    let shouldRotatePrompt = false;
    this.promptCycleRemainingSec -= dtSec;
    if (this.promptCycleRemainingSec <= 0) {
      this.promptCycleRemainingSec = 12;
      shouldRotatePrompt = true;
    }

    let victoryByCountdown = false;
    if (this.countdownActive) {
      this.countdownRemainingSec = Math.max(0, this.countdownRemainingSec - dtSec);
      if (this.countdownRemainingSec <= 0) {
        victoryByCountdown = true;
      }
    }

    return { shouldRotatePrompt, victoryByCountdown };
  }

  public collectCrystal(amount = 1): void {
    this.crystalsCollected += amount;
    if (this.crystalsCollected >= 10 && !this.countdownActive) {
      this.countdownActive = true;
      this.countdownRemainingSec = 15;
    }
  }

  public getState(): IChasseNotesState {
    return {
      crystalsCollected: this.crystalsCollected,
      countdownActive: this.countdownActive,
      countdownRemainingSec: this.countdownRemainingSec,
      promptCycleRemainingSec: this.promptCycleRemainingSec,
    };
  }
}
