import type { BrawlerId } from '../types/cctp';

export type SchoolGadgetId = 'GOMME_MAGIQUE' | 'SABLIER_GELE' | 'HALO_EXPERT';

export const MAX_GADGET_CHARGES_PER_MATCH = 3;
export const SABLIER_GELE_DURATION_MS = 4000;
export const SABLIER_GELE_SPEED_MULTIPLIER = 0.45;
export const GADGET_COOLDOWN_MS = 1800;

export interface IGadgetDefinition {
  id: SchoolGadgetId;
  name: string;
  shortLabel: string;
  description: string;
  icon: string;
  durationMs: number;
  cooldownMs: number;
}

export interface IGadgetTargetCandidate {
  id: string;
  label: string;
  is_correct: boolean;
  active: boolean;
}

export interface IGadgetActivationCallbacks {
  onRemoveWrongTarget?: (targetId: string) => void;
  onApplySlowdown?: (speedMultiplier: number, durationMs: number) => void;
  onHighlightCorrect?: (targetId: string, durationMs: number) => void;
}

export interface IGadgetActivationResult {
  activated: boolean;
  gadgetId: SchoolGadgetId;
  remainingCharges: number;
  removedTargetId?: string;
  highlightedTargetId?: string;
  targetSpeedMultiplier?: number;
  durationMs: number;
  message: string;
}

export interface IGadgetHudSnapshot {
  gadget: IGadgetDefinition;
  remainingCharges: number;
  maxCharges: number;
  cooldownRemainingMs: number;
  activeEffectRemainingMs: number;
  isEffectActive: boolean;
  canActivate: boolean;
}

export const SCHOOL_GADGETS: Record<SchoolGadgetId, IGadgetDefinition> = {
  GOMME_MAGIQUE: {
    id: 'GOMME_MAGIQUE',
    name: 'Gomme Magique (50/50)',
    shortLabel: 'Gomme 50/50',
    description: 'Efface instantanément 1 mauvaise réponse de l’arène.',
    icon: '🧽',
    durationMs: 0,
    cooldownMs: GADGET_COOLDOWN_MS,
  },
  SABLIER_GELE: {
    id: 'SABLIER_GELE',
    name: 'Sablier Gelé (Chrono-Pause)',
    shortLabel: 'Sablier 4s',
    description: 'Ralentit tous les drones et ennemis pendant 4 secondes.',
    icon: '⏳',
    durationMs: SABLIER_GELE_DURATION_MS,
    cooldownMs: GADGET_COOLDOWN_MS,
  },
  HALO_EXPERT: {
    id: 'HALO_EXPERT',
    name: 'Vision d’Élite',
    shortLabel: 'Halo Doré',
    description: 'Révèle la bonne cible avec un halo doré pendant 4 secondes.',
    icon: '🔍',
    durationMs: 4000,
    cooldownMs: GADGET_COOLDOWN_MS,
  },
};

export function getDefaultGadgetForBrawler(brawlerId: BrawlerId): SchoolGadgetId {
  switch (brawlerId) {
    case 'LEO':
      return 'GOMME_MAGIQUE';
    case 'ZACK':
    case 'MAYA':
      return 'SABLIER_GELE';
    case 'TIMO':
      return 'GOMME_MAGIQUE';
  }
}

/**
 * Système de Gadgets scolaires actifs en combat (Agent 15 - RPG).
 * Gère les 3 charges par match, l'activation de « Gomme Magique » (50/50)
 * et « Sablier Gelé » (ralenti 4s), ainsi que le bouton vert du HUD.
 */
export class GadgetSystem {
  private selectedGadgetId: SchoolGadgetId;
  private remainingCharges: number = MAX_GADGET_CHARGES_PER_MATCH;
  private cooldownRemainingMs = 0;
  private activeEffectRemainingMs = 0;
  private activeSlowdownMultiplier = 1;
  private hudButtonEl: HTMLButtonElement | null = null;

  constructor(initialGadget: SchoolGadgetId = 'GOMME_MAGIQUE') {
    this.selectedGadgetId = initialGadget;
  }

  public selectGadget(gadgetId: SchoolGadgetId): void {
    this.selectedGadgetId = gadgetId;
    this.syncHudButton();
  }

  public getSelectedGadget(): IGadgetDefinition {
    return SCHOOL_GADGETS[this.selectedGadgetId];
  }

  public resetForNewMatch(gadgetId?: SchoolGadgetId): void {
    if (gadgetId) {
      this.selectedGadgetId = gadgetId;
    }
    this.remainingCharges = MAX_GADGET_CHARGES_PER_MATCH;
    this.cooldownRemainingMs = 0;
    this.activeEffectRemainingMs = 0;
    this.activeSlowdownMultiplier = 1;
    this.syncHudButton();
  }

  public update(dtMs: number): IGadgetHudSnapshot {
    const safeDt = Math.max(0, dtMs);
    if (this.cooldownRemainingMs > 0) {
      this.cooldownRemainingMs = Math.max(0, this.cooldownRemainingMs - safeDt);
    }
    if (this.activeEffectRemainingMs > 0) {
      this.activeEffectRemainingMs = Math.max(0, this.activeEffectRemainingMs - safeDt);
      if (this.activeEffectRemainingMs <= 0) {
        this.activeSlowdownMultiplier = 1;
      }
    }
    this.syncHudButton();
    return this.getHudSnapshot();
  }

  public getTargetSpeedMultiplier(): number {
    return this.activeEffectRemainingMs > 0 ? this.activeSlowdownMultiplier : 1;
  }

  public getHudSnapshot(): IGadgetHudSnapshot {
    const gadget = this.getSelectedGadget();
    const canActivate = this.remainingCharges > 0 && this.cooldownRemainingMs <= 0;
    return {
      gadget,
      remainingCharges: this.remainingCharges,
      maxCharges: MAX_GADGET_CHARGES_PER_MATCH,
      cooldownRemainingMs: Math.round(this.cooldownRemainingMs),
      activeEffectRemainingMs: Math.round(this.activeEffectRemainingMs),
      isEffectActive: this.activeEffectRemainingMs > 0,
      canActivate,
    };
  }

  /**
   * Déclenche le gadget actif s'il reste des charges (3 max) et hors cooldown.
   */
  public activate(
    targets: IGadgetTargetCandidate[] = [],
    callbacks: IGadgetActivationCallbacks = {}
  ): IGadgetActivationResult {
    const gadget = this.getSelectedGadget();

    if (this.remainingCharges <= 0) {
      return {
        activated: false,
        gadgetId: gadget.id,
        remainingCharges: 0,
        durationMs: 0,
        message: 'Plus aucune charge de Gadget disponible pour ce match.',
      };
    }

    if (this.cooldownRemainingMs > 0) {
      return {
        activated: false,
        gadgetId: gadget.id,
        remainingCharges: this.remainingCharges,
        durationMs: 0,
        message: 'Gadget en cours de rechargement.',
      };
    }

    if (gadget.id === 'GOMME_MAGIQUE') {
      const activeWrongTargets = targets.filter((t) => t.active && !t.is_correct);
      if (targets.length > 0 && activeWrongTargets.length === 0) {
        return {
          activated: false,
          gadgetId: gadget.id,
          remainingCharges: this.remainingCharges,
          durationMs: 0,
          message: 'Aucune mauvaise cible active à effacer.',
        };
      }

      const victim =
        activeWrongTargets[Math.floor(Math.random() * Math.max(1, activeWrongTargets.length))];

      this.remainingCharges -= 1;
      this.cooldownRemainingMs = gadget.cooldownMs;

      if (victim) {
        victim.active = false;
        callbacks.onRemoveWrongTarget?.(victim.id);
      }

      this.syncHudButton();
      return {
        activated: true,
        gadgetId: gadget.id,
        remainingCharges: this.remainingCharges,
        removedTargetId: victim?.id,
        durationMs: 0,
        message: victim
          ? `🧽 Gomme Magique : « ${victim.label} » effacé !`
          : '🧽 Gomme Magique activée (50/50) !',
      };
    }

    if (gadget.id === 'SABLIER_GELE') {
      this.remainingCharges -= 1;
      this.cooldownRemainingMs = gadget.cooldownMs;
      this.activeEffectRemainingMs = SABLIER_GELE_DURATION_MS;
      this.activeSlowdownMultiplier = SABLIER_GELE_SPEED_MULTIPLIER;
      callbacks.onApplySlowdown?.(SABLIER_GELE_SPEED_MULTIPLIER, SABLIER_GELE_DURATION_MS);
      this.syncHudButton();

      return {
        activated: true,
        gadgetId: gadget.id,
        remainingCharges: this.remainingCharges,
        targetSpeedMultiplier: SABLIER_GELE_SPEED_MULTIPLIER,
        durationMs: SABLIER_GELE_DURATION_MS,
        message: '⏳ Sablier Gelé : cibles ralenties pendant 4 secondes !',
      };
    }

    const correctTarget = targets.find((t) => t.active && t.is_correct);
    this.remainingCharges -= 1;
    this.cooldownRemainingMs = gadget.cooldownMs;
    this.activeEffectRemainingMs = gadget.durationMs;
    if (correctTarget) {
      callbacks.onHighlightCorrect?.(correctTarget.id, gadget.durationMs);
    }
    this.syncHudButton();

    return {
      activated: true,
      gadgetId: gadget.id,
      remainingCharges: this.remainingCharges,
      highlightedTargetId: correctTarget?.id,
      durationMs: gadget.durationMs,
      message: '🔍 Vision d’Élite : bonne cible illuminée !',
    };
  }

  /**
   * Monte le bouton vert de Gadget dans le HUD de combat.
   */
  public mountHudButton(container: HTMLElement, onTrigger: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-rpg-gadget-btn', 'true');
    button.style.cssText = `
      width:64px;height:64px;border-radius:50%;border:3px solid #ffffff;cursor:pointer;
      background:linear-gradient(145deg,#22c55e,#15803d);color:#ffffff;
      box-shadow:0 6px 18px rgba(34,197,94,0.55);display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:2px;font-weight:900;
      user-select:none;transition:transform 0.12s ease, opacity 0.15s ease;
    `;
    button.addEventListener('click', () => {
      onTrigger();
    });
    container.appendChild(button);
    this.hudButtonEl = button;
    this.syncHudButton();
    return button;
  }

  public syncHudButton(): void {
    if (!this.hudButtonEl) return;
    const snap = this.getHudSnapshot();
    this.hudButtonEl.disabled = !snap.canActivate;
    this.hudButtonEl.style.opacity = snap.canActivate ? '1' : '0.48';
    this.hudButtonEl.style.filter = snap.isEffectActive
      ? 'drop-shadow(0 0 12px #38bdf8)'
      : 'none';
    this.hudButtonEl.innerHTML = `
      <span style="font-size:20px;line-height:1;">${snap.gadget.icon}</span>
      <span style="font-size:10px;line-height:1;">${snap.remainingCharges}/${snap.maxCharges}</span>
    `;
    this.hudButtonEl.title = `${snap.gadget.name} (${snap.remainingCharges}/${snap.maxCharges})`;
  }
}
