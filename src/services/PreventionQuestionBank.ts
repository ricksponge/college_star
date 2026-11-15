import type { IQuestion } from '../types/cctp';
import rawPreventionQuestions from '../data/questions-prevention.json';

export type PreventionThemeId =
  | 'PREV_HARCELEMENT'
  | 'PREV_INTIMITE'
  | 'PREV_ECOUTE'
  | 'PREV_NEURO_HANDICAP';

export interface IPreventionThemeMeta {
  id: PreventionThemeId;
  label: string;
  shortLabel: string;
  icon: string;
  accentColor: string;
  protectiveMessage: string;
  helplineNumber?: '3018' | '119' | '3114';
}

export const PREVENTION_THEMES_META: Record<PreventionThemeId, IPreventionThemeMeta> = {
  PREV_HARCELEMENT: {
    id: 'PREV_HARCELEMENT',
    label: 'Harcèlement & Cyberharcèlement',
    shortLabel: 'Anti-Harcèlement',
    icon: '🛡️',
    accentColor: '#38bdf8',
    protectiveMessage:
      'Personne n’a à subir de moqueries répétées : en parler à un adulte ou au 3018 protège tout le monde.',
    helplineNumber: '3018',
  },
  PREV_INTIMITE: {
    id: 'PREV_INTIMITE',
    label: 'Intimité, Limites & Protection',
    shortLabel: 'Limites & Respect',
    icon: '💙',
    accentColor: '#60a5fa',
    protectiveMessage:
      'Ton corps t’appartient : tu as toujours le droit de dire NON et d’alerter un adulte ou le 119.',
    helplineNumber: '119',
  },
  PREV_ECOUTE: {
    id: 'PREV_ECOUTE',
    label: 'Santé Mentale & Écoute',
    shortLabel: 'Écoute & Sérénité',
    icon: '🌱',
    accentColor: '#4ade80',
    protectiveMessage:
      'Toutes les émotions méritent d’être entendues : ne reste jamais seul, parle à un proche ou au 3114.',
    helplineNumber: '3114',
  },
  PREV_NEURO_HANDICAP: {
    id: 'PREV_NEURO_HANDICAP',
    label: 'Handicap & Neurodiversité (TSA/TDAH/Dys)',
    shortLabel: 'Neuro-Inclusion',
    icon: '🧩',
    accentColor: '#c084fc',
    protectiveMessage:
      'Chacun pense et apprend à sa manière : les aménagements (AESH, PAP, PPS) garantissent l’équité.',
  },
};

/**
 * Corpus officiel de 100 scénarios QCM bienveillants de prévention et d'inclusion (M8).
 */
export const PREVENTION_QUESTIONS_100: readonly IQuestion[] =
  rawPreventionQuestions as IQuestion[];

/**
 * Chargeur et sélecteur adaptatif de la banque de prévention 10-12 ans (Agent 17).
 */
export class PreventionQuestionBank {
  private readonly questions: readonly IQuestion[];
  private readonly recentIds: string[] = [];

  constructor(questions: readonly IQuestion[] = PREVENTION_QUESTIONS_100) {
    this.questions = questions;
  }

  public getAllQuestions(): readonly IQuestion[] {
    return this.questions;
  }

  public getQuestionsByTheme(theme: PreventionThemeId): IQuestion[] {
    return this.questions.filter((q) => q.skill_code === theme);
  }

  public getThemeMeta(theme: PreventionThemeId): IPreventionThemeMeta {
    return PREVENTION_THEMES_META[theme];
  }

  public getCountsByTheme(): Record<PreventionThemeId, number> {
    return {
      PREV_HARCELEMENT: this.getQuestionsByTheme('PREV_HARCELEMENT').length,
      PREV_INTIMITE: this.getQuestionsByTheme('PREV_INTIMITE').length,
      PREV_ECOUTE: this.getQuestionsByTheme('PREV_ECOUTE').length,
      PREV_NEURO_HANDICAP: this.getQuestionsByTheme('PREV_NEURO_HANDICAP').length,
    };
  }

  public getQuestionById(id: string): IQuestion | undefined {
    return this.questions.find((q) => q.id === id);
  }

  /**
   * Tire un scénario bienveillant adapté au thème demandé et proche du niveau Elo cible.
   */
  public getNextScenario(params?: {
    theme?: PreventionThemeId;
    targetElo?: number;
  }): IQuestion {
    const pool = params?.theme ? this.getQuestionsByTheme(params.theme) : [...this.questions];
    const effectivePool = pool.length > 0 ? pool : [...this.questions];
    const freshPool = effectivePool.filter((q) => !this.recentIds.includes(q.id));
    const candidates = freshPool.length > 0 ? freshPool : effectivePool;
    const targetElo = params?.targetElo ?? 950;

    const sorted = [...candidates].sort(
      (a, b) => Math.abs(a.elo_difficulty - targetElo) - Math.abs(b.elo_difficulty - targetElo)
    );
    const slice = sorted.slice(0, Math.min(5, sorted.length));
    const chosen = slice[Math.floor(Math.random() * slice.length)] ?? this.questions[0];

    this.recentIds.push(chosen.id);
    if (this.recentIds.length > 20) {
      this.recentIds.shift();
    }

    return {
      ...chosen,
      targets: chosen.targets.map((t) => ({ ...t })),
    };
  }
}
