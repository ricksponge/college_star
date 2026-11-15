import type { IDailyQuest, ISkillMastery, SubjectCategory } from '../types/cctp';
import type { LocalSQLiteDB } from '../db/LocalSQLiteDB';
import { getSubjectVisualMeta } from '../services/QuestionProvider';

export type QuestDifficultyTier = 'DECOUVERTE' | 'RENFORCEMENT' | 'MAITRISE';

export interface ISubjectEloSnapshot {
  subject: SubjectCategory;
  average_elo: number;
  weakest_skill_code: string;
  weakest_elo: number;
  attempts_count: number;
}

export interface IDynamicDailyQuest extends IDailyQuest {
  target_subject: SubjectCategory;
  focus_skill_codes: string[];
  subject_avg_elo: number;
  pass_tokens_reward: number;
  difficulty_tier: QuestDifficultyTier;
  date_key: string;
  description: string;
}

export interface IQuestClaimResult {
  claimed: boolean;
  questId: string;
  coins: number;
  stars: number;
  passTokens: number;
}

const STORAGE_KEY = 'brawl_college_liveops_quests_v1';

const ALL_SUBJECTS: SubjectCategory[] = [
  'mathematiques',
  'francais',
  'anglais',
  'histoire_geo_sciences',
  'vie_au_college',
];

interface IPersistedLiveOpsQuests {
  date_key: string;
  quests: IDynamicDailyQuest[];
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Générateur de 3 quêtes quotidiennes dynamiques (Agent 13 - Live-Ops).
 * Analyse l'Elo par matière dans SQLite et cible en priorité les notions
 * les plus faibles afin de transformer chaque session en progression ciblée.
 */
export class QuestGenerator {
  private readonly db: LocalSQLiteDB | null;
  private quests: IDynamicDailyQuest[] = [];
  private activeDateKey: string;

  constructor(db: LocalSQLiteDB | null = null, now: Date = new Date()) {
    this.db = db;
    this.activeDateKey = formatDateKey(now);
    const loaded = this.loadFromStorage();
    if (loaded && loaded.date_key === this.activeDateKey && loaded.quests.length === 3) {
      this.quests = loaded.quests;
    } else {
      this.quests = this.generateDailyQuests({ date: now });
    }
  }

  /**
   * Classe les 5 matières du programme par Elo moyen croissant (les plus faibles d'abord).
   */
  public rankSubjectsByLowestElo(masteriesInput?: ISkillMastery[]): ISubjectEloSnapshot[] {
    const masteries = masteriesInput ?? this.db?.getAllSkillMasteries() ?? [];
    const snapshots: ISubjectEloSnapshot[] = ALL_SUBJECTS.map((subject) => {
      const entries = masteries.filter((m) => m.subject_category === subject);
      if (entries.length === 0) {
        return {
          subject,
          average_elo: 1000,
          weakest_skill_code: `${subject.toUpperCase()}_BASE`,
          weakest_elo: 1000,
          attempts_count: 0,
        };
      }

      const sortedByElo = [...entries].sort((a, b) => a.elo_rating - b.elo_rating);
      const totalElo = entries.reduce((sum, item) => sum + item.elo_rating, 0);
      const totalAttempts = entries.reduce((sum, item) => sum + item.attempts_count, 0);

      return {
        subject,
        average_elo: Math.round(totalElo / entries.length),
        weakest_skill_code: sortedByElo[0].skill_code,
        weakest_elo: sortedByElo[0].elo_rating,
        attempts_count: totalAttempts,
      };
    });

    return snapshots.sort((a, b) => {
      if (a.average_elo !== b.average_elo) {
        return a.average_elo - b.average_elo;
      }
      if (a.weakest_elo !== b.weakest_elo) {
        return a.weakest_elo - b.weakest_elo;
      }
      return a.attempts_count - b.attempts_count;
    });
  }

  /**
   * Génère 3 quêtes quotidiennes ciblant en priorité les matières où l'Elo est le plus bas.
   */
  public generateDailyQuests(options?: {
    masteries?: ISkillMastery[];
    date?: Date;
    forceRefresh?: boolean;
  }): IDynamicDailyQuest[] {
    const targetDate = options?.date ?? new Date();
    const dateKey = formatDateKey(targetDate);

    if (
      !options?.forceRefresh &&
      this.quests.length === 3 &&
      this.activeDateKey === dateKey
    ) {
      return this.getActiveQuests();
    }

    const masteries = options?.masteries ?? this.db?.getAllSkillMasteries() ?? [];
    const rankedSubjects = this.rankSubjectsByLowestElo(masteries);

    const primaryWeak = rankedSubjects[0];
    const secondaryWeak = rankedSubjects[1] ?? rankedSubjects[0];
    const tertiaryFocus = rankedSubjects[2] ?? primaryWeak;

    const getFocusCodes = (subject: SubjectCategory): string[] =>
      masteries
        .filter((m) => m.subject_category === subject)
        .sort((a, b) => a.elo_rating - b.elo_rating)
        .slice(0, 2)
        .map((m) => m.skill_code);

    const primaryMeta = getSubjectVisualMeta(primaryWeak.subject);
    const secondaryMeta = getSubjectVisualMeta(secondaryWeak.subject);
    const tertiaryMeta = getSubjectVisualMeta(tertiaryFocus.subject);

    const primaryTier = this.resolveDifficultyTier(primaryWeak.average_elo);
    const secondaryTier = this.resolveDifficultyTier(secondaryWeak.average_elo);
    const tertiaryTier = this.resolveDifficultyTier(tertiaryFocus.average_elo);

    const hitsTarget = primaryTier === 'DECOUVERTE' ? 6 : primaryTier === 'RENFORCEMENT' ? 8 : 10;
    const reflexTarget = secondaryTier === 'DECOUVERTE' ? 3 : 4;
    const winsTarget = 2;

    const generated: IDynamicDailyQuest[] = [
      {
        id: `liveops_${dateKey}_1_${primaryWeak.subject}`,
        title: `${primaryMeta.icon} ${primaryMeta.short_label} : ${hitsTarget} bonnes cibles`,
        description: `Consolide tes points en ${primaryMeta.short_label} (Elo moyen ${primaryWeak.average_elo}).`,
        target: hitsTarget,
        progress: 0,
        reward_coins: 90,
        reward_stars: 1,
        claimed: false,
        kind: 'CORRECT_HITS',
        target_subject: primaryWeak.subject,
        focus_skill_codes: getFocusCodes(primaryWeak.subject),
        subject_avg_elo: primaryWeak.average_elo,
        pass_tokens_reward: 50,
        difficulty_tier: primaryTier,
        date_key: dateKey,
      },
      {
        id: `liveops_${dateKey}_2_${secondaryWeak.subject}`,
        title: `${secondaryMeta.icon} ${secondaryMeta.short_label} : ${reflexTarget} tirs Réflexe`,
        description: `Touche la bonne réponse en moins de 2,5s en ${secondaryMeta.short_label}.`,
        target: reflexTarget,
        progress: 0,
        reward_coins: 110,
        reward_stars: 1,
        claimed: false,
        kind: 'FAST_REFLEX',
        target_subject: secondaryWeak.subject,
        focus_skill_codes: getFocusCodes(secondaryWeak.subject),
        subject_avg_elo: secondaryWeak.average_elo,
        pass_tokens_reward: 60,
        difficulty_tier: secondaryTier,
        date_key: dateKey,
      },
      {
        id: `liveops_${dateKey}_3_${tertiaryFocus.subject}`,
        title: `${tertiaryMeta.icon} Défi ${tertiaryMeta.short_label} : ${winsTarget} victoires`,
        description: `Remporte ${winsTarget} matchs pour booster ton Passe de Rentrée.`,
        target: winsTarget,
        progress: 0,
        reward_coins: 140,
        reward_stars: 2,
        claimed: false,
        kind: 'MATCH_WINS',
        target_subject: tertiaryFocus.subject,
        focus_skill_codes: getFocusCodes(tertiaryFocus.subject),
        subject_avg_elo: tertiaryFocus.average_elo,
        pass_tokens_reward: 75,
        difficulty_tier: tertiaryTier,
        date_key: dateKey,
      },
    ];

    this.activeDateKey = dateKey;
    this.quests = generated;
    this.saveToStorage();
    return this.getActiveQuests();
  }

  public getActiveQuests(): IDynamicDailyQuest[] {
    return this.quests.map((q) => ({
      ...q,
      focus_skill_codes: [...q.focus_skill_codes],
    }));
  }

  /**
   * Met à jour la progression des quêtes ciblées après un événement de combat.
   */
  public recordCombatOutcome(event: {
    subject?: SubjectCategory;
    correctHits?: number;
    fastReflexHits?: number;
    matchWon?: boolean;
  }): IDynamicDailyQuest[] {
    let changed = false;

    for (const quest of this.quests) {
      if (quest.claimed) continue;

      if (event.subject && quest.target_subject !== event.subject && quest.kind !== 'MATCH_WINS') {
        continue;
      }

      let delta = 0;
      if (quest.kind === 'CORRECT_HITS' && event.correctHits && event.correctHits > 0) {
        delta = Math.floor(event.correctHits);
      } else if (
        quest.kind === 'FAST_REFLEX' &&
        event.fastReflexHits &&
        event.fastReflexHits > 0
      ) {
        delta = Math.floor(event.fastReflexHits);
      } else if (quest.kind === 'MATCH_WINS' && event.matchWon) {
        delta = 1;
      }

      if (delta > 0) {
        const nextProgress = Math.min(quest.target, quest.progress + delta);
        if (nextProgress !== quest.progress) {
          quest.progress = nextProgress;
          changed = true;
        }
      }
    }

    if (changed) {
      this.saveToStorage();
    }

    return this.getActiveQuests();
  }

  /**
   * Réclame une quête terminée et crédite le profil SQLite si connecté.
   */
  public claimQuest(questId: string): IQuestClaimResult {
    const quest = this.quests.find((q) => q.id === questId);
    if (!quest || quest.claimed || quest.progress < quest.target) {
      return {
        claimed: false,
        questId,
        coins: 0,
        stars: 0,
        passTokens: 0,
      };
    }

    quest.claimed = true;
    this.saveToStorage();

    if (this.db) {
      const profile = this.db.getPlayerProfile();
      this.db.updatePlayerProfile({
        coins: profile.coins + quest.reward_coins,
      });
      if (quest.reward_stars > 0) {
        this.db.addCombatStars(quest.reward_stars);
      }
    }

    return {
      claimed: true,
      questId,
      coins: quest.reward_coins,
      stars: quest.reward_stars,
      passTokens: quest.pass_tokens_reward,
    };
  }

  private resolveDifficultyTier(avgElo: number): QuestDifficultyTier {
    if (avgElo < 960) return 'DECOUVERTE';
    if (avgElo <= 1080) return 'RENFORCEMENT';
    return 'MAITRISE';
  }

  private loadFromStorage(): IPersistedLiveOpsQuests | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<IPersistedLiveOpsQuests>;
      if (typeof parsed.date_key !== 'string' || !Array.isArray(parsed.quests)) {
        return null;
      }
      return {
        date_key: parsed.date_key,
        quests: parsed.quests,
      };
    } catch {
      return null;
    }
  }

  private saveToStorage(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      const payload: IPersistedLiveOpsQuests = {
        date_key: this.activeDateKey,
        quests: this.quests,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Stockage local indisponible
    }
  }
}
