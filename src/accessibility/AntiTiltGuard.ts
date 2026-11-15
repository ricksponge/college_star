import type { IQuestion, SubjectCategory } from '../types/cctp';

export const ANTI_TILT_ERROR_THRESHOLD = 3;

export interface IAntiTiltSnapshot {
  consecutiveErrors: number;
  totalErrorsInMatch: number;
  isProtectionActive: boolean;
  targetSpeedMultiplier: number;
  errorDamageMultiplier: number;
  shouldRemoveOneDecoy: boolean;
  confidenceModeRemainingQuestions: number;
  reassuranceMessage: string | null;
}

export interface IConfidenceQuestionPick {
  question: IQuestion;
  isConfidenceBoost: boolean;
  reassuranceMessage: string | null;
  targetSpeedMultiplier: number;
}

const REASSURANCE_MESSAGES: readonly string[] = [
  'Respire ! Voici un défi accessible pour reprendre confiance 💪',
  'Pas de panique : les cibles ralentissent, prends ton temps 🎯',
  'Tu vas y arriver ! Observe bien les mots-clés en couleur 🌟',
];

/**
 * Système Anti-Frustration & Anti-Tilt (Agent 16 - Neuro-Ergonomie).
 * Après 3 erreurs consécutives, ralentit dynamiquement la vitesse des cibles,
 * atténue la pénalité de dégâts et sélectionne une question de confiance
 * adaptée pour éviter tout découragement.
 */
export class AntiTiltGuard {
  private consecutiveErrors = 0;
  private totalErrorsInMatch = 0;
  private confidenceModeRemainingQuestions = 0;
  private recentFailedIds = new Set<string>();

  public reset(): void {
    this.consecutiveErrors = 0;
    this.totalErrorsInMatch = 0;
    this.confidenceModeRemainingQuestions = 0;
    this.recentFailedIds.clear();
  }

  public recordAttempt(isCorrect: boolean, questionId?: string): IAntiTiltSnapshot {
    if (isCorrect) {
      this.consecutiveErrors = 0;
      if (this.confidenceModeRemainingQuestions > 0) {
        this.confidenceModeRemainingQuestions -= 1;
      }
      return this.getSnapshot();
    }

    this.consecutiveErrors += 1;
    this.totalErrorsInMatch += 1;
    if (questionId) {
      this.recentFailedIds.add(questionId);
    }

    if (this.consecutiveErrors >= ANTI_TILT_ERROR_THRESHOLD) {
      this.confidenceModeRemainingQuestions = Math.max(
        this.confidenceModeRemainingQuestions,
        2
      );
    }

    return this.getSnapshot();
  }

  public isProtectionActive(): boolean {
    return (
      this.consecutiveErrors >= ANTI_TILT_ERROR_THRESHOLD ||
      this.confidenceModeRemainingQuestions > 0
    );
  }

  public getTargetSpeedMultiplier(): number {
    if (this.consecutiveErrors >= 5) {
      return 0.62;
    }
    if (this.consecutiveErrors >= ANTI_TILT_ERROR_THRESHOLD) {
      return 0.72;
    }
    if (this.confidenceModeRemainingQuestions > 0) {
      return 0.82;
    }
    return 1.0;
  }

  public getErrorDamageMultiplier(): number {
    return this.isProtectionActive() ? 0.5 : 1.0;
  }

  public getSnapshot(): IAntiTiltSnapshot {
    const active = this.isProtectionActive();
    const messageIndex = this.totalErrorsInMatch % REASSURANCE_MESSAGES.length;
    return {
      consecutiveErrors: this.consecutiveErrors,
      totalErrorsInMatch: this.totalErrorsInMatch,
      isProtectionActive: active,
      targetSpeedMultiplier: this.getTargetSpeedMultiplier(),
      errorDamageMultiplier: this.getErrorDamageMultiplier(),
      shouldRemoveOneDecoy: this.consecutiveErrors >= ANTI_TILT_ERROR_THRESHOLD,
      confidenceModeRemainingQuestions: this.confidenceModeRemainingQuestions,
      reassuranceMessage: active ? REASSURANCE_MESSAGES[messageIndex] : null,
    };
  }

  /**
   * Sélectionne une question de confiance (Elo abaissé, hors questions récemment ratées)
   * lorsque la protection Anti-Tilt est active.
   */
  public selectNextQuestion(
    pool: readonly IQuestion[],
    currentElo = 1000,
    subject?: SubjectCategory
  ): IConfidenceQuestionPick {
    const subjectPool = subject ? pool.filter((q) => q.subject === subject) : [...pool];
    const effectivePool = subjectPool.length > 0 ? subjectPool : [...pool];

    if (effectivePool.length === 0) {
      throw new Error('AntiTiltGuard.selectNextQuestion: question pool cannot be empty.');
    }

    const active = this.isProtectionActive();
    const speedMultiplier = this.getTargetSpeedMultiplier();

    if (!active) {
      const normalSorted = [...effectivePool].sort(
        (a, b) =>
          Math.abs(a.elo_difficulty - currentElo) -
          Math.abs(b.elo_difficulty - currentElo)
      );
      return {
        question: normalSorted[0],
        isConfidenceBoost: false,
        reassuranceMessage: null,
        targetSpeedMultiplier: speedMultiplier,
      };
    }

    const comfortTargetElo = Math.max(600, currentElo - 150);
    const nonFailed = effectivePool.filter((q) => !this.recentFailedIds.has(q.id));
    const candidates = nonFailed.length > 0 ? nonFailed : effectivePool;

    // Priorise les questions faciles / courtes pour garantir un succès rapide
    const ranked = [...candidates].sort((a, b) => {
      const eloDeltaA = Math.abs(a.elo_difficulty - comfortTargetElo) + (a.elo_difficulty > currentElo ? 220 : 0);
      const eloDeltaB = Math.abs(b.elo_difficulty - comfortTargetElo) + (b.elo_difficulty > currentElo ? 220 : 0);
      if (eloDeltaA !== eloDeltaB) {
        return eloDeltaA - eloDeltaB;
      }
      return a.hud_prompt.length - b.hud_prompt.length;
    });

    const chosen = ranked[0];
    const snap = this.getSnapshot();

    return {
      question: chosen,
      isConfidenceBoost: true,
      reassuranceMessage: snap.reassuranceMessage,
      targetSpeedMultiplier: speedMultiplier,
    };
  }
}
