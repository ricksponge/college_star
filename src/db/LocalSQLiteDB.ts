import type {
  IParentSubjectSummary,
  IPlayerProfile,
  IQuestProgressRecord,
  IQuestReward,
  ISkillMastery,
  ITelemetryLog,
  SubjectCategory,
} from '../types/cctp';

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

interface ISqliteInternalState {
  player_profile: IPlayerProfile;
  skill_mastery: Record<string, ISkillMastery>;
  combat_telemetry_log: ITelemetryLog[];
  quest_progress: Record<string, IQuestProgressRecord>;
  next_log_id: number;
  combat_stars: number;
  knowledge_points: number;
  unlocked_rewards: string[];
}

const ALL_SUBJECTS: SubjectCategory[] = [
  'mathematiques',
  'francais',
  'anglais',
  'histoire_geo_sciences',
  'vie_au_college',
];

const DEFAULT_SKILLS: Array<{ code: string; subject: SubjectCategory }> = [
  { code: 'MATH_MUL', subject: 'mathematiques' },
  { code: 'MATH_FRAC', subject: 'mathematiques' },
  { code: 'FR_HOMO', subject: 'francais' },
  { code: 'FR_ACC', subject: 'francais' },
  { code: 'ANG_VOC', subject: 'anglais' },
  { code: 'ANG_AUX', subject: 'anglais' },
  { code: 'HG_PER', subject: 'histoire_geo_sciences' },
  { code: 'SCI_SOL', subject: 'histoire_geo_sciences' },
  { code: 'COL_EDT', subject: 'vie_au_college' },
  { code: 'COL_ADU', subject: 'vie_au_college' },
];

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
      const idbQuestCount = idbState ? Object.keys(idbState.quest_progress).length : 0;
      const localQuestCount = Object.keys(this.state.quest_progress).length;
      if (
        idbState &&
        (idbState.next_log_id > this.state.next_log_id ||
          (idbState.next_log_id === this.state.next_log_id && idbQuestCount > localQuestCount))
      ) {
        this.state = idbState;
        if (!this.state.quest_progress) {
          this.state.quest_progress = {};
        }
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
    this.state.player_profile = {
      ...this.state.player_profile,
      ...patch,
      id: 1,
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
      };
    });
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
    const lines: string[] = [
      SQLITE_SCHEMA_DDL,
      `INSERT OR REPLACE INTO player_profile (id, nickname, trophies, coins, starr_drops_available, selected_brawler, parent_pin_hash) VALUES (1, '${p.nickname.replace(/'/g, "''")}', ${p.trophies}, ${p.coins}, ${p.starr_drops_available}, '${p.selected_brawler}', '${p.parent_pin_hash}');`,
    ];

    for (const s of Object.values(this.state.skill_mastery)) {
      lines.push(
        `INSERT OR REPLACE INTO skill_mastery (skill_code, subject_category, elo_rating, attempts_count, success_count, avg_response_ms, last_seen_timestamp) VALUES ('${s.skill_code}', '${s.subject_category}', ${s.elo_rating}, ${s.attempts_count}, ${s.success_count}, ${s.avg_response_ms}, '${s.last_seen_timestamp}');`
      );
    }

    for (const log of this.state.combat_telemetry_log) {
      lines.push(
        `INSERT INTO combat_telemetry_log (question_id, brawler_used, is_hit_correct, reaction_time_ms, recorded_at) VALUES ('${log.question_id}', '${log.brawler_used}', ${log.is_hit_correct ? 1 : 0}, ${log.reaction_time_ms}, '${log.recorded_at ?? ''}');`
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

  private normalizeLoadedState(
    rawState: Partial<ISqliteInternalState> | null | undefined
  ): ISqliteInternalState | null {
    if (!rawState || typeof rawState !== 'object') {
      return null;
    }
    const defaults = createDefaultState();
    return {
      ...defaults,
      ...rawState,
      player_profile: {
        ...defaults.player_profile,
        ...(rawState.player_profile ?? {}),
        id: 1,
      },
      skill_mastery: rawState.skill_mastery ?? defaults.skill_mastery,
      combat_telemetry_log: Array.isArray(rawState.combat_telemetry_log)
        ? rawState.combat_telemetry_log
        : [],
      quest_progress:
        rawState.quest_progress && typeof rawState.quest_progress === 'object'
          ? rawState.quest_progress
          : {},
      unlocked_rewards: Array.isArray(rawState.unlocked_rewards)
        ? rawState.unlocked_rewards
        : [],
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
      return this.normalizeLoadedState(parsed);
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
        resolve(this.normalizeLoadedState(req.result as Partial<ISqliteInternalState> | undefined));
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
