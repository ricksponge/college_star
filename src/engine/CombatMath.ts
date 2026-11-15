import type { ICombatImpactInput, ICombatImpactResult } from '../types/cctp';

export const REFLEX_BONUS_THRESHOLD_MS = 2500;
export const EXPLANATION_FLASH_DURATION_MS = 1200;
export const ERROR_PENALTY_COOLDOWN_MS = 1500;
export const ERROR_SHIELD_DURATION_MS = 3000;
export const MAX_COMBO_MULTIPLIER = 1.6;
export const COMBO_STEP = 0.15;

/**
 * Calcule les conséquences exactes d'un impact projectile -> cible selon le CCTP-BC6E-2026-V2 :
 * - D_final = D_base * (1 + 0,08 * (N_niveau - 1)) * M_combo (M_combo: 1.0 -> 1.60 par pas de +0.15)
 * - G_super = 34% + (6% * V_reflexe) avec V_reflexe = 1 si temps < 2500 ms
 * - P_erreur = 12% * PV_max si cible erronée + bulle corrective 1200 ms + reset combo à 1.0
 */
export function computeCombatImpact(input: ICombatImpactInput): ICombatImpactResult {
  if (!input.is_correct) {
    return {
      final_damage: 0,
      combo_multiplier: 1.0,
      super_charge_gain_pct: 0,
      error_penalty_damage: Math.round(0.12 * input.player_max_hp),
      trigger_explanation_flash_ms: EXPLANATION_FLASH_DURATION_MS,
    };
  }

  const hits = Math.max(0, input.consecutive_correct_hits);
  const comboMultiplier = Math.min(
    MAX_COMBO_MULTIPLIER,
    Number((1.0 + COMBO_STEP * hits).toFixed(2))
  );
  const levelFactor = 1 + 0.08 * Math.max(0, input.brawler_level - 1);
  const finalDamage = Math.round(input.base_damage * levelFactor * comboMultiplier);

  const vReflexe = input.reaction_time_ms < REFLEX_BONUS_THRESHOLD_MS ? 1 : 0;
  const superChargeGainPct = 34 + 6 * vReflexe;

  return {
    final_damage: finalDamage,
    combo_multiplier: comboMultiplier,
    super_charge_gain_pct: superChargeGainPct,
    error_penalty_damage: 0,
    trigger_explanation_flash_ms: 0,
  };
}
