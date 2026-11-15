import type { IGameMode } from '../types/cctp';

export const MODE_INTERRO_SURPRISE: IGameMode = {
  id: 'INTERRO_SURPRISE',
  mode_number: 3,
  name: "L'Interro Surprise",
  inspired_by: 'Survivant (Showdown)',
  format: 'SOLO_10',
  duration_seconds: 150,
  description:
    "La Sonnerie de Fin d'Heure réduit progressivement la taille de la cour. Brise des caisses d'énergie en tirant sur la bonne étiquette pour augmenter tes PV et tes dégâts avant le duel final.",
  victory_condition: 'Être le dernier des 10 élèves-héros debout au centre de la cour.',
};

export interface IInterroSurpriseState {
  alivePlayersCount: number;
  powerCubesCollected: number;
  safeRadius: number;
  damageMultiplier: number;
  hpBonus: number;
}

export class InterroSurpriseSession {
  public readonly config = MODE_INTERRO_SURPRISE;
  private alivePlayersCount = 10;
  private powerCubesCollected = 0;
  private safeRadius = 460;

  public tick(elapsedSec: number): void {
    const progress = Math.min(1, Math.max(0, elapsedSec / this.config.duration_seconds));
    this.safeRadius = Math.round(460 - progress * 290);
  }

  public breakEnergyCrate(): void {
    this.powerCubesCollected += 1;
  }

  public eliminateOpponent(): boolean {
    if (this.alivePlayersCount > 1) {
      this.alivePlayersCount -= 1;
    }
    return this.alivePlayersCount === 1;
  }

  public getState(): IInterroSurpriseState {
    return {
      alivePlayersCount: this.alivePlayersCount,
      powerCubesCollected: this.powerCubesCollected,
      safeRadius: this.safeRadius,
      damageMultiplier: Number((1 + this.powerCubesCollected * 0.1).toFixed(2)),
      hpBonus: this.powerCubesCollected * 400,
    };
  }
}
