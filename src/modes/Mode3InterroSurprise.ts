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

export interface IEnergyCrate {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
}

export interface IInterroSurpriseState {
  alivePlayersCount: number;
  powerCubesCollected: number;
  safeRadius: number;
  damageMultiplier: number;
  hpBonus: number;
  crates: IEnergyCrate[];
}

export class InterroSurpriseSession {
  public readonly config = MODE_INTERRO_SURPRISE;
  private alivePlayersCount = 10;
  private powerCubesCollected = 0;
  private safeRadius = 460;
  private crates: IEnergyCrate[] = [];
  private crateSeq = 0;

  constructor() {
    this.spawnCratesIfEmpty();
  }

  public spawnCratesIfEmpty(): void {
    if (this.crates.length > 0) return;
    const positions = [
      { x: 220, y: 170 },
      { x: 740, y: 170 },
      { x: 220, y: 470 },
      { x: 740, y: 470 },
    ];
    const crateHp = 1600;
    this.crates = positions.map((pos) => {
      this.crateSeq += 1;
      return {
        id: `crate_${this.crateSeq}`,
        x: pos.x,
        y: pos.y,
        hp: crateHp,
        maxHp: crateHp,
      };
    });
  }

  public tick(elapsedSec: number): void {
    const progress = Math.min(1, Math.max(0, elapsedSec / this.config.duration_seconds));
    this.safeRadius = Math.round(460 - progress * 290);
  }

  public damageCrate(crateId: string, damage: number): boolean {
    const index = this.crates.findIndex((crate) => crate.id === crateId);
    if (index === -1) return false;

    const crate = this.crates[index];
    crate.hp = Math.max(0, crate.hp - Math.max(0, damage));
    if (crate.hp <= 0) {
      this.crates.splice(index, 1);
      this.breakEnergyCrate();
      return true;
    }
    return false;
  }

  public isOutsideSafeZone(
    playerX: number,
    playerY: number,
    centerX = 480,
    centerY = 320
  ): boolean {
    return Math.hypot(playerX - centerX, playerY - centerY) > this.safeRadius;
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
      crates: this.crates.map((crate) => ({ ...crate })),
    };
  }
}
