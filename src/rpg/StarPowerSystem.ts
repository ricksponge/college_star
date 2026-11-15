import type { BrawlerId } from '../types/cctp';

export const STAR_POWER_UNLOCK_LEVEL = 7;

export interface IStarPowerDefinition {
  id: string;
  brawlerId: BrawlerId;
  name: string;
  icon: string;
  unlockLevel: number;
  description: string;
}

export interface IStarPowerHitInput {
  brawlerId: BrawlerId;
  brawlerLevel: number;
  isCorrect: boolean;
  reactionTimeMs: number;
  consecutiveCorrectHits: number;
}

export interface IStarPowerTriggerEffect {
  unlocked: boolean;
  triggered: boolean;
  starPower: IStarPowerDefinition;
  ammoRefundBars: number;
  bonusSuperChargePct: number;
  healHp: number;
  bonusShieldHp: number;
  speedBoostPct: number;
  speedBoostDurationMs: number;
  errorDamageReductionPct: number;
  bannerMessage?: string;
}

export const BRAWLER_STAR_POWERS: Record<BrawlerId, IStarPowerDefinition> = {
  TIMO: {
    id: 'SP_TIMO_REFLEX_RELOAD',
    brawlerId: 'TIMO',
    name: 'Réflexe Éclair',
    icon: '⚡',
    unlockLevel: STAR_POWER_UNLOCK_LEVEL,
    description:
      'Chaque bonne réponse rapide (< 2,5s) recharge instantanément +1 munition et +8% de Super.',
  },
  LEO: {
    id: 'SP_LEO_INK_HEAL',
    brawlerId: 'LEO',
    name: 'Encre Régénérante',
    icon: '🖋️',
    unlockLevel: STAR_POWER_UNLOCK_LEVEL,
    description:
      'Chaque bonne réponse soigne Léo de +220 PV (et +0,5 munition sur tir réflexe).',
  },
  MAYA: {
    id: 'SP_MAYA_CHRONO_AEGIS',
    brawlerId: 'MAYA',
    name: 'Égide d’Histoire',
    icon: '🛡️',
    unlockLevel: STAR_POWER_UNLOCK_LEVEL,
    description:
      'Réduit de 25% les dégâts de pénalité et octroie un bouclier de +400 PV toutes les 2 bonnes réponses.',
  },
  ZACK: {
    id: 'SP_ZACK_TURBO_BEAT',
    brawlerId: 'ZACK',
    name: 'Turbo Bilingue',
    icon: '🎧',
    unlockLevel: STAR_POWER_UNLOCK_LEVEL,
    description:
      'Chaque bonne réponse accélère Zack de +15% pendant 3s et recharge +0,75 munition en tir réflexe.',
  },
};

const FAST_REACTION_THRESHOLD_MS = 2500;

/**
 * Système de Pouvoirs Star passifs débloqués au Niveau 7 (Agent 15 - RPG).
 */
export class StarPowerSystem {
  public isUnlocked(brawlerLevel: number): boolean {
    return Number.isFinite(brawlerLevel) && Math.floor(brawlerLevel) >= STAR_POWER_UNLOCK_LEVEL;
  }

  public getStarPower(brawlerId: BrawlerId): IStarPowerDefinition {
    return BRAWLER_STAR_POWERS[brawlerId];
  }

  /**
   * Évalue les effets passifs du Pouvoir Star lors d'un tir sur une cible.
   */
  public evaluateOnCombatHit(input: IStarPowerHitInput): IStarPowerTriggerEffect {
    const starPower = this.getStarPower(input.brawlerId);
    const unlocked = this.isUnlocked(input.brawlerLevel);

    const empty: IStarPowerTriggerEffect = {
      unlocked,
      triggered: false,
      starPower,
      ammoRefundBars: 0,
      bonusSuperChargePct: 0,
      healHp: 0,
      bonusShieldHp: 0,
      speedBoostPct: 0,
      speedBoostDurationMs: 0,
      errorDamageReductionPct: 0,
    };

    if (!unlocked) {
      return empty;
    }

    if (!input.isCorrect) {
      if (input.brawlerId === 'MAYA') {
        return {
          ...empty,
          triggered: true,
          errorDamageReductionPct: 25,
          bannerMessage: `🛡️ ${starPower.name} : dégâts d’erreur réduits de 25% !`,
        };
      }
      return empty;
    }

    const isFastReflex = input.reactionTimeMs < FAST_REACTION_THRESHOLD_MS;

    switch (input.brawlerId) {
      case 'TIMO': {
        if (!isFastReflex) return empty;
        return {
          ...empty,
          triggered: true,
          ammoRefundBars: 1,
          bonusSuperChargePct: 8,
          bannerMessage: `⚡ ${starPower.name} : +1 munition & +8% Super !`,
        };
      }
      case 'LEO': {
        return {
          ...empty,
          triggered: true,
          healHp: 220,
          ammoRefundBars: isFastReflex ? 0.5 : 0,
          bannerMessage: `🖋️ ${starPower.name} : +220 PV !`,
        };
      }
      case 'MAYA': {
        const shieldGranted = input.consecutiveCorrectHits > 0 && input.consecutiveCorrectHits % 2 === 0;
        return {
          ...empty,
          triggered: shieldGranted,
          bonusShieldHp: shieldGranted ? 400 : 0,
          errorDamageReductionPct: 25,
          bannerMessage: shieldGranted
            ? `🛡️ ${starPower.name} : Bouclier +400 PV !`
            : undefined,
        };
      }
      case 'ZACK': {
        return {
          ...empty,
          triggered: true,
          ammoRefundBars: isFastReflex ? 0.75 : 0,
          speedBoostPct: 15,
          speedBoostDurationMs: 3000,
          bannerMessage: `🎧 ${starPower.name} : +15% Vitesse !`,
        };
      }
    }
  }
}
