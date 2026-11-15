import type { IEloUpdateResult, IQuestion, IQuestionTarget, SubjectCategory } from '../types/cctp';
import { INITIAL_QUESTIONS_200 } from '../data/questionsBank';
import {
  computeTargetSpeedMultiplier,
  ELO_DEFAULT,
  type ISpacedRepetitionEntry,
  SpacedRepetitionQueue,
  updateSkillElo,
} from './EloEngine';

export interface INextQuestionParams {
  subject?: SubjectCategory;
  targetElo?: number;
  currentMatchIndex?: number;
  preferSkillCode?: string;
}

/**
 * Service local QuestionProvider alimenté par le corpus JSON des 200 questions
 * et couplé en temps réel à l'algorithme d'Elo Pédagogique + Répétition Espacée.
 */
export class QuestionProvider {
  private readonly questions: IQuestion[];
  private readonly spacedQueue = new SpacedRepetitionQueue();
  private readonly recentIds: string[] = [];
  private readonly pendingReviewStages = new Map<string, 'J+1' | 'J+3'>();

  constructor(questions: IQuestion[] = INITIAL_QUESTIONS_200) {
    this.questions = questions;
  }

  public getAllQuestions(): IQuestion[] {
    return this.questions;
  }

  public getQuestionsBySubject(subject: SubjectCategory): IQuestion[] {
    return this.questions.filter((q) => q.subject === subject);
  }

  public getQuestionById(id: string): IQuestion | undefined {
    return this.questions.find((q) => q.id === id);
  }

  public getSpacedRepetitionQueue(): SpacedRepetitionQueue {
    return this.spacedQueue;
  }

  public hydrateSpacedQueue(entries: ISpacedRepetitionEntry[]): void {
    this.pendingReviewStages.clear();
    this.spacedQueue.hydrate(entries);
  }

  public serializeSpacedQueue(): ISpacedRepetitionEntry[] {
    return this.spacedQueue.serialize();
  }

  public getTargetSpeedMultiplier(eloRating: number): number {
    return computeTargetSpeedMultiplier(eloRating);
  }

  /**
   * Sélectionne la prochaine question adaptée au niveau Elo du joueur
   * en priorisant les questions échouées dans la file de répétition espacée.
   */
  public getNextQuestion(params: INextQuestionParams = {}): IQuestion {
    const {
      subject,
      targetElo = ELO_DEFAULT,
      currentMatchIndex = 0,
      preferSkillCode,
    } = params;

    const dueEntry = this.spacedQueue.popDueEntry(subject, currentMatchIndex);
    if (dueEntry) {
      let chosenReview = dueEntry.question;

      if (dueEntry.reviewStage === 'J+1') {
        const sisters = this.questions.filter(
          (q) =>
            q.skill_code === dueEntry.question.skill_code &&
            q.id !== dueEntry.question.id &&
            (!subject || q.subject === subject)
        );
        if (sisters.length > 0) {
          const freshSisters = sisters.filter((q) => !this.recentIds.includes(q.id));
          const sisterPool = freshSisters.length > 0 ? freshSisters : sisters;
          chosenReview =
            this.pickClosestByElo(sisterPool, targetElo, 3) ?? dueEntry.question;
        }
      }

      this.pendingReviewStages.set(chosenReview.id, dueEntry.reviewStage);
      this.rememberId(chosenReview.id);
      return this.withShuffledTargets(chosenReview);
    }

    const pool = subject ? this.getQuestionsBySubject(subject) : this.questions;
    const candidates = pool.filter((q) => !this.recentIds.includes(q.id));
    const effectivePool = candidates.length > 0 ? candidates : pool;

    const preferredPool = preferSkillCode
      ? effectivePool.filter((q) => q.skill_code === preferSkillCode)
      : [];
    const selectionPool = preferredPool.length > 0 ? preferredPool : effectivePool;

    const chosen = this.pickClosestByElo(selectionPool, targetElo, 6) ?? this.questions[0];

    this.rememberId(chosen.id);
    return this.withShuffledTargets(chosen);
  }

  /**
   * Enregistre une interaction en arène, met à jour l'Elo K=32 et alimente la file espacée.
   */
  public registerAttempt(
    question: IQuestion,
    currentElo: number,
    isCorrect: boolean,
    reactionTimeMs: number,
    currentMatchIndex = 0
  ): IEloUpdateResult {
    const result = updateSkillElo(
      question.skill_code,
      currentElo,
      question.elo_difficulty,
      isCorrect,
      reactionTimeMs
    );

    const pendingStage = this.pendingReviewStages.get(question.id);
    this.pendingReviewStages.delete(question.id);

    if (result.queued_for_spaced_repetition) {
      this.spacedQueue.enqueueFailedQuestion(question, currentMatchIndex);
    } else if (pendingStage === 'J+1' && result.actual_score >= 0.7) {
      this.spacedQueue.promotePassedReview(question, 'J+1', currentMatchIndex);
    }

    return result;
  }

  private pickClosestByElo(
    pool: readonly IQuestion[],
    targetElo: number,
    topSliceCount: number
  ): IQuestion | undefined {
    if (pool.length === 0) {
      return undefined;
    }
    const sorted = [...pool].sort(
      (a, b) =>
        Math.abs(a.elo_difficulty - targetElo) - Math.abs(b.elo_difficulty - targetElo)
    );
    const topSlice = sorted.slice(0, Math.min(topSliceCount, sorted.length));
    return topSlice[Math.floor(Math.random() * topSlice.length)];
  }

  private rememberId(id: string): void {
    this.recentIds.push(id);
    if (this.recentIds.length > 15) {
      this.recentIds.shift();
    }
  }

  private withShuffledTargets(question: IQuestion): IQuestion {
    const shuffled: IQuestionTarget[] = [...question.targets];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = tmp;
    }
    return {
      ...question,
      targets: shuffled,
    };
  }
}
