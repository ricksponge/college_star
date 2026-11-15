import type { IEloUpdateResult, IQuestion, SubjectCategory } from '../types/cctp';

export const ELO_K_FACTOR = 32;
export const ELO_DEFAULT = 1000;
export const ELO_MIN = 600;
export const ELO_MAX = 1600;
export const FAST_REACTION_MS = 4000;
export const MEDIUM_REACTION_MS = 8000;
export const SPACED_REPETITION_MATCH_DELAY = 2;
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function clampElo(elo: number): number {
  return Math.max(ELO_MIN, Math.min(ELO_MAX, Math.round(elo)));
}

/**
 * S_attendu = 1 / (1 + 10^((D_question - E_k) / 400))
 */
export function computeExpectedScore(playerElo: number, questionDifficulty: number): number {
  return 1 / (1 + Math.pow(10, (questionDifficulty - playerElo) / 400));
}

/**
 * S_réel = 1 si bonne cible en < 4s, 0.7 entre 4s et 8s, 0 sinon.
 */
export function computeActualScore(
  isCorrectFirstTry: boolean,
  reactionTimeMs: number
): 0 | 0.7 | 1 {
  if (!isCorrectFirstTry) {
    return 0;
  }
  if (reactionTimeMs < FAST_REACTION_MS) {
    return 1;
  }
  if (reactionTimeMs <= MEDIUM_REACTION_MS) {
    return 0.7;
  }
  return 0;
}

/**
 * Met à jour le score de maîtrise caché E_k avec K = 32.
 */
export function updateSkillElo(
  skillCode: string,
  currentElo: number,
  questionDifficulty: number,
  isCorrectFirstTry: boolean,
  reactionTimeMs: number
): IEloUpdateResult {
  const previousElo = clampElo(currentElo);
  const expectedScore = computeExpectedScore(previousElo, questionDifficulty);
  const actualScore = computeActualScore(isCorrectFirstTry, reactionTimeMs);
  const delta = ELO_K_FACTOR * (actualScore - expectedScore);
  const newElo = clampElo(previousElo + delta);

  return {
    skill_code: skillCode,
    previous_elo: previousElo,
    new_elo: newElo,
    actual_score: actualScore,
    expected_score: Number(expectedScore.toFixed(4)),
    queued_for_spaced_repetition: actualScore === 0,
  };
}

/**
 * Ajuste la vitesse des cibles en temps réel selon le niveau Elo (0.75x à 1.45x).
 */
export function computeTargetSpeedMultiplier(eloRating: number): number {
  const clamped = clampElo(eloRating);
  const normalized = (clamped - ELO_MIN) / (ELO_MAX - ELO_MIN);
  return Number((0.75 + normalized * 0.7).toFixed(2));
}

export interface ISpacedRepetitionEntry {
  question: IQuestion;
  dueAtMatch: number;
  reviewStage: 'J+1' | 'J+3';
  dueAtTimestamp: number;
}

/**
 * File prioritaire de répétition espacée :
 * - Réapparition 2 parties plus tard (CCTP 6.2)
 * - Cycles de révision espacée J+1 puis J+3
 */
export class SpacedRepetitionQueue {
  private entries: ISpacedRepetitionEntry[] = [];

  public enqueueFailedQuestion(
    question: IQuestion,
    currentMatchIndex = 0,
    nowMs = Date.now(),
    reviewStage: 'J+1' | 'J+3' = 'J+1'
  ): void {
    const exists = this.entries.some((e) => e.question.id === question.id);
    if (exists) {
      return;
    }

    const dayOffset = reviewStage === 'J+1' ? ONE_DAY_MS : 3 * ONE_DAY_MS;
    this.entries.push({
      question,
      dueAtMatch: currentMatchIndex + SPACED_REPETITION_MATCH_DELAY,
      reviewStage,
      dueAtTimestamp: nowMs + dayOffset,
    });
  }

  public popDueQuestion(
    subject?: SubjectCategory,
    currentMatchIndex = 0,
    nowMs = Date.now()
  ): IQuestion | null {
    const idx = this.entries.findIndex((entry) => {
      if (subject && entry.question.subject !== subject) {
        return false;
      }
      return currentMatchIndex >= entry.dueAtMatch || nowMs >= entry.dueAtTimestamp;
    });

    if (idx === -1) {
      return null;
    }

    const [item] = this.entries.splice(idx, 1);
    return item.question;
  }

  public promotePassedReview(
    question: IQuestion,
    previousStage: 'J+1' | 'J+3',
    currentMatchIndex = 0,
    nowMs = Date.now()
  ): void {
    if (previousStage === 'J+1') {
      this.enqueueFailedQuestion(question, currentMatchIndex, nowMs, 'J+3');
    }
  }

  public getPendingCount(): number {
    return this.entries.length;
  }

  public getEntries(): readonly ISpacedRepetitionEntry[] {
    return this.entries;
  }
}
