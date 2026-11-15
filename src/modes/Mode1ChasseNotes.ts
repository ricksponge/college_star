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

export interface IDroppedCrystal {
  id: string;
  x: number;
  y: number;
}

export interface IChasseNotesState {
  crystalsCollected: number;
  countdownActive: boolean;
  countdownRemainingSec: number;
  promptCycleRemainingSec: number;
  droppedCrystals: IDroppedCrystal[];
}

export class ChasseNotesSession {
  public readonly config = MODE_CHASSE_AUX_BONNES_NOTES;
  private crystalsCollected = 0;
  private countdownActive = false;
  private countdownRemainingSec = 15;
  private promptCycleRemainingSec = 12;
  private droppedCrystals: IDroppedCrystal[] = [];
  private crystalSeq = 0;

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

  public spawnDroppedCrystal(x: number, y: number): void {
    this.crystalSeq += 1;
    this.droppedCrystals.push({
      id: `crystal_${this.crystalSeq}`,
      x,
      y,
    });
  }

  public tryPickupCrystals(playerX: number, playerY: number, pickupRadius = 58): number {
    const remaining: IDroppedCrystal[] = [];
    let pickedCount = 0;

    for (const crystal of this.droppedCrystals) {
      if (Math.hypot(crystal.x - playerX, crystal.y - playerY) <= pickupRadius) {
        pickedCount += 1;
      } else {
        remaining.push(crystal);
      }
    }

    this.droppedCrystals = remaining;
    if (pickedCount > 0) {
      this.collectCrystal(pickedCount);
    }
    return pickedCount;
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
      droppedCrystals: this.droppedCrystals.map((crystal) => ({ ...crystal })),
    };
  }
}
