import type { IGameMode } from '../types/cctp';

export const MODE_CONSEIL_DE_CLASSE: IGameMode = {
  id: 'CONSEIL_DE_CLASSE',
  mode_number: 5,
  name: 'Le Conseil de Classe',
  inspired_by: 'Combat de Boss (Boss Fight)',
  format: 'PVE_BOSS',
  duration_seconds: 150,
  description:
    'Affrontement Co-op contre un Boss géant (Giga-Fraction ou Le Seigneur du Passé Simple). Le Boss balaye l’arène d’un mur laser ne laissant qu’un couloir de sécurité identifié par la bonne réponse.',
  victory_condition: 'Réduire les PV du Boss à 0 en visant les bonnes réponses et en esquivant le laser.',
};

export type BossArchetype = 'GIGA_FRACTION' | 'SEIGNEUR_PASSE_SIMPLE';

export interface IConseilClasseState {
  bossName: string;
  bossHp: number;
  bossMaxHp: number;
  laserSweepY: number;
  safeCorridorIndex: number;
}

export class ConseilClasseSession {
  public readonly config = MODE_CONSEIL_DE_CLASSE;
  private bossName: string;
  private bossHp = 12000;
  private readonly bossMaxHp = 12000;
  private laserSweepY = 90;
  private laserDirection = 1;
  private safeCorridorIndex = 0;

  constructor(boss: BossArchetype = 'GIGA_FRACTION') {
    this.bossName =
      boss === 'GIGA_FRACTION' ? 'Giga-Fraction' : 'Le Seigneur du Passé Simple';
  }

  public tickLaser(dtSec: number, minY = 90, maxY = 540): void {
    this.laserSweepY += this.laserDirection * 115 * dtSec;
    if (this.laserSweepY >= maxY) {
      this.laserSweepY = maxY;
      this.laserDirection = -1;
    } else if (this.laserSweepY <= minY) {
      this.laserSweepY = minY;
      this.laserDirection = 1;
    }
  }

  public setSafeCorridor(index: number): void {
    this.safeCorridorIndex = Math.max(0, Math.min(3, index));
  }

  public isHitByLaser(playerX: number, playerY: number, arenaW = 960): boolean {
    if (Math.abs(playerY - this.laserSweepY) >= 16) {
      return false;
    }
    const safeArenaW = arenaW > 0 ? arenaW : 960;
    const playerCorridor = Math.min(3, Math.max(0, Math.floor(playerX / (safeArenaW / 4))));
    return playerCorridor !== this.safeCorridorIndex;
  }

  public damageBoss(amount: number): boolean {
    this.bossHp = Math.max(0, this.bossHp - Math.max(0, amount));
    return this.bossHp === 0;
  }

  public getState(): IConseilClasseState {
    return {
      bossName: this.bossName,
      bossHp: this.bossHp,
      bossMaxHp: this.bossMaxHp,
      laserSweepY: Math.round(this.laserSweepY),
      safeCorridorIndex: this.safeCorridorIndex,
    };
  }
}
