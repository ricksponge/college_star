import type { BrawlerId, IBrawler } from '../types/cctp';
import type { LocalSQLiteDB } from '../db/LocalSQLiteDB';
import { getAllBrawlers, getBrawlerById } from '../entities/Brawlers';
import { STAR_POWER_UNLOCK_LEVEL } from './StarPowerSystem';

export const MIN_BRAWLER_LEVEL = 1;
export const MAX_BRAWLER_LEVEL = 11;
export const GADGET_UNLOCK_LEVEL = 1;

export interface IBrawlerLevelStats {
  brawlerId: BrawlerId;
  name: string;
  level: number;
  maxHp: number;
  baseDamage: number;
  speedValue: IBrawler['speed_value'];
  levelMultiplier: number;
  gadgetUnlocked: boolean;
  starPowerUnlocked: boolean;
  nextUpgradeCostCoins: number | null;
}

export interface IUpgradePurchaseResult {
  success: boolean;
  brawlerId: BrawlerId;
  previousLevel: number;
  newLevel: number;
  coinsSpent: number;
  remainingCoins: number;
  unlockedStarPower: boolean;
  reason?: string;
}

const STORAGE_KEY = 'brawl_college_rpg_levels_v1';

const LEVEL_UPGRADE_COSTS: Record<number, number> = {
  1: 80,
  2: 120,
  3: 175,
  4: 240,
  5: 320,
  6: 410,
  7: 510,
  8: 620,
  9: 750,
  10: 900,
};

function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return MIN_BRAWLER_LEVEL;
  return Math.max(MIN_BRAWLER_LEVEL, Math.min(MAX_BRAWLER_LEVEL, Math.floor(level)));
}

/**
 * Gestionnaire de progression RPG (Niveaux 1 à 11) pour Timo, Léo, Maya et Zack
 * (Agent 15 - RPG, Niveaux & Gadgets Scolaires).
 */
export class BrawlerUpgradeManager {
  private readonly db: LocalSQLiteDB | null;
  private levels: Record<BrawlerId, number>;

  constructor(db: LocalSQLiteDB | null = null) {
    this.db = db;
    this.levels = this.loadLevels();
  }

  public getLevel(brawlerId: BrawlerId): number {
    return this.levels[brawlerId] ?? MIN_BRAWLER_LEVEL;
  }

  public getAllLevels(): Record<BrawlerId, number> {
    return { ...this.levels };
  }

  public getUpgradeCostCoins(currentLevel: number): number | null {
    const safeLevel = clampLevel(currentLevel);
    if (safeLevel >= MAX_BRAWLER_LEVEL) {
      return null;
    }
    return LEVEL_UPGRADE_COSTS[safeLevel] ?? 90 * safeLevel;
  }

  /**
   * Calcule les statistiques effectives du héros au niveau courant (1..11)
   * selon le multiplicateur CCTP : `1 + 0,08 * (niveau - 1)`.
   */
  public getBrawlerStats(brawlerId: BrawlerId, overrideLevel?: number): IBrawlerLevelStats {
    const brawler = getBrawlerById(brawlerId);
    const level = clampLevel(overrideLevel ?? this.getLevel(brawlerId));
    const levelMultiplier = Number((1 + 0.08 * (level - 1)).toFixed(2));

    return {
      brawlerId,
      name: brawler.name,
      level,
      maxHp: Math.round(brawler.base_hp * levelMultiplier),
      baseDamage: Math.round(brawler.basic_attack.base_damage * levelMultiplier),
      speedValue: brawler.speed_value,
      levelMultiplier,
      gadgetUnlocked: level >= GADGET_UNLOCK_LEVEL,
      starPowerUnlocked: level >= STAR_POWER_UNLOCK_LEVEL,
      nextUpgradeCostCoins: this.getUpgradeCostCoins(level),
    };
  }

  public getAllRosterStats(): IBrawlerLevelStats[] {
    return getAllBrawlers().map((b) => this.getBrawlerStats(b.id));
  }

  /**
   * Améliore un héros d'un palier (jusqu'au niveau 11) avec les pièces gagnées.
   */
  public upgradeBrawler(brawlerId: BrawlerId, availableCoinsInput?: number): IUpgradePurchaseResult {
    const currentLevel = this.getLevel(brawlerId);
    const availableCoins = availableCoinsInput ?? this.db?.getPlayerProfile().coins ?? 0;

    if (currentLevel >= MAX_BRAWLER_LEVEL) {
      return {
        success: false,
        brawlerId,
        previousLevel: currentLevel,
        newLevel: currentLevel,
        coinsSpent: 0,
        remainingCoins: availableCoins,
        unlockedStarPower: false,
        reason: `Niveau maximum atteint (${MAX_BRAWLER_LEVEL}).`,
      };
    }

    const cost = this.getUpgradeCostCoins(currentLevel) ?? 900;
    if (availableCoins < cost) {
      return {
        success: false,
        brawlerId,
        previousLevel: currentLevel,
        newLevel: currentLevel,
        coinsSpent: 0,
        remainingCoins: availableCoins,
        unlockedStarPower: false,
        reason: `Il manque ${cost - availableCoins} Pièces (coût : ${cost}).`,
      };
    }

    const remainingCoins = availableCoins - cost;
    const newLevel = currentLevel + 1;
    this.levels[brawlerId] = newLevel;
    this.saveLevels();

    if (this.db) {
      this.db.updatePlayerProfile({ coins: remainingCoins });
    }

    return {
      success: true,
      brawlerId,
      previousLevel: currentLevel,
      newLevel,
      coinsSpent: cost,
      remainingCoins,
      unlockedStarPower: newLevel === STAR_POWER_UNLOCK_LEVEL,
    };
  }

  private loadLevels(): Record<BrawlerId, number> {
    const defaults: Record<BrawlerId, number> = {
      TIMO: this.db ? clampLevel(this.db.getBrawlerLevel('TIMO')) : 1,
      LEO: this.db ? clampLevel(this.db.getBrawlerLevel('LEO')) : 1,
      MAYA: this.db ? clampLevel(this.db.getBrawlerLevel('MAYA')) : 1,
      ZACK: this.db ? clampLevel(this.db.getBrawlerLevel('ZACK')) : 1,
    };

    if (typeof localStorage === 'undefined') {
      return defaults;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as Partial<Record<BrawlerId, unknown>>;
      return {
        TIMO: Math.max(defaults.TIMO, clampLevel(Number(parsed.TIMO ?? defaults.TIMO))),
        LEO: Math.max(defaults.LEO, clampLevel(Number(parsed.LEO ?? defaults.LEO))),
        MAYA: Math.max(defaults.MAYA, clampLevel(Number(parsed.MAYA ?? defaults.MAYA))),
        ZACK: Math.max(defaults.ZACK, clampLevel(Number(parsed.ZACK ?? defaults.ZACK))),
      };
    } catch {
      return defaults;
    }
  }

  private saveLevels(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.levels));
    } catch {
      // Stockage local indisponible
    }
  }
}
