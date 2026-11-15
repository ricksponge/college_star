import type {
  CampusRoomId,
  ICampusQuest,
  IQuestObjective,
  IQuestProgressRecord,
  IQuestReward,
  IQuestStepAdvanceResult,
  SubjectCategory,
} from '../types/cctp';
import { INITIAL_CAMPUS_QUESTS } from '../data/campusQuests';

/**
 * Contrat structurel attendu du stockage local (implémenté par LocalSQLiteDB).
 * Évite tout couplage direct d'import entre QuestService et la couche db/.
 */
export interface IQuestStorageDB {
  getQuestProgress(questId: string): IQuestProgressRecord | undefined;
  getAllQuestProgress(): IQuestProgressRecord[];
  upsertQuestProgress(record: IQuestProgressRecord): IQuestProgressRecord;
  claimQuestRewardToProfile(reward: IQuestReward): void;
}

const NO_ADVANCE_RESULT: IQuestStepAdvanceResult = {
  advanced: false,
  objectiveCompleted: false,
  questCompleted: false,
};

/**
 * Service de gestion des quêtes & missions d'exploration du collège (Jalon M4, Ticket #22).
 * Suit la progression des objectifs de la quête active, crédite automatiquement les récompenses
 * et enchaîne la quête suivante par ordre de chapitre.
 */
export class QuestService {
  private readonly db: IQuestStorageDB;
  private readonly quests: ICampusQuest[];

  constructor(db: IQuestStorageDB, quests: ICampusQuest[] = INITIAL_CAMPUS_QUESTS) {
    this.db = db;
    this.quests = [...quests].sort((a, b) => a.chapter_order - b.chapter_order);
    this.ensureInitialized();
  }

  /**
   * Garantit que chaque quête possède un enregistrement en base et qu'une quête
   * est active (Q_01_BIENVENUE en priorité) s'il n'existe aucune quête ACTIVE
   * et qu'il reste au moins une quête AVAILABLE.
   */
  public ensureInitialized(): void {
    const nowIso = new Date().toISOString();

    for (const quest of this.quests) {
      const existing = this.db.getQuestProgress(quest.id);
      if (!existing) {
        this.db.upsertQuestProgress({
          quest_id: quest.id,
          status: 'AVAILABLE',
          current_objective_index: 0,
          current_count: 0,
          updated_at: nowIso,
        });
      }
    }

    const hasActiveQuest = this.quests.some(
      (quest) => this.db.getQuestProgress(quest.id)?.status === 'ACTIVE'
    );
    if (hasActiveQuest) {
      return;
    }

    const welcomeProgress = this.db.getQuestProgress('Q_01_BIENVENUE');
    if (welcomeProgress && welcomeProgress.status === 'AVAILABLE') {
      this.db.upsertQuestProgress({
        ...welcomeProgress,
        status: 'ACTIVE',
        updated_at: nowIso,
      });
      return;
    }

    const firstAvailable = this.quests.find(
      (quest) => this.db.getQuestProgress(quest.id)?.status === 'AVAILABLE'
    );
    if (firstAvailable) {
      const progress = this.db.getQuestProgress(firstAvailable.id)!;
      this.db.upsertQuestProgress({
        ...progress,
        status: 'ACTIVE',
        updated_at: nowIso,
      });
    }
  }

  public getAllQuestsWithStatus(): Array<{
    quest: ICampusQuest;
    progress: IQuestProgressRecord;
  }> {
    this.ensureInitialized();
    return this.quests.map((quest) => {
      const progress = this.db.getQuestProgress(quest.id)!;
      return {
        quest,
        progress: { ...progress },
      };
    });
  }

  public getActiveQuest(): {
    quest: ICampusQuest;
    progress: IQuestProgressRecord;
    activeObjective: IQuestObjective;
  } | null {
    this.ensureInitialized();
    for (const quest of this.quests) {
      const progress = this.db.getQuestProgress(quest.id);
      if (progress && progress.status === 'ACTIVE') {
        const activeObjective = quest.objectives[progress.current_objective_index];
        if (!activeObjective) {
          return null;
        }
        return {
          quest,
          progress: { ...progress },
          activeObjective,
        };
      }
    }
    return null;
  }

  /**
   * Passe l'ancienne quête ACTIVE en AVAILABLE (si non terminée) et active questId
   * si celle-ci est AVAILABLE ou déjà ACTIVE.
   */
  public selectActiveQuest(questId: string): void {
    this.ensureInitialized();
    const targetQuest = this.quests.find((quest) => quest.id === questId);
    const targetProgress = this.db.getQuestProgress(questId);
    if (!targetQuest || !targetProgress) {
      return;
    }
    if (targetProgress.status !== 'AVAILABLE' && targetProgress.status !== 'ACTIVE') {
      return;
    }

    const nowIso = new Date().toISOString();
    for (const quest of this.quests) {
      if (quest.id === questId) {
        continue;
      }
      const progress = this.db.getQuestProgress(quest.id);
      if (
        progress &&
        progress.status === 'ACTIVE' &&
        progress.current_objective_index < quest.objectives.length
      ) {
        this.db.upsertQuestProgress({
          ...progress,
          status: 'AVAILABLE',
          updated_at: nowIso,
        });
      }
    }

    if (targetProgress.status === 'AVAILABLE') {
      this.db.upsertQuestProgress({
        ...targetProgress,
        status: 'ACTIVE',
        updated_at: nowIso,
      });
    }
  }

  public notifyRoomEntered(roomId: CampusRoomId): IQuestStepAdvanceResult {
    return this.advanceIfMatches(
      (objective) => objective.type === 'VISIT_ROOM' && objective.target_room_id === roomId
    );
  }

  public notifyNpcInteracted(npcId: string, roomId: CampusRoomId): IQuestStepAdvanceResult {
    return this.advanceIfMatches(
      (objective) =>
        objective.type === 'TALK_NPC' &&
        objective.target_room_id === roomId &&
        (!objective.target_npc_id || objective.target_npc_id === npcId)
    );
  }

  public notifyRoomQuestionSolved(
    roomId: CampusRoomId,
    subject: SubjectCategory
  ): IQuestStepAdvanceResult {
    return this.advanceIfMatches(
      (objective) =>
        objective.type === 'SOLVE_ROOM_QUESTIONS' &&
        objective.target_room_id === roomId &&
        (!objective.subject || objective.subject === subject)
    );
  }

  public notifyCampusBadgeCollected(roomId: CampusRoomId): IQuestStepAdvanceResult {
    return this.advanceIfMatches(
      (objective) =>
        objective.type === 'COLLECT_CAMPUS_BADGE' && objective.target_room_id === roomId
    );
  }

  /**
   * Réclame manuellement la récompense d'une quête au statut COMPLETED.
   * Retourne null si la quête n'est pas réclamable (évite tout double crédit).
   */
  public claimQuestReward(questId: string): IQuestReward | null {
    this.ensureInitialized();
    const quest = this.quests.find((q) => q.id === questId);
    const progress = this.db.getQuestProgress(questId);
    if (!quest || !progress || progress.status !== 'COMPLETED') {
      return null;
    }

    const reward: IQuestReward = { ...quest.reward };
    this.db.claimQuestRewardToProfile(reward);
    this.db.upsertQuestProgress({
      ...progress,
      status: 'CLAIMED',
      updated_at: new Date().toISOString(),
    });

    const hasActive = this.quests.some(
      (q) => this.db.getQuestProgress(q.id)?.status === 'ACTIVE'
    );
    if (!hasActive) {
      this.activateNextAvailableQuest(quest.chapter_order);
    }

    return reward;
  }

  private advanceIfMatches(
    predicate: (objective: IQuestObjective) => boolean
  ): IQuestStepAdvanceResult {
    const active = this.getActiveQuest();
    if (!active) {
      return { ...NO_ADVANCE_RESULT };
    }

    const { quest, progress, activeObjective } = active;
    if (!predicate(activeObjective)) {
      return { ...NO_ADVANCE_RESULT };
    }

    const nowIso = new Date().toISOString();
    const nextCount = progress.current_count + 1;

    if (nextCount < activeObjective.required_count) {
      this.db.upsertQuestProgress({
        ...progress,
        current_count: nextCount,
        updated_at: nowIso,
      });
      return {
        advanced: true,
        objectiveCompleted: false,
        questCompleted: false,
        message: `${activeObjective.description} (${nextCount}/${activeObjective.required_count})`,
      };
    }

    const nextObjectiveIndex = progress.current_objective_index + 1;
    if (nextObjectiveIndex < quest.objectives.length) {
      this.db.upsertQuestProgress({
        ...progress,
        current_objective_index: nextObjectiveIndex,
        current_count: 0,
        updated_at: nowIso,
      });
      const nextObjective = quest.objectives[nextObjectiveIndex];
      return {
        advanced: true,
        objectiveCompleted: true,
        questCompleted: false,
        message: `Étape validée ! Suivant : ${nextObjective.description}`,
      };
    }

    const rewardGranted: IQuestReward = { ...quest.reward };
    this.db.claimQuestRewardToProfile(rewardGranted);
    this.db.upsertQuestProgress({
      ...progress,
      status: 'CLAIMED',
      current_objective_index: Math.max(0, quest.objectives.length - 1),
      current_count: activeObjective.required_count,
      updated_at: nowIso,
    });

    const nextActiveQuest = this.activateNextAvailableQuest(quest.chapter_order);
    const nextLabel = nextActiveQuest ? ` — Nouvelle quête : ${nextActiveQuest.title}` : '';

    return {
      advanced: true,
      objectiveCompleted: true,
      questCompleted: true,
      completedQuest: quest,
      rewardGranted,
      nextActiveQuest,
      message: `Quête terminée : ${quest.title} ! (+${rewardGranted.coins} 🪙, +${rewardGranted.trophies} 🏆)${nextLabel}`,
    };
  }

  private activateNextAvailableQuest(afterChapterOrder: number): ICampusQuest | null {
    const nextCandidate =
      this.quests.find(
        (quest) =>
          quest.chapter_order > afterChapterOrder &&
          this.db.getQuestProgress(quest.id)?.status === 'AVAILABLE'
      ) ??
      this.quests.find((quest) => this.db.getQuestProgress(quest.id)?.status === 'AVAILABLE');

    if (!nextCandidate) {
      return null;
    }

    const candidateProgress = this.db.getQuestProgress(nextCandidate.id)!;
    this.db.upsertQuestProgress({
      ...candidateProgress,
      status: 'ACTIVE',
      updated_at: new Date().toISOString(),
    });
    return nextCandidate;
  }
}
