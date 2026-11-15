import type {
  IEloUpdateResult,
  IQuestion,
  IQuestionTarget,
  ISubjectVisualMeta,
  SubjectCategory,
} from '../types/cctp';
import { INITIAL_QUESTIONS_200 } from '../data/questionsBank';
import { PREVENTION_QUESTIONS_100 } from './PreventionQuestionBank';

export const ALL_QUESTIONS_300: IQuestion[] = [
  ...INITIAL_QUESTIONS_200,
  ...PREVENTION_QUESTIONS_100,
];
import {
  computeTargetSpeedMultiplier,
  ELO_DEFAULT,
  ELO_MIN,
  isConfidenceBoostNeeded,
  type ISpacedRepetitionEntry,
  SpacedRepetitionQueue,
  updateSkillElo,
} from './EloEngine';

export const SUBJECT_VISUAL_META: Record<SubjectCategory, ISubjectVisualMeta> = {
  mathematiques: {
    subject: 'mathematiques',
    short_label: 'Maths',
    icon: '🧮',
    accent_color: '#facc15',
    badge_bg: 'rgba(250, 204, 21, 0.18)',
  },
  francais: {
    subject: 'francais',
    short_label: 'Français',
    icon: '📘',
    accent_color: '#c084fc',
    badge_bg: 'rgba(192, 132, 252, 0.18)',
  },
  anglais: {
    subject: 'anglais',
    short_label: 'Anglais',
    icon: '🇬🇧',
    accent_color: '#22d3ee',
    badge_bg: 'rgba(34, 211, 238, 0.18)',
  },
  histoire_geo_sciences: {
    subject: 'histoire_geo_sciences',
    short_label: 'Hist-Géo / Sci.',
    icon: '🌍',
    accent_color: '#4ade80',
    badge_bg: 'rgba(74, 222, 128, 0.18)',
  },
  vie_au_college: {
    subject: 'vie_au_college',
    short_label: 'Collège 6e',
    icon: '🏫',
    accent_color: '#38bdf8',
    badge_bg: 'rgba(56, 189, 248, 0.18)',
  },
};

/**
 * Retourne les métadonnées visuelles (icône, libellé court et couleurs) d'une matière.
 */
export function getSubjectVisualMeta(subject: SubjectCategory): ISubjectVisualMeta {
  return SUBJECT_VISUAL_META[subject] ?? SUBJECT_VISUAL_META.vie_au_college;
}

const QUICK_HINT_MAX_LENGTH = 90;
const EMOJI_PATTERN = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u;

export interface INextQuestionParams {
  subject?: SubjectCategory;
  targetElo?: number;
  currentMatchIndex?: number;
  preferSkillCode?: string;
}

/**
 * Service local QuestionProvider alimenté par le corpus JSON des questions
 * et couplé en temps réel à l'algorithme d'Elo Pédagogique + Répétition Espacée.
 */
export class QuestionProvider {
  private readonly questions: IQuestion[];
  private readonly spacedQueue = new SpacedRepetitionQueue();
  private readonly recentIds: string[] = [];
  private readonly pendingReviewStages = new Map<string, 'J+1' | 'J+3'>();
  private consecutiveFailures = 0;

  constructor(questions: IQuestion[] = ALL_QUESTIONS_300) {
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

  public getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  public hydrateSpacedQueue(entries: ISpacedRepetitionEntry[]): void {
    this.pendingReviewStages.clear();
    this.spacedQueue.hydrate(entries);
  }

  public serializeSpacedQueue(): ISpacedRepetitionEntry[] {
    return this.spacedQueue.serialize();
  }

  public getTargetSpeedMultiplier(eloRating: number): number {
    const base = computeTargetSpeedMultiplier(eloRating);
    if (isConfidenceBoostNeeded(this.consecutiveFailures)) {
      return Number(Math.max(0.65, base - 0.1).toFixed(2));
    }
    return base;
  }

  /**
   * Retourne une version concise et motivante de `explanation_flash`
   * (préfixée par `💡 ` si aucun emoji n'est présent, tronquée proprement si > 90 caractères).
   */
  public getQuickHint(question: IQuestion): string {
    const cleaned = (question.explanation_flash ?? '').replace(/\s+/g, ' ').trim();
    if (!cleaned) {
      return '💡 Observe bien la consigne et fonce sur la bonne cible !';
    }

    const withPrefix = EMOJI_PATTERN.test(cleaned) ? cleaned : `💡 ${cleaned}`;
    if (withPrefix.length <= QUICK_HINT_MAX_LENGTH) {
      return withPrefix;
    }

    const limit = QUICK_HINT_MAX_LENGTH - 1;
    const rawSlice = withPrefix.slice(0, limit);
    const lastSpace = rawSlice.lastIndexOf(' ');
    const cutIndex = lastSpace > 20 ? lastSpace : limit;
    let truncated = rawSlice.slice(0, cutIndex).trimEnd();

    // Évite de couper un emoji encodé en paire de substitution UTF-16
    const lastCodeUnit = truncated.charCodeAt(truncated.length - 1);
    if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) {
      truncated = truncated.slice(0, -1);
    }

    truncated = truncated.replace(/[,;:\-–]+$/, '').trimEnd();
    return `${truncated}…`;
  }

  /**
   * Sélectionne la prochaine question adaptée au niveau Elo du joueur
   * en priorisant les questions échouées dans la file de répétition espacée,
   * avec rampe d'accueil progressive sur les 3 premières questions
   * et filet de confiance automatique après 2 erreurs consécutives.
   */
  public getNextQuestion(params: INextQuestionParams = {}): IQuestion {
    const {
      subject,
      targetElo = ELO_DEFAULT,
      currentMatchIndex = 0,
      preferSkillCode,
    } = params;

    const confidenceBoost = isConfidenceBoostNeeded(this.consecutiveFailures);
    let effectiveTargetElo = confidenceBoost
      ? Math.max(ELO_MIN, targetElo - 140)
      : targetElo;
    if (this.recentIds.length < 3) {
      effectiveTargetElo = Math.min(effectiveTargetElo, 980);
    }

    if (!confidenceBoost) {
      const dueEntry = this.spacedQueue.popDueEntry(subject, currentMatchIndex);
      if (dueEntry) {
        let chosenReview = dueEntry.question;

        const sisters = this.questions.filter(
          (q) =>
            q.skill_code === dueEntry.question.skill_code &&
            q.id !== dueEntry.question.id &&
            !this.recentIds.includes(q.id) &&
            (!subject || q.subject === subject)
        );
        if (sisters.length > 0) {
          chosenReview =
            this.pickClosestByElo(sisters, effectiveTargetElo, 3) ?? dueEntry.question;
        }

        this.pendingReviewStages.set(chosenReview.id, dueEntry.reviewStage);
        this.rememberId(chosenReview.id);
        return this.withShuffledTargets(chosenReview);
      }
    }

    const pool = subject ? this.getQuestionsBySubject(subject) : this.questions;
    const candidates = pool.filter((q) => !this.recentIds.includes(q.id));
    const effectivePool = candidates.length > 0 ? candidates : pool;

    const preferredPool =
      !confidenceBoost && preferSkillCode
        ? effectivePool.filter((q) => q.skill_code === preferSkillCode)
        : [];
    const selectionPool = preferredPool.length > 0 ? preferredPool : effectivePool;

    const chosen =
      this.pickClosestByElo(selectionPool, effectiveTargetElo, 6) ?? this.questions[0];

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
    if (isCorrect) {
      this.consecutiveFailures = 0;
    } else {
      this.consecutiveFailures += 1;
    }

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
