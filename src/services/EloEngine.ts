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
 * Indique si l'élève traverse une série d'échecs nécessitant une question de confiance.
 */
export function isConfidenceBoostNeeded(consecutiveFailures: number): boolean {
  return consecutiveFailures >= 2;
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

const VALID_SUBJECTS: ReadonlySet<string> = new Set<SubjectCategory>([
  'mathematiques',
  'francais',
  'anglais',
  'histoire_geo_sciences',
  'vie_au_college',
]);

function cloneQuestion(question: IQuestion): IQuestion {
  return {
    ...question,
    targets: question.targets.map((target) => ({ ...target })),
  };
}

function cloneSpacedEntry(entry: ISpacedRepetitionEntry): ISpacedRepetitionEntry {
  return {
    question: cloneQuestion(entry.question),
    dueAtMatch: entry.dueAtMatch,
    reviewStage: entry.reviewStage,
    dueAtTimestamp: entry.dueAtTimestamp,
  };
}

function isValidQuestion(value: unknown): value is IQuestion {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const q = value as Partial<IQuestion>;
  return (
    typeof q.id === 'string' &&
    q.id.length > 0 &&
    typeof q.subject === 'string' &&
    VALID_SUBJECTS.has(q.subject) &&
    typeof q.skill_code === 'string' &&
    q.skill_code.length > 0 &&
    typeof q.elo_difficulty === 'number' &&
    Number.isFinite(q.elo_difficulty) &&
    typeof q.hud_prompt === 'string' &&
    typeof q.explanation_flash === 'string' &&
    Array.isArray(q.targets) &&
    q.targets.length > 0 &&
    q.targets.every(
      (t) =>
        typeof t === 'object' &&
        t !== null &&
        typeof t.label === 'string' &&
        typeof t.is_correct === 'boolean'
    )
  );
}

function isValidSpacedEntry(value: unknown): value is ISpacedRepetitionEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entry = value as Partial<ISpacedRepetitionEntry>;
  return (
    isValidQuestion(entry.question) &&
    typeof entry.dueAtMatch === 'number' &&
    Number.isFinite(entry.dueAtMatch) &&
    (entry.reviewStage === 'J+1' || entry.reviewStage === 'J+3') &&
    typeof entry.dueAtTimestamp === 'number' &&
    Number.isFinite(entry.dueAtTimestamp)
  );
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
      question: cloneQuestion(question),
      dueAtMatch: currentMatchIndex + SPACED_REPETITION_MATCH_DELAY,
      reviewStage,
      dueAtTimestamp: nowMs + dayOffset,
    });
  }

  public serialize(): ISpacedRepetitionEntry[] {
    return this.entries.map((entry) => cloneSpacedEntry(entry));
  }

  public hydrate(entries: ISpacedRepetitionEntry[]): void {
    if (!Array.isArray(entries)) {
      this.entries = [];
      return;
    }

    const seenIds = new Set<string>();
    const hydrated: ISpacedRepetitionEntry[] = [];
    for (const candidate of entries) {
      if (!isValidSpacedEntry(candidate)) {
        continue;
      }
      if (seenIds.has(candidate.question.id)) {
        continue;
      }
      seenIds.add(candidate.question.id);
      hydrated.push(cloneSpacedEntry(candidate));
    }

    this.entries = hydrated;
  }

  public popDueEntry(
    subject?: SubjectCategory,
    currentMatchIndex = 0,
    nowMs = Date.now()
  ): ISpacedRepetitionEntry | null {
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
    return item;
  }

  public popDueQuestion(
    subject?: SubjectCategory,
    currentMatchIndex = 0,
    nowMs = Date.now()
  ): IQuestion | null {
    return this.popDueEntry(subject, currentMatchIndex, nowMs)?.question ?? null;
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
