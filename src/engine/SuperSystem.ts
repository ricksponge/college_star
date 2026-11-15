import type { BrawlerId, IBrawler } from '../types/cctp';
import type { IRenderVec2 } from './IsometricRenderer';

export interface ITargetEntity {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  label: string;
  isCorrect: boolean;
  hp: number;
  maxHp: number;
  highlightedMs: number;
  frozenMs: number;
  slowedMs: number;
  isCrystal?: boolean;
  isBoss?: boolean;
  badgeLetter?: 'A' | 'B' | 'C' | 'D';
  phaseOffset?: number;
}

export interface ISuperExecutionResult {
  brawlerId: BrawlerId;
  superName: string;
  eliminatedTargetIds: string[];
  bonusObjectivePoints: number;
  newPlayerPos?: IRenderVec2;
  grantedShieldHp: number;
  spawnTurretAt?: IRenderVec2;
  healPerSecond?: number;
  freezeEnemiesMs: number;
  durationMs: number;
}

export interface IGadgetExecutionResult {
  brawlerId: BrawlerId;
  gadgetName: string;
  remainingCharges: number;
  highlightedTargetIds: string[];
  erasedWrongTargetId?: string;
  compassTargetPos?: IRenderVec2;
  slowEnemiesMs: number;
  durationMs: number;
}

/**
 * Gestionnaire des attaques Ultimes (Super - Bouton Jaune) et des Gadgets (Bouton Vert - 3 charges).
 * Respecte US-02 : quand la jauge est à 100%, le Super élimine automatiquement la bonne cible
 * présente à l'écran et marque +2 points d'objectif.
 */
export class SuperSystem {
  private superGaugePct = 0;
  private gadgetChargesLeft = 3;

  public resetForMatch(initialGadgetCharges = 3): void {
    this.superGaugePct = 0;
    this.gadgetChargesLeft = initialGadgetCharges;
  }

  public getSuperGaugePct(): number {
    return this.superGaugePct;
  }

  public getGadgetChargesLeft(): number {
    return this.gadgetChargesLeft;
  }

  public isSuperReady(): boolean {
    return this.superGaugePct >= 100;
  }

  public addSuperCharge(gainPct: number): number {
    this.superGaugePct = Math.min(100, Math.max(0, this.superGaugePct + gainPct));
    return this.superGaugePct;
  }

  /**
   * Déclenche le Super si la jauge est à 100%.
   */
  public triggerSuper(
    brawler: IBrawler,
    targets: ITargetEntity[],
    playerPos: IRenderVec2
  ): ISuperExecutionResult | null {
    if (!this.isSuperReady()) {
      return null;
    }

    this.superGaugePct = 0;
    const correctTargets = targets.filter((t) => t.isCorrect && t.hp > 0);
    const eliminatedTargetIds = correctTargets.map((t) => t.id);

    for (const target of correctTargets) {
      target.hp = 0;
    }

    const firstCorrect = correctTargets[0];
    const bonusPoints = brawler.super_ability.bonus_objective_points;
    const durationMs = (brawler.super_ability.duration_sec ?? 2.5) * 1000;

    switch (brawler.id) {
      case 'TIMO': {
        const dashPos = firstCorrect
          ? { x: firstCorrect.x, y: firstCorrect.y + 36 }
          : { x: playerPos.x, y: Math.max(60, playerPos.y - 160) };
        return {
          brawlerId: brawler.id,
          superName: brawler.super_ability.name,
          eliminatedTargetIds,
          bonusObjectivePoints: bonusPoints,
          newPlayerPos: dashPos,
          grantedShieldHp: 0,
          freezeEnemiesMs: 0,
          durationMs,
        };
      }
      case 'LEO': {
        return {
          brawlerId: brawler.id,
          superName: brawler.super_ability.name,
          eliminatedTargetIds,
          bonusObjectivePoints: bonusPoints,
          grantedShieldHp: 0,
          spawnTurretAt: { x: playerPos.x, y: playerPos.y - 35 },
          healPerSecond: brawler.super_ability.effect_value ?? 400,
          freezeEnemiesMs: 0,
          durationMs,
        };
      }
      case 'MAYA': {
        for (const t of targets) {
          if (t.hp > 0) {
            t.frozenMs = Math.max(t.frozenMs, durationMs);
          }
        }
        return {
          brawlerId: brawler.id,
          superName: brawler.super_ability.name,
          eliminatedTargetIds,
          bonusObjectivePoints: bonusPoints,
          grantedShieldHp: brawler.super_ability.effect_value ?? 6000,
          freezeEnemiesMs: durationMs,
          durationMs,
        };
      }
      case 'ZACK': {
        const teleportPos = firstCorrect
          ? { x: firstCorrect.x, y: firstCorrect.y + 28 }
          : playerPos;
        return {
          brawlerId: brawler.id,
          superName: brawler.super_ability.name,
          eliminatedTargetIds,
          bonusObjectivePoints: bonusPoints,
          newPlayerPos: teleportPos,
          grantedShieldHp: brawler.super_ability.effect_value ?? 1500,
          freezeEnemiesMs: 0,
          durationMs,
        };
      }
    }
  }

  /**
   * Déclenche une des 3 charges de Gadget du héros.
   */
  public triggerGadget(brawler: IBrawler, targets: ITargetEntity[]): IGadgetExecutionResult | null {
    if (this.gadgetChargesLeft <= 0) {
      return null;
    }

    this.gadgetChargesLeft -= 1;
    const durationMs = brawler.gadget.duration_sec * 1000;
    const correctTargets = targets.filter((t) => t.isCorrect && t.hp > 0);
    const wrongTargets = targets.filter((t) => !t.isCorrect && t.hp > 0);

    switch (brawler.id) {
      case 'TIMO': {
        const highlightedTargetIds: string[] = [];
        for (const t of correctTargets) {
          t.highlightedMs = Math.max(t.highlightedMs, durationMs);
          highlightedTargetIds.push(t.id);
        }
        return {
          brawlerId: brawler.id,
          gadgetName: brawler.gadget.name,
          remainingCharges: this.gadgetChargesLeft,
          highlightedTargetIds,
          slowEnemiesMs: 0,
          durationMs,
        };
      }
      case 'LEO': {
        const toErase = wrongTargets[0];
        if (toErase) {
          toErase.hp = 0;
        }
        return {
          brawlerId: brawler.id,
          gadgetName: brawler.gadget.name,
          remainingCharges: this.gadgetChargesLeft,
          highlightedTargetIds: [],
          erasedWrongTargetId: toErase?.id,
          slowEnemiesMs: 0,
          durationMs,
        };
      }
      case 'MAYA': {
        const target = correctTargets[0];
        if (target) {
          target.highlightedMs = Math.max(target.highlightedMs, durationMs);
        }
        return {
          brawlerId: brawler.id,
          gadgetName: brawler.gadget.name,
          remainingCharges: this.gadgetChargesLeft,
          highlightedTargetIds: target ? [target.id] : [],
          compassTargetPos: target ? { x: target.x, y: target.y } : undefined,
          slowEnemiesMs: 0,
          durationMs,
        };
      }
      case 'ZACK': {
        for (const t of targets) {
          if (t.hp > 0) {
            t.slowedMs = Math.max(t.slowedMs, durationMs);
          }
        }
        return {
          brawlerId: brawler.id,
          gadgetName: brawler.gadget.name,
          remainingCharges: this.gadgetChargesLeft,
          highlightedTargetIds: [],
          slowEnemiesMs: durationMs,
          durationMs,
        };
      }
    }
  }
}
