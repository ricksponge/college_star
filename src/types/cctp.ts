/**
 * Contrats d'interfaces partagés — Projet « Brawl Collège : Opération 6ème »
 * Référence : CCTP-BC6E-2026-V2
 */

// ============================================================================
// 1. PÉDAGOGIE & SERVICE QUESTIONPROVIDER (Agent 2 : PEDA-6e)
// ============================================================================

export type SubjectCategory =
  | 'mathematiques'
  | 'francais'
  | 'anglais'
  | 'histoire_geo_sciences'
  | 'vie_au_college';

export interface IQuestionTarget {
  /** Étiquette affichée sur le drone/gemme/porte (1 à 2 mots max) */
  label: string;
  /** Indique si la cible correspond à la bonne réponse */
  is_correct: boolean;
}

export interface IQuestion {
  /** Identifiant unique de la question (ex: 'COL_ORG_019') */
  id: string;
  /** Domaine du Bulletin Officiel (5 piliers CM2 -> 6ème) */
  subject: SubjectCategory;
  /** Code de compétence ciblée (ex: 'MATH_FRAC', 'FR_HOMO', 'COL_EDT') */
  skill_code: string;
  /** Difficulté Elo de la question (échelle 600 à 1600) */
  elo_difficulty: number;
  /** Défi Flash affiché dans le bandeau supérieur (7 mots max) */
  hud_prompt: string;
  /** Bulle corrective flash affichée pendant 1,2s en cas d'erreur */
  explanation_flash: string;
  /** Liste des cibles (1 bonne réponse et leurres) */
  targets: IQuestionTarget[];
}

export interface IEloUpdateResult {
  skill_code: string;
  previous_elo: number;
  new_elo: number;
  actual_score: 0 | 0.7 | 1;
  expected_score: number;
  queued_for_spaced_repetition: boolean;
}

// ============================================================================
// 2. ROSTER & SYSTÈME DE COMBAT 60 FPS (Agent 1 : GD-Core)
// ============================================================================

export type BrawlerId = 'TIMO' | 'LEO' | 'MAYA' | 'ZACK';

export type MovementSpeedTier = 'NORMALE' | 'RAPIDE' | 'TRES_RAPIDE';

export interface IBrawlerAttack {
  name: string;
  description: string;
  /** Dégâts de base au niveau 1 (D_base) */
  base_damage: number;
  /** Nombre de projectiles par salve (ex: 2 pour Zack Double Beat, 1 par défaut) */
  projectiles_count: number;
  /** Portée en unités d'arène */
  range: number;
}

export interface IBrawlerSuper {
  name: string;
  description: string;
  /** Points d'objectif bonus accordés (US-02 : +2 points d'objectif) */
  bonus_objective_points: number;
  /** Valeur de soin par seconde ou de bouclier éventuel */
  effect_value?: number;
  /** Durée de l'effet en secondes */
  duration_sec?: number;
}

export interface IBrawlerGadget {
  name: string;
  description: string;
  /** Nombre de charges par partie (fixé à 3 dans le CCTP) */
  charges_per_match: 3;
  /** Durée de l'effet en secondes */
  duration_sec: number;
}

export interface IBrawler {
  id: BrawlerId;
  name: string;
  title: string;
  archetype: string;
  favorite_subject: SubjectCategory;
  /** Matière secondaire éventuelle (ex: Zack : Anglais & Vie au Collège) */
  secondary_subject?: SubjectCategory;
  visual_description: string;
  /** Points de vie de base au niveau 1 (PV_max) */
  base_hp: number;
  /** Palier de vitesse */
  speed_tier: MovementSpeedTier;
  /** Vitesse numérique (720 Normale, 770 Rapide, 820 Très Rapide) */
  speed_value: 720 | 770 | 820;
  /** Barres de munitions max (3 barres) */
  max_ammo_bars: 3;
  basic_attack: IBrawlerAttack;
  super_ability: IBrawlerSuper;
  gadget: IBrawlerGadget;
}

export interface ICombatImpactInput {
  base_damage: number;
  brawler_level: number;
  consecutive_correct_hits: number;
  is_correct: boolean;
  reaction_time_ms: number;
  player_max_hp: number;
}

export interface ICombatImpactResult {
  /** D_final = D_base * (1 + 0.08 * (N_niveau - 1)) * M_combo */
  final_damage: number;
  /** Multiplicateur de combo appliqué (1.0 à 1.60 par pas de +0.15) */
  combo_multiplier: number;
  /** Gain de jauge de Super en pourcentage : 34% + (6% * V_reflexe) */
  super_charge_gain_pct: number;
  /** Dégâts d'onde de choc subis par le joueur en cas d'erreur : 12% * PV_max */
  error_penalty_damage: number;
  /** Déclenche la bulle corrective flash pendant 1200 ms si is_correct === false */
  trigger_explanation_flash_ms: number;
}

// ============================================================================
// 3. LES 5 MODES DE JEU & ARÈNES (Agent 3 : MODES)
// ============================================================================

export type GameModeId =
  | 'CHASSE_AUX_BONNES_NOTES'
  | 'MATCH_DES_ACCORDS'
  | 'INTERRO_SURPRISE'
  | 'CHANGEMENT_DE_SALLE'
  | 'CONSEIL_DE_CLASSE';

export type GameModeFormat = '3v3' | 'SOLO_10' | 'SOLO_COOP' | 'PVE_BOSS';

export interface IGameMode {
  id: GameModeId;
  /** Numéro du mode dans le CCTP (1 à 5) */
  mode_number: 1 | 2 | 3 | 4 | 5;
  name: string;
  inspired_by: string;
  format: GameModeFormat;
  /** Durée réglementaire de la partie en secondes (120s, 135s ou 150s) */
  duration_seconds: 120 | 135 | 150;
  target_subject?: SubjectCategory;
  description: string;
  victory_condition: string;
}

// ============================================================================
// 4. STOCKAGE SQLITE, CASIERS MYSTÈRES & DASHBOARD PARENT (Agent 4 : META-Dash)
// ============================================================================

export type StarrDropRarity = 'RARE' | 'SUPER_RARE' | 'EPIQUE' | 'LEGENDAIRE';

export interface IPlayerProfile {
  /** Identifiant unique contraint à 1 dans SQLite : CHECK (id = 1) */
  id: 1;
  nickname: string;
  /** Trophées sur la Route vers la 6ème (0 à 1000 : Rentrée CM2 -> Major de 6ème) */
  trophies: number;
  coins: number;
  starr_drops_available: number;
  selected_brawler: BrawlerId;
  /** Code PIN hashé (défaut '0000') pour déverrouiller le Carnet Parent */
  parent_pin_hash: string;
}

export interface ISkillMastery {
  /** Clé primaire (ex: 'MATH_FRAC', 'FR_HOMO', 'COL_EDT') */
  skill_code: string;
  subject_category: SubjectCategory;
  /** Score de maîtrise caché E_k (initialisé à 1000, borné de 600 à 1600) */
  elo_rating: number;
  attempts_count: number;
  success_count: number;
  /** Temps de réaction moyen en millisecondes (défaut 3500) */
  avg_response_ms: number;
  /** Horodatage ISO 8601 de la dernière rencontre */
  last_seen_timestamp: string;
}

export interface ITelemetryLog {
  id?: number;
  question_id: string;
  brawler_used: BrawlerId;
  is_hit_correct: boolean;
  reaction_time_ms: number;
  recorded_at?: string;
}

export interface IStarrDropReward {
  final_rarity: StarrDropRarity;
  taps_count: 4;
  coins_granted: number;
  trophies_granted: number;
  knowledge_points_granted: number;
  unlocked_badge_or_skin?: string;
  secret_tip_6e?: string;
}

export interface IParentSubjectSummary {
  subject: SubjectCategory;
  success_rate_pct: number;
  avg_reaction_time_ms: number;
  skills_to_consolidate: string[];
  attempts_count?: number;
}

export interface IParentSerenityReport {
  serenity_score_pct: number;
  status_label: string;
  campus_autonomy_pct: number;
  executive_calm_pct: number;
  explored_skills_count: number;
  total_skills_count: number;
}

export interface IDailyQuest {
  id: string;
  title: string;
  target: number;
  progress: number;
  reward_coins: number;
  reward_stars: number;
  claimed: boolean;
  kind: 'CORRECT_HITS' | 'FAST_REFLEX' | 'MATCH_WINS';
}

// ============================================================================
// 5. JALON M4 : EXPLORATION DU COLLÈGE, QUÊTES & MISSIONS (#21 à #25)
// ============================================================================

export type CampusRoomId =
  | 'COUR_HONNEUR'
  | 'HALL_CASIERS'
  | 'VIE_SCOLAIRE_CPE'
  | 'CDI_BIBLIOTHEque'
  | 'SALLE_101_MATHS'
  | 'SALLE_102_FRANCAIS'
  | 'SALLE_201_ANGLAIS'
  | 'SALLE_204_SCIENCES'
  | 'CANTINE_SELF'
  | 'GYMNASE_SPORTS';

export interface ICampusRoomZone {
  id: CampusRoomId;
  name: string;
  floor_label: string;
  subject?: SubjectCategory;
  bounds: { x: number; y: number; width: number; height: number };
  floor_color: string;
  accent_color: string;
  description: string;
}

export type CampusNpcRole =
  | 'CPE'
  | 'DOCUMENTALISTE_CDI'
  | 'PROF_MATHS'
  | 'PROF_FRANCAIS'
  | 'PROF_ANGLAIS'
  | 'PROF_SCIENCES'
  | 'DELEGUE_ELEVE'
  | 'COACH_GYM'
  | 'PANNEAU_EDT';

export interface ICampusNpc {
  id: string;
  name: string;
  title: string;
  role: CampusNpcRole;
  room_id: CampusRoomId;
  x: number;
  y: number;
  interaction_radius: number;
  primary_color: string;
  accent_color: string;
  greeting_flash: string;
  linked_arena_mode?: GameModeId;
}

export type QuestObjectiveType =
  | 'VISIT_ROOM'
  | 'TALK_NPC'
  | 'SOLVE_ROOM_QUESTIONS'
  | 'COLLECT_CAMPUS_BADGE'
  | 'COMPLETE_ARENA_PORTAL';

export type QuestCategory = 'PRINCIPALE' | 'MATIERE' | 'VIE_COLLEGE' | 'DEFIS_204';

export interface IQuestObjective {
  id: string;
  type: QuestObjectiveType;
  description: string;
  target_room_id: CampusRoomId;
  target_npc_id?: string;
  subject?: SubjectCategory;
  required_count: number;
}

export interface IQuestReward {
  coins: number;
  trophies: number;
  combat_stars: number;
  knowledge_points: number;
  starr_drop_bonus?: number;
  unlocked_title_or_badge?: string;
}

export interface ICampusQuest {
  id: string;
  chapter_order: number;
  category: QuestCategory;
  title: string;
  giver_npc_id: string;
  briefing_short: string;
  objectives: IQuestObjective[];
  reward: IQuestReward;
}

export type QuestStatus = 'LOCKED' | 'AVAILABLE' | 'ACTIVE' | 'COMPLETED' | 'CLAIMED';

export interface IQuestProgressRecord {
  quest_id: string;
  status: QuestStatus;
  current_objective_index: number;
  current_count: number;
  updated_at: string;
}

export interface IQuestStepAdvanceResult {
  advanced: boolean;
  objectiveCompleted: boolean;
  questCompleted: boolean;
  completedQuest?: ICampusQuest;
  rewardGranted?: IQuestReward;
  message?: string;
  nextActiveQuest?: ICampusQuest | null;
}

// ============================================================================
// 6. ACCESSIBILITÉ & GUIDAGE BRAWL STARS (Zéro Friction Scolaire)
// ============================================================================

export interface IAccessibilitySettings {
  /** Visée assistée intelligente (cible prioritairement la cible pointée ou la bonne réponse si révélée) */
  smart_auto_aim: boolean;
  /** Flèche GPS dorée permanente au sol vers l'objectif de mode / quête */
  visual_gps_compass: boolean;
  /** Vitesse adoucie (-20% vitesse des drones et lasers) pour jouer sereinement */
  calm_mode: boolean;
  /** Indice automatique après 2 erreurs ou 9 secondes d'hésitation */
  auto_hint_assist: boolean;
  /** Indique si le mini-tutoriel visuel Brawl Stars a déjà été vu */
  onboarding_seen: boolean;
}

export interface ISubjectVisualMeta {
  subject: SubjectCategory;
  short_label: string;
  icon: string;
  accent_color: string;
  badge_bg: string;
}
