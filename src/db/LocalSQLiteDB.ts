import type {
  BrawlerId,
  IAccessibilitySettings,
  IDailyQuest,
  IParentSerenityReport,
  IParentSubjectSummary,
  IPlayerProfile,
  IQuestProgressRecord,
  IQuestReward,
  ISkillMastery,
  ITelemetryLog,
  QuestStatus,
  SubjectCategory,
} from '../types/cctp';
import type { ISpacedRepetitionEntry } from '../services/EloEngine';

export const SQLITE_SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS player_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nickname TEXT NOT NULL DEFAULT 'Timo',
  trophies INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 250,
  starr_drops_available INTEGER NOT NULL DEFAULT 1,
  selected_brawler TEXT NOT NULL DEFAULT 'TIMO',
  parent_pin_hash TEXT NOT NULL DEFAULT '0000'
);

CREATE TABLE IF NOT EXISTS skill_mastery (
  skill_code TEXT PRIMARY KEY,
  subject_category TEXT NOT NULL,
  elo_rating INTEGER NOT NULL DEFAULT 1000,
  attempts_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  avg_response_ms INTEGER NOT NULL DEFAULT 3500,
  last_seen_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS combat_telemetry_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id TEXT NOT NULL,
  brawler_used TEXT NOT NULL,
  is_hit_correct BOOLEAN NOT NULL,
  reaction_time_ms INTEGER NOT NULL,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quest_progress (
  quest_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'AVAILABLE',
  current_objective_index INTEGER NOT NULL DEFAULT 0,
  current_count INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`.trim();

const STORAGE_KEY = 'brawl_college_sqlite_v1';
const IDB_NAME = 'BrawlCollegeSQLiteDB';
const IDB_STORE = 'sqlite_snapshots';
const IDB_KEY = 'main_db';
const MAX_BRAWLER_LEVEL = 10;

interface ISqliteInternalState {
  player_profile: IPlayerProfile;
  skill_mastery: Record<string, ISkillMastery>;
  combat_telemetry_log: ITelemetryLog[];
  quest_progress: Record<string, IQuestProgressRecord>;
  next_log_id: number;
  combat_stars: number;
  knowledge_points: number;
  unlocked_rewards: string[];
  brawler_levels: Record<BrawlerId, number>;
  claimed_milestones: number[];
  daily_quests: IDailyQuest[];
  spaced_repetition_entries: ISpacedRepetitionEntry[];
  accessibility_settings: IAccessibilitySettings;
}

const ALL_SUBJECTS: SubjectCategory[] = [
  'mathematiques',
  'francais',
  'anglais',
  'histoire_geo_sciences',
  'vie_au_college',
];

const DEFAULT_SKILLS: Array<{ code: string; subject: SubjectCategory }> = [
  // Mathématiques (6)
  { code: 'MATH_MUL', subject: 'mathematiques' },
  { code: 'MATH_DIV', subject: 'mathematiques' },
  { code: 'MATH_FRAC', subject: 'mathematiques' },
  { code: 'MATH_CONV', subject: 'mathematiques' },
  { code: 'MATH_GEOM', subject: 'mathematiques' },
  { code: 'MATH_PRIO', subject: 'mathematiques' },
  // Français (5)
  { code: 'FR_HOMO', subject: 'francais' },
  { code: 'FR_ACC', subject: 'francais' },
  { code: 'FR_TERM', subject: 'francais' },
  { code: 'FR_NAT', subject: 'francais' },
  { code: 'FR_PREF', subject: 'francais' },
  // Anglais (5)
  { code: 'ANG_VOC', subject: 'anglais' },
  { code: 'ANG_PRON', subject: 'anglais' },
  { code: 'ANG_AUX', subject: 'anglais' },
  { code: 'ANG_INT', subject: 'anglais' },
  { code: 'ANG_NUM', subject: 'anglais' },
  // Histoire-Géo, Sciences & EMC (5)
  { code: 'HG_PER', subject: 'histoire_geo_sciences' },
  { code: 'HG_GEO', subject: 'histoire_geo_sciences' },
  { code: 'SCI_SOL', subject: 'histoire_geo_sciences' },
  { code: 'SCI_MAT', subject: 'histoire_geo_sciences' },
  { code: 'SCI_VIV', subject: 'histoire_geo_sciences' },
  // Vie au Collège & Méthodologie (7)
  { code: 'COL_EDT', subject: 'vie_au_college' },
  { code: 'COL_ADU', subject: 'vie_au_college' },
  { code: 'COL_CONS', subject: 'vie_au_college' },
  { code: 'COL_SAC', subject: 'vie_au_college' },
  { code: 'COL_STRESS', subject: 'vie_au_college' },
  { code: 'COL_CPS', subject: 'vie_au_college' },
  { code: 'COL_LIEUX', subject: 'vie_au_college' },
];

const VALID_BRAWLERS: BrawlerId[] = ['TIMO', 'LEO', 'MAYA', 'ZACK'];

function createDefaultDailyQuests(): IDailyQuest[] {
  return [
    {
      id: 'q_hits',
      title: 'Toucher 8 bonnes cibles',
      target: 8,
      progress: 0,
      reward_coins: 80,
      reward_stars: 1,
      claimed: false,
      kind: 'CORRECT_HITS',
    },
    {
      id: 'q_reflex',
      title: '4 tirs Réflexe (< 2,5s)',
      target: 4,
      progress: 0,
      reward_coins: 100,
      reward_stars: 1,
      claimed: false,
      kind: 'FAST_REFLEX',
    },
    {
      id: 'q_wins',
      title: 'Remporter 2 parties',
      target: 2,
      progress: 0,
      reward_coins: 120,
      reward_stars: 2,
      claimed: false,
      kind: 'MATCH_WINS',
    },
  ];
}

function createDefaultState(): ISqliteInternalState {
  const nowIso = new Date().toISOString();
  const skillMastery: Record<string, ISkillMastery> = {};
  for (const item of DEFAULT_SKILLS) {
    skillMastery[item.code] = {
      skill_code: item.code,
      subject_category: item.subject,
      elo_rating: 1000,
      attempts_count: 0,
      success_count: 0,
      avg_response_ms: 3500,
      last_seen_timestamp: nowIso,
    };
  }

  return {
    player_profile: {
      id: 1,
      nickname: 'Timo',
      trophies: 0,
      coins: 250,
      starr_drops_available: 1,
      selected_brawler: 'TIMO',
      parent_pin_hash: '0000',
    },
    skill_mastery: skillMastery,
    combat_telemetry_log: [],
    quest_progress: {},
    next_log_id: 1,
    combat_stars: 0,
    knowledge_points: 0,
    unlocked_rewards: [],
    brawler_levels: {
      TIMO: 1,
      LEO: 1,
      MAYA: 1,
      ZACK: 1,
    },
    claimed_milestones: [],
    daily_quests: createDefaultDailyQuests(),
    spaced_repetition_entries: [],
    accessibility_settings: {
      smart_auto_aim: true,
      visual_gps_compass: true,
      calm_mode: false,
      auto_hint_assist: true,
      onboarding_seen: false,
    },
  };
}

function normalizeLevel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.min(MAX_BRAWLER_LEVEL, Math.floor(value)));
}

function cloneSpacedEntry(entry: ISpacedRepetitionEntry): ISpacedRepetitionEntry {
  return {
    ...entry,
    question: {
      ...entry.question,
      targets: entry.question.targets.map((t) => ({ ...t })),
    },
  };
}

/**
 * Base SQLite locale 100% hors-ligne (tables player_profile, skill_mastery, combat_telemetry_log, quest_progress)
 * avec persistance synchrone localStorage et miroir asynchrone IndexedDB + export SQL.
 */
export class LocalSQLiteDB {
  private state: ISqliteInternalState;

  constructor() {
    this.state = this.loadFromLocalStorage() ?? createDefaultState();
    if (!this.state.quest_progress) {
      this.state.quest_progress = {};
    }
    this.persist();
  }

  public async init(): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      return;
    }
    try {
      const idbState = await this.loadFromIndexedDB();
      const idbQuestCount = idbState ? Object.keys(idbState.quest_progress ?? {}).length : 0;
      const localQuestCount = Object.keys(this.state.quest_progress).length;
      if (
        idbState &&
        typeof idbState.next_log_id === 'number' &&
        (idbState.next_log_id > this.state.next_log_id ||
          (idbState.next_log_id === this.state.next_log_id && idbQuestCount > localQuestCount))
      ) {
        this.state = this.normalizeState(idbState);
        this.saveToLocalStorage();
      } else {
        await this.saveToIndexedDB();
      }
    } catch {
      // Fallback silencieux sur localStorage si IndexedDB est indisponible
    }
  }

  public getSchemaDDL(): string {
    return SQLITE_SCHEMA_DDL;
  }

  public getPlayerProfile(): IPlayerProfile {
    return { ...this.state.player_profile };
  }

  public updatePlayerProfile(patch: Partial<Omit<IPlayerProfile, 'id'>>): IPlayerProfile {
    const trimmedNickname =
      patch.nickname !== undefined
        ? patch.nickname.trim() || this.state.player_profile.nickname
        : this.state.player_profile.nickname;

    this.state.player_profile = {
      ...this.state.player_profile,
      ...patch,
      id: 1,
      nickname: trimmedNickname,
      trophies: Math.max(0, Math.min(1000, patch.trophies ?? this.state.player_profile.trophies)),
      coins: Math.max(0, patch.coins ?? this.state.player_profile.coins),
      starr_drops_available: Math.max(
        0,
        patch.starr_drops_available ?? this.state.player_profile.starr_drops_available
      ),
    };
    this.persist();
    return this.getPlayerProfile();
  }

  public getCombatStars(): number {
    return this.state.combat_stars;
  }

  /**
   * Ajoute des étoiles de combat ; toutes les 3 étoiles, débloque 1 Casier Mystère (US-03).
   */
  public addCombatStars(starsEarned: number): { stars: number; unlockedStarrDrops: number } {
    const previousMilestones = Math.floor(this.state.combat_stars / 3);
    this.state.combat_stars += Math.max(0, starsEarned);
    const newMilestones = Math.floor(this.state.combat_stars / 3);
    const unlockedStarrDrops = Math.max(0, newMilestones - previousMilestones);
    if (unlockedStarrDrops > 0) {
      this.state.player_profile.starr_drops_available += unlockedStarrDrops;
    }
    this.persist();
    return { stars: this.state.combat_stars, unlockedStarrDrops };
  }

  public getKnowledgePoints(): number {
    return this.state.knowledge_points;
  }

  public addKnowledgePoints(points: number): number {
    this.state.knowledge_points += Math.max(0, points);
    this.persist();
    return this.state.knowledge_points;
  }

  public getUnlockedRewards(): string[] {
    return [...this.state.unlocked_rewards];
  }

  public addUnlockedReward(rewardLabel: string): string[] {
    if (!this.state.unlocked_rewards.includes(rewardLabel)) {
      this.state.unlocked_rewards.push(rewardLabel);
      this.persist();
    }
    return this.getUnlockedRewards();
  }

  public getBrawlerLevel(brawlerId: BrawlerId): number {
    return this.state.brawler_levels[brawlerId] ?? 1;
  }

  public getUpgradeCost(level: number): { coins: number; knowledgePoints: number } {
    const safeLevel = Math.max(1, Math.floor(level));
    return {
      coins: 60 * safeLevel,
      knowledgePoints: 15 * safeLevel,
    };
  }

  public upgradeBrawler(brawlerId: BrawlerId): {
    success: boolean;
    newLevel: number;
    reason?: string;
  } {
    const currentLevel = this.getBrawlerLevel(brawlerId);
    if (currentLevel >= MAX_BRAWLER_LEVEL) {
      return {
        success: false,
        newLevel: currentLevel,
        reason: `Niveau maximum atteint (${MAX_BRAWLER_LEVEL}).`,
      };
    }

    const cost = this.getUpgradeCost(currentLevel);
    const hasEnoughCoins = this.state.player_profile.coins >= cost.coins;
    const hasEnoughKp = this.state.knowledge_points >= cost.knowledgePoints;

    if (!hasEnoughCoins && !hasEnoughKp) {
      return {
        success: false,
        newLevel: currentLevel,
        reason: `Il faut ${cost.coins} Pièces et ${cost.knowledgePoints} pts de Savoir.`,
      };
    }
    if (!hasEnoughCoins) {
      return {
        success: false,
        newLevel: currentLevel,
        reason: `Pièces insuffisantes (${cost.coins} requises).`,
      };
    }
    if (!hasEnoughKp) {
      return {
        success: false,
        newLevel: currentLevel,
        reason: `Points de Savoir insuffisants (${cost.knowledgePoints} requis).`,
      };
    }

    this.state.player_profile.coins -= cost.coins;
    this.state.knowledge_points -= cost.knowledgePoints;
    const newLevel = currentLevel + 1;
    this.state.brawler_levels[brawlerId] = newLevel;
    this.persist();

    return {
      success: true,
      newLevel,
    };
  }

  public getClaimedMilestones(): number[] {
    return [...this.state.claimed_milestones];
  }

  public claimTrophyMilestone(milestoneTrophies: number): {
    claimed: boolean;
    rewardDescription: string;
  } {
    const validMilestones = [100, 250, 450, 650, 850, 1000];
    if (!validMilestones.includes(milestoneTrophies)) {
      return {
        claimed: false,
        rewardDescription: 'Palier de trophées inconnu.',
      };
    }

    if (this.state.player_profile.trophies < milestoneTrophies) {
      return {
        claimed: false,
        rewardDescription: `Atteins ${milestoneTrophies} trophées pour débloquer ce palier.`,
      };
    }

    if (this.state.claimed_milestones.includes(milestoneTrophies)) {
      return {
        claimed: false,
        rewardDescription: 'Palier déjà réclamé.',
      };
    }

    let rewardDescription = '';
    switch (milestoneTrophies) {
      case 100:
        this.state.player_profile.starr_drops_available += 1;
        rewardDescription = '+1 Casier Mystère';
        break;
      case 250:
        if (!this.state.unlocked_rewards.includes('Badge Équerre d’Or')) {
          this.state.unlocked_rewards.push('Badge Équerre d’Or');
        }
        rewardDescription = 'Badge Équerre d’Or';
        break;
      case 450:
        this.state.player_profile.coins += 150;
        rewardDescription = '+150 Pièces';
        break;
      case 650:
        if (!this.state.unlocked_rewards.includes('Skin Timo Survêt Bleu')) {
          this.state.unlocked_rewards.push('Skin Timo Survêt Bleu');
        }
        rewardDescription = 'Skin Timo Survêt Bleu';
        break;
      case 850:
        this.state.player_profile.starr_drops_available += 1;
        rewardDescription = '+1 Casier Mystère';
        break;
      case 1000:
        if (!this.state.unlocked_rewards.includes('Diplôme Suprême 6e')) {
          this.state.unlocked_rewards.push('Diplôme Suprême 6e');
        }
        this.state.player_profile.coins += 200;
        rewardDescription = 'Diplôme Suprême 6e + 200 Pièces';
        break;
    }

    this.state.claimed_milestones.push(milestoneTrophies);
    this.persist();

    return {
      claimed: true,
      rewardDescription,
    };
  }

  public getDailyQuests(): IDailyQuest[] {
    return this.state.daily_quests.map((q) => ({ ...q }));
  }

  public recordQuestProgress(event: {
    correctHits?: number;
    fastReflexHits?: number;
    matchWon?: boolean;
  }): void {
    let changed = false;

    for (const quest of this.state.daily_quests) {
      if (quest.claimed) continue;

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
      this.persist();
    }
  }

  public claimDailyQuest(questId: string): boolean {
    const quest = this.state.daily_quests.find((q) => q.id === questId);
    if (!quest || quest.claimed || quest.progress < quest.target) {
      return false;
    }

    quest.claimed = true;
    this.state.player_profile.coins += Math.max(0, quest.reward_coins);
    if (quest.reward_stars > 0) {
      this.addCombatStars(quest.reward_stars);
    } else {
      this.persist();
    }
    return true;
  }

  public getAccessibilitySettings(): IAccessibilitySettings {
    return { ...this.state.accessibility_settings };
  }

  public updateAccessibilitySettings(
    patch: Partial<IAccessibilitySettings>
  ): IAccessibilitySettings {
    const current = this.state.accessibility_settings;
    this.state.accessibility_settings = {
      smart_auto_aim:
        typeof patch.smart_auto_aim === 'boolean' ? patch.smart_auto_aim : current.smart_auto_aim,
      visual_gps_compass:
        typeof patch.visual_gps_compass === 'boolean'
          ? patch.visual_gps_compass
          : current.visual_gps_compass,
      calm_mode: typeof patch.calm_mode === 'boolean' ? patch.calm_mode : current.calm_mode,
      auto_hint_assist:
        typeof patch.auto_hint_assist === 'boolean'
          ? patch.auto_hint_assist
          : current.auto_hint_assist,
      onboarding_seen:
        typeof patch.onboarding_seen === 'boolean'
          ? patch.onboarding_seen
          : current.onboarding_seen,
    };
    this.persist();
    return this.getAccessibilitySettings();
  }

  /**
   * Réclame en 1 clic toutes les quêtes du jour terminées et les paliers de la Route des Trophées atteints.
   */
  public claimAllAvailableRewards(): {
    claimedCount: number;
    coinsEarned: number;
    starsEarned: number;
    dropsEarned: number;
    descriptions: string[];
  } {
    const beforeCoins = this.state.player_profile.coins;
    const beforeStars = this.state.combat_stars;
    const beforeDrops = this.state.player_profile.starr_drops_available;

    let claimedCount = 0;
    const descriptions: string[] = [];

    for (const quest of this.getDailyQuests()) {
      if (!quest.claimed && quest.progress >= quest.target) {
        if (this.claimDailyQuest(quest.id)) {
          claimedCount += 1;
          const starsLabel =
            quest.reward_stars > 0
              ? `, +${quest.reward_stars} Étoile${quest.reward_stars > 1 ? 's' : ''}`
              : '';
          descriptions.push(`Quête « ${quest.title} » (+${quest.reward_coins} Pièces${starsLabel})`);
        }
      }
    }

    const milestones = [100, 250, 450, 650, 850, 1000];
    for (const m of milestones) {
      if (
        this.state.player_profile.trophies >= m &&
        !this.state.claimed_milestones.includes(m)
      ) {
        const res = this.claimTrophyMilestone(m);
        if (res.claimed) {
          claimedCount += 1;
          descriptions.push(`Palier ${m} 🏆 : ${res.rewardDescription}`);
        }
      }
    }

    return {
      claimedCount,
      coinsEarned: Math.max(0, this.state.player_profile.coins - beforeCoins),
      starsEarned: Math.max(0, this.state.combat_stars - beforeStars),
      dropsEarned: Math.max(0, this.state.player_profile.starr_drops_available - beforeDrops),
      descriptions,
    };
  }

  public getSpacedRepetitionEntries(): ISpacedRepetitionEntry[] {
    return this.state.spaced_repetition_entries.map(cloneSpacedEntry);
  }

  public setSpacedRepetitionEntries(entries: ISpacedRepetitionEntry[]): void {
    this.state.spaced_repetition_entries = entries.map(cloneSpacedEntry);
    this.persist();
  }

  public verifyParentPin(pin: string): boolean {
    return pin.trim() === this.state.player_profile.parent_pin_hash;
  }

  public updateParentPin(newPin: string): void {
    if (/^\d{4}$/.test(newPin)) {
      this.state.player_profile.parent_pin_hash = newPin;
      this.persist();
    }
  }

  public getSkillMastery(skillCode: string): ISkillMastery | undefined {
    const entry = this.state.skill_mastery[skillCode];
    return entry ? { ...entry } : undefined;
  }

  public getAllSkillMasteries(): ISkillMastery[] {
    return Object.values(this.state.skill_mastery).map((s) => ({ ...s }));
  }

  public upsertSkillMastery(entry: ISkillMastery): ISkillMastery {
    this.state.skill_mastery[entry.skill_code] = { ...entry };
    this.persist();
    return { ...entry };
  }

  public getQuestProgress(questId: string): IQuestProgressRecord | undefined {
    const entry = this.state.quest_progress[questId];
    return entry ? { ...entry } : undefined;
  }

  public getAllQuestProgress(): IQuestProgressRecord[] {
    return Object.values(this.state.quest_progress).map((q) => ({ ...q }));
  }

  public upsertQuestProgress(record: IQuestProgressRecord): IQuestProgressRecord {
    const saved: IQuestProgressRecord = {
      ...record,
      current_objective_index: Math.max(0, Math.floor(record.current_objective_index)),
      current_count: Math.max(0, Math.floor(record.current_count)),
      updated_at: record.updated_at || new Date().toISOString(),
    };
    this.state.quest_progress[saved.quest_id] = saved;
    this.persist();
    return { ...saved };
  }

  /**
   * Crédite les récompenses d'une quête accomplie sur le profil SQLite du joueur.
   */
  public claimQuestRewardToProfile(reward: IQuestReward): void {
    const profile = this.getPlayerProfile();
    this.updatePlayerProfile({
      coins: profile.coins + Math.max(0, reward.coins),
      trophies: Math.max(0, Math.min(1000, profile.trophies + Math.max(0, reward.trophies))),
      starr_drops_available:
        profile.starr_drops_available + Math.max(0, reward.starr_drop_bonus ?? 0),
    });

    this.addCombatStars(reward.combat_stars);
    this.addKnowledgePoints(reward.knowledge_points);
    if (reward.unlocked_title_or_badge) {
      this.addUnlockedReward(reward.unlocked_title_or_badge);
    }
  }

  public recordCombatTelemetry(
    log: ITelemetryLog,
    skillUpdate?: {
      skill_code: string;
      subject_category: SubjectCategory;
      new_elo?: number;
    }
  ): ITelemetryLog {
    const record: ITelemetryLog = {
      id: this.state.next_log_id++,
      question_id: log.question_id,
      brawler_used: log.brawler_used,
      is_hit_correct: log.is_hit_correct,
      reaction_time_ms: Math.round(log.reaction_time_ms),
      recorded_at: log.recorded_at ?? new Date().toISOString(),
    };
    this.state.combat_telemetry_log.push(record);
    if (this.state.combat_telemetry_log.length > 500) {
      this.state.combat_telemetry_log.shift();
    }

    if (skillUpdate) {
      const existing = this.state.skill_mastery[skillUpdate.skill_code] ?? {
        skill_code: skillUpdate.skill_code,
        subject_category: skillUpdate.subject_category,
        elo_rating: 1000,
        attempts_count: 0,
        success_count: 0,
        avg_response_ms: 3500,
        last_seen_timestamp: new Date().toISOString(),
      };

      const prevAttempts = existing.attempts_count;
      const newAttempts = prevAttempts + 1;
      const newSuccess = existing.success_count + (log.is_hit_correct ? 1 : 0);
      const newAvgMs = Math.round(
        (existing.avg_response_ms * prevAttempts + log.reaction_time_ms) / newAttempts
      );

      this.state.skill_mastery[skillUpdate.skill_code] = {
        ...existing,
        subject_category: skillUpdate.subject_category,
        elo_rating: skillUpdate.new_elo ?? existing.elo_rating,
        attempts_count: newAttempts,
        success_count: newSuccess,
        avg_response_ms: newAvgMs,
        last_seen_timestamp: new Date().toISOString(),
      };
    }

    this.persist();
    return record;
  }

  public getTelemetryLogs(limit = 50): ITelemetryLog[] {
    return this.state.combat_telemetry_log.slice(-limit).reverse();
  }

  /**
   * Calcule le bilan exact par matière pour le Dashboard Parent (US-04).
   */
  public computeParentSubjectSummaries(): IParentSubjectSummary[] {
    const allSkills = this.getAllSkillMasteries();

    return ALL_SUBJECTS.map((subject) => {
      const subjectSkills = allSkills.filter((s) => s.subject_category === subject);
      let totalAttempts = 0;
      let totalSuccess = 0;
      let weightedMs = 0;

      for (const skill of subjectSkills) {
        totalAttempts += skill.attempts_count;
        totalSuccess += skill.success_count;
        weightedMs += skill.avg_response_ms * Math.max(1, skill.attempts_count);
      }

      const denom = subjectSkills.reduce((acc, s) => acc + Math.max(1, s.attempts_count), 0);
      const avgReactionMs = denom > 0 ? Math.round(weightedMs / denom) : 3500;
      const successRatePct =
        totalAttempts > 0 ? Math.round((totalSuccess / totalAttempts) * 100) : 0;

      const skillsToConsolidate = subjectSkills
        .filter((s) => {
          if (s.attempts_count === 0) return s.elo_rating < 1000;
          const rate = s.success_count / s.attempts_count;
          return rate < 0.75 || s.elo_rating < 1000;
        })
        .sort((a, b) => a.elo_rating - b.elo_rating)
        .map((s) => s.skill_code);

      return {
        subject,
        success_rate_pct: successRatePct,
        avg_reaction_time_ms: avgReactionMs,
        skills_to_consolidate: skillsToConsolidate,
        attempts_count: totalAttempts,
      };
    });
  }

  /**
   * Calcule le baromètre global « Sérénité & Adaptation 6ème » pour le Dashboard Parent.
   * Combine l'autonomie collège, la réussite globale et le calme exécutif (absence de précipitation < 1,2s).
   */
  public computeParentSerenityReport(): IParentSerenityReport {
    const allSkills = this.getAllSkillMasteries();
    const totalSkillsCount = allSkills.length;
    const exploredSkillsCount = allSkills.filter((s) => s.attempts_count > 0).length;

    let totalAttempts = 0;
    let totalSuccess = 0;
    for (const skill of allSkills) {
      totalAttempts += skill.attempts_count;
      totalSuccess += skill.success_count;
    }

    const globalSuccessPct =
      totalAttempts > 0 ? Math.round((totalSuccess / totalAttempts) * 100) : 0;

    const campusSkills = allSkills.filter((s) => s.subject_category === 'vie_au_college');
    let campusAttempts = 0;
    let campusSuccess = 0;
    let campusExplored = 0;
    for (const skill of campusSkills) {
      campusAttempts += skill.attempts_count;
      campusSuccess += skill.success_count;
      if (skill.attempts_count > 0) campusExplored += 1;
    }

    const campusAutonomyPct =
      campusAttempts > 0
        ? Math.round(
            (campusSuccess / campusAttempts) * 70 +
              (campusExplored / Math.max(1, campusSkills.length)) * 30
          )
        : 50;

    const logs = this.getTelemetryLogs(500);
    let executiveCalmPct = 85;
    if (logs.length > 0) {
      const impulsiveErrors = logs.filter(
        (log) => !log.is_hit_correct && log.reaction_time_ms < 1200
      ).length;
      executiveCalmPct = Math.round(((logs.length - impulsiveErrors) / logs.length) * 100);
    }

    const serenityScorePct =
      totalAttempts === 0
        ? 50
        : Math.max(
            0,
            Math.min(
              100,
              Math.round(
                campusAutonomyPct * 0.45 +
                  globalSuccessPct * 0.3 +
                  executiveCalmPct * 0.25
              )
            )
          );

    let statusLabel = 'En bonne voie vers la 6ème';
    if (totalAttempts === 0) {
      statusLabel = 'En découverte — Prêt à explorer';
    } else if (serenityScorePct >= 75) {
      statusLabel = 'Prêt & serein pour la 6ème !';
    }

    return {
      serenity_score_pct: serenityScorePct,
      status_label: statusLabel,
      campus_autonomy_pct: campusAutonomyPct,
      executive_calm_pct: executiveCalmPct,
      explored_skills_count: exploredSkillsCount,
      total_skills_count: totalSkillsCount,
    };
  }

  /**
   * Retourne le Top N (5 par défaut) des compétences à retravailler en priorité.
   */
  public getTopSkillsToConsolidate(limit = 5): ISkillMastery[] {
    return this.getAllSkillMasteries()
      .sort((a, b) => {
        const rateA = a.attempts_count > 0 ? a.success_count / a.attempts_count : 0.5;
        const rateB = b.attempts_count > 0 ? b.success_count / b.attempts_count : 0.5;
        if (rateA !== rateB) return rateA - rateB;
        return a.elo_rating - b.elo_rating;
      })
      .slice(0, limit);
  }

  /**
   * Exporte l'état complet au format SQLite standard.
   */
  public exportSqlDump(): string {
    const p = this.state.player_profile;
    const esc = (val: string): string => val.replace(/'/g, "''");
    const lines: string[] = [
      SQLITE_SCHEMA_DDL,
      `INSERT OR REPLACE INTO player_profile (id, nickname, trophies, coins, starr_drops_available, selected_brawler, parent_pin_hash) VALUES (1, '${esc(p.nickname)}', ${p.trophies}, ${p.coins}, ${p.starr_drops_available}, '${esc(p.selected_brawler)}', '${esc(p.parent_pin_hash)}');`,
    ];

    for (const s of Object.values(this.state.skill_mastery)) {
      lines.push(
        `INSERT OR REPLACE INTO skill_mastery (skill_code, subject_category, elo_rating, attempts_count, success_count, avg_response_ms, last_seen_timestamp) VALUES ('${esc(s.skill_code)}', '${esc(s.subject_category)}', ${s.elo_rating}, ${s.attempts_count}, ${s.success_count}, ${s.avg_response_ms}, '${esc(s.last_seen_timestamp)}');`
      );
    }

    for (const log of this.state.combat_telemetry_log) {
      lines.push(
        `INSERT INTO combat_telemetry_log (question_id, brawler_used, is_hit_correct, reaction_time_ms, recorded_at) VALUES ('${esc(log.question_id)}', '${esc(log.brawler_used)}', ${log.is_hit_correct ? 1 : 0}, ${log.reaction_time_ms}, '${esc(log.recorded_at ?? '')}');`
      );
    }

    const escSql = (val: string): string => val.replace(/'/g, "''");
    for (const q of Object.values(this.state.quest_progress)) {
      lines.push(
        `INSERT OR REPLACE INTO quest_progress (quest_id, status, current_objective_index, current_count, updated_at) VALUES ('${escSql(q.quest_id)}', '${escSql(q.status)}', ${q.current_objective_index}, ${q.current_count}, '${escSql(q.updated_at)}');`
      );
    }

    return lines.join('\n');
  }

  private normalizeState(
    raw: Partial<ISqliteInternalState> | null | undefined
  ): ISqliteInternalState {
    const defaults = createDefaultState();
    if (!raw || typeof raw !== 'object') {
      return defaults;
    }

    const rawProfile = (raw.player_profile ?? {}) as Partial<IPlayerProfile>;
    const selectedBrawler = VALID_BRAWLERS.includes(rawProfile.selected_brawler as BrawlerId)
      ? (rawProfile.selected_brawler as BrawlerId)
      : defaults.player_profile.selected_brawler;

    const playerProfile: IPlayerProfile = {
      id: 1,
      nickname:
        typeof rawProfile.nickname === 'string' && rawProfile.nickname.trim().length > 0
          ? rawProfile.nickname.trim()
          : defaults.player_profile.nickname,
      trophies:
        typeof rawProfile.trophies === 'number' && Number.isFinite(rawProfile.trophies)
          ? Math.max(0, Math.min(1000, Math.floor(rawProfile.trophies)))
          : defaults.player_profile.trophies,
      coins:
        typeof rawProfile.coins === 'number' && Number.isFinite(rawProfile.coins)
          ? Math.max(0, Math.floor(rawProfile.coins))
          : defaults.player_profile.coins,
      starr_drops_available:
        typeof rawProfile.starr_drops_available === 'number' &&
        Number.isFinite(rawProfile.starr_drops_available)
          ? Math.max(0, Math.floor(rawProfile.starr_drops_available))
          : defaults.player_profile.starr_drops_available,
      selected_brawler: selectedBrawler,
      parent_pin_hash:
        typeof rawProfile.parent_pin_hash === 'string' && /^\d{4}$/.test(rawProfile.parent_pin_hash)
          ? rawProfile.parent_pin_hash
          : defaults.player_profile.parent_pin_hash,
    };

    const skillMastery: Record<string, ISkillMastery> = { ...defaults.skill_mastery };
    if (raw.skill_mastery && typeof raw.skill_mastery === 'object') {
      for (const [code, entry] of Object.entries(raw.skill_mastery)) {
        if (!entry || typeof entry !== 'object') continue;
        const fallback = skillMastery[code];
        skillMastery[code] = {
          skill_code: typeof entry.skill_code === 'string' ? entry.skill_code : code,
          subject_category: ALL_SUBJECTS.includes(entry.subject_category)
            ? entry.subject_category
            : fallback?.subject_category ?? 'mathematiques',
          elo_rating:
            typeof entry.elo_rating === 'number' && Number.isFinite(entry.elo_rating)
              ? entry.elo_rating
              : fallback?.elo_rating ?? 1000,
          attempts_count:
            typeof entry.attempts_count === 'number' && Number.isFinite(entry.attempts_count)
              ? Math.max(0, Math.floor(entry.attempts_count))
              : 0,
          success_count:
            typeof entry.success_count === 'number' && Number.isFinite(entry.success_count)
              ? Math.max(0, Math.floor(entry.success_count))
              : 0,
          avg_response_ms:
            typeof entry.avg_response_ms === 'number' && Number.isFinite(entry.avg_response_ms)
              ? Math.max(0, Math.round(entry.avg_response_ms))
              : 3500,
          last_seen_timestamp:
            typeof entry.last_seen_timestamp === 'string'
              ? entry.last_seen_timestamp
              : fallback?.last_seen_timestamp ?? new Date().toISOString(),
        };
      }
    }

    const rawLevels = (raw.brawler_levels ?? {}) as Partial<Record<BrawlerId, unknown>>;
    const brawlerLevels: Record<BrawlerId, number> = {
      TIMO: normalizeLevel(rawLevels.TIMO),
      LEO: normalizeLevel(rawLevels.LEO),
      MAYA: normalizeLevel(rawLevels.MAYA),
      ZACK: normalizeLevel(rawLevels.ZACK),
    };

    const claimedMilestones = Array.isArray(raw.claimed_milestones)
      ? Array.from(
          new Set(
            raw.claimed_milestones.filter(
              (n): n is number => typeof n === 'number' && Number.isFinite(n)
            )
          )
        )
      : [];

    const rawQuests = Array.isArray(raw.daily_quests) ? raw.daily_quests : [];
    const dailyQuests: IDailyQuest[] = defaults.daily_quests.map((def) => {
      const saved = rawQuests.find((q) => q && q.id === def.id);
      if (!saved) return def;
      return {
        ...def,
        progress:
          typeof saved.progress === 'number' && Number.isFinite(saved.progress)
            ? Math.max(0, Math.min(def.target, Math.floor(saved.progress)))
            : def.progress,
        claimed: Boolean(saved.claimed),
      };
    });

    const spacedEntries = Array.isArray(raw.spaced_repetition_entries)
      ? raw.spaced_repetition_entries
          .filter(
            (e): e is ISpacedRepetitionEntry =>
              Boolean(e) &&
              typeof e === 'object' &&
              Boolean(e.question) &&
              typeof e.question.id === 'string' &&
              Array.isArray(e.question.targets)
          )
          .map(cloneSpacedEntry)
      : [];

    const validQuestStatuses: QuestStatus[] = [
      'LOCKED',
      'AVAILABLE',
      'ACTIVE',
      'COMPLETED',
      'CLAIMED',
    ];
    const questProgress: Record<string, IQuestProgressRecord> = {};
    if (raw.quest_progress && typeof raw.quest_progress === 'object') {
      for (const [questId, qEntry] of Object.entries(raw.quest_progress)) {
        if (!qEntry || typeof qEntry !== 'object') continue;
        questProgress[questId] = {
          quest_id: typeof qEntry.quest_id === 'string' ? qEntry.quest_id : questId,
          status: validQuestStatuses.includes(qEntry.status) ? qEntry.status : 'AVAILABLE',
          current_objective_index:
            typeof qEntry.current_objective_index === 'number' &&
            Number.isFinite(qEntry.current_objective_index)
              ? Math.max(0, Math.floor(qEntry.current_objective_index))
              : 0,
          current_count:
            typeof qEntry.current_count === 'number' && Number.isFinite(qEntry.current_count)
              ? Math.max(0, Math.floor(qEntry.current_count))
              : 0,
          updated_at:
            typeof qEntry.updated_at === 'string'
              ? qEntry.updated_at
              : new Date().toISOString(),
        };
      }
    }

    const rawAccessibility = (raw.accessibility_settings ?? {}) as Partial<IAccessibilitySettings>;
    const accessibilitySettings: IAccessibilitySettings = {
      smart_auto_aim:
        typeof rawAccessibility.smart_auto_aim === 'boolean'
          ? rawAccessibility.smart_auto_aim
          : defaults.accessibility_settings.smart_auto_aim,
      visual_gps_compass:
        typeof rawAccessibility.visual_gps_compass === 'boolean'
          ? rawAccessibility.visual_gps_compass
          : defaults.accessibility_settings.visual_gps_compass,
      calm_mode:
        typeof rawAccessibility.calm_mode === 'boolean'
          ? rawAccessibility.calm_mode
          : defaults.accessibility_settings.calm_mode,
      auto_hint_assist:
        typeof rawAccessibility.auto_hint_assist === 'boolean'
          ? rawAccessibility.auto_hint_assist
          : defaults.accessibility_settings.auto_hint_assist,
      onboarding_seen:
        typeof rawAccessibility.onboarding_seen === 'boolean'
          ? rawAccessibility.onboarding_seen
          : defaults.accessibility_settings.onboarding_seen,
    };

    return {
      player_profile: playerProfile,
      skill_mastery: skillMastery,
      combat_telemetry_log: Array.isArray(raw.combat_telemetry_log)
        ? raw.combat_telemetry_log
        : defaults.combat_telemetry_log,
      quest_progress: questProgress,
      next_log_id:
        typeof raw.next_log_id === 'number' && Number.isFinite(raw.next_log_id)
          ? Math.max(1, Math.floor(raw.next_log_id))
          : defaults.next_log_id,
      combat_stars:
        typeof raw.combat_stars === 'number' && Number.isFinite(raw.combat_stars)
          ? Math.max(0, Math.floor(raw.combat_stars))
          : 0,
      knowledge_points:
        typeof raw.knowledge_points === 'number' && Number.isFinite(raw.knowledge_points)
          ? Math.max(0, Math.floor(raw.knowledge_points))
          : 0,
      unlocked_rewards: Array.isArray(raw.unlocked_rewards)
        ? raw.unlocked_rewards.filter((x): x is string => typeof x === 'string')
        : [],
      brawler_levels: brawlerLevels,
      claimed_milestones: claimedMilestones,
      daily_quests: dailyQuests,
      spaced_repetition_entries: spacedEntries,
      accessibility_settings: accessibilitySettings,
    };
  }

  private persist(): void {
    this.saveToLocalStorage();
    void this.saveToIndexedDB();
  }

  private loadFromLocalStorage(): ISqliteInternalState | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<ISqliteInternalState>;
      return this.normalizeState(parsed);
    } catch {
      return null;
    }
  }

  private saveToLocalStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Quota atteint ou mode privé
    }
  }

  private openIdb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async loadFromIndexedDB(): Promise<ISqliteInternalState | null> {
    const db = await this.openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () =>
        resolve(
          req.result
            ? this.normalizeState(req.result as Partial<ISqliteInternalState>)
            : null
        );
      req.onerror = () => reject(req.error);
    });
  }

  private async saveToIndexedDB(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
      const db = await this.openIdb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const req = store.put(this.state, IDB_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Ignore en cas de stockage bloqué
    }
  }
}
