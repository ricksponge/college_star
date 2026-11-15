import type {
  CampusRoomId,
  ICampusQuest,
  IQuestObjective,
  IQuestProgressRecord,
  IQuestReward,
  QuestCategory,
  QuestStatus,
} from '../types/cctp';
import type { LocalSQLiteDB } from '../db/LocalSQLiteDB';
import { soundManager } from '../services/SoundManager';

export interface IQuestJournalService {
  getAllQuestsWithStatus(): Array<{ quest: ICampusQuest; progress: IQuestProgressRecord }>;
  getActiveQuest(): {
    quest: ICampusQuest;
    progress: IQuestProgressRecord;
    activeObjective: IQuestObjective;
  } | null;
  selectActiveQuest(questId: string): void;
  claimQuestReward(questId: string): IQuestReward | null;
}

export type QuestFilterCategory = 'TOUTES' | QuestCategory;

export interface IQuestJournalOpenOptions {
  onClose?: () => void;
  onStartCampusExploration?: () => void;
  onQuestSelected?: () => void;
  onTeleportToQuestRoom?: (roomId: CampusRoomId) => void;
}

const CAMPUS_ROOM_LABELS: Record<CampusRoomId, string> = {
  COUR_HONNEUR: "Cour d'Honneur",
  HALL_CASIERS: 'Hall des Casiers',
  VIE_SCOLAIRE_CPE: 'Vie Scolaire (CPE)',
  CDI_BIBLIOTHEque: 'CDI / Bibliothèque',
  SALLE_101_MATHS: 'Salle 101 (Maths — 1er étage)',
  SALLE_102_FRANCAIS: 'Salle 102 (Français — 1er étage)',
  SALLE_201_ANGLAIS: 'Salle 201 (Anglais — 2e étage)',
  SALLE_204_SCIENCES: 'Salle 204 (Sciences — 2e étage)',
  CANTINE_SELF: 'Cantine / Self',
  GYMNASE_SPORTS: 'Gymnase & Sports',
};

const CATEGORY_META: Record<QuestCategory, { label: string; color: string; bg: string }> = {
  PRINCIPALE: { label: 'PRINCIPALE', color: '#facc15', bg: 'rgba(250,204,21,0.16)' },
  MATIERE: { label: 'MATIÈRE', color: '#38bdf8', bg: 'rgba(56,189,248,0.16)' },
  VIE_COLLEGE: { label: 'VIE AU COLLÈGE', color: '#4ade80', bg: 'rgba(74,222,128,0.16)' },
  DEFIS_204: { label: 'DÉFIS 204', color: '#c084fc', bg: 'rgba(192,132,252,0.16)' },
};

const FILTER_TABS: Array<{ id: QuestFilterCategory; label: string }> = [
  { id: 'TOUTES', label: 'Toutes' },
  { id: 'PRINCIPALE', label: 'Principale' },
  { id: 'MATIERE', label: 'Matières' },
  { id: 'VIE_COLLEGE', label: 'Vie au Collège' },
  { id: 'DEFIS_204', label: 'Défis 204' },
];

const STATUS_META: Record<
  QuestStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  ACTIVE: {
    label: 'EN COURS',
    color: '#0f172a',
    bg: '#facc15',
    border: '#facc15',
  },
  AVAILABLE: {
    label: 'DISPONIBLE',
    color: '#38bdf8',
    bg: 'rgba(56,189,248,0.16)',
    border: '#38bdf8',
  },
  COMPLETED: {
    label: 'TERMINÉE',
    color: '#0f172a',
    bg: '#4ade80',
    border: '#4ade80',
  },
  CLAIMED: {
    label: 'ACCOMPLIE',
    color: '#86efac',
    bg: 'rgba(34,197,94,0.14)',
    border: '#334155',
  },
  LOCKED: {
    label: 'VERROUILLÉE',
    color: '#94a3b8',
    bg: 'rgba(148,163,184,0.12)',
    border: '#334155',
  },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCampusRoom(roomId: CampusRoomId): string {
  return CAMPUS_ROOM_LABELS[roomId] ?? roomId;
}

function isAccomplishedStatus(status: QuestStatus): boolean {
  return status === 'COMPLETED' || status === 'CLAIMED';
}

function computeObjectiveProgress(
  objective: IQuestObjective,
  index: number,
  progress: IQuestProgressRecord
): { completed: boolean; isCurrent: boolean; count: number; required: number } {
  const required = Math.max(1, objective.required_count);
  if (isAccomplishedStatus(progress.status) || index < progress.current_objective_index) {
    return { completed: true, isCurrent: false, count: required, required };
  }
  if (index === progress.current_objective_index) {
    const count = Math.min(required, Math.max(0, progress.current_count));
    return {
      completed: count >= required,
      isCurrent: progress.status === 'ACTIVE',
      count,
      required,
    };
  }
  return { completed: false, isCurrent: false, count: 0, required };
}

function buildRewardBadgesHtml(reward: IQuestReward): string {
  const badges: string[] = [];
  if (reward.coins > 0) {
    badges.push(
      `<span style="background:rgba(250,204,21,0.14); border:1px solid rgba(250,204,21,0.4); color:#fde047; padding:3px 8px; border-radius:999px; font-size:11px; font-weight:800;">🪙 +${reward.coins} Pièces</span>`
    );
  }
  if (reward.trophies > 0) {
    badges.push(
      `<span style="background:rgba(56,189,248,0.14); border:1px solid rgba(56,189,248,0.4); color:#7dd3fc; padding:3px 8px; border-radius:999px; font-size:11px; font-weight:800;">🏆 +${reward.trophies} Trophées</span>`
    );
  }
  if (reward.combat_stars > 0) {
    badges.push(
      `<span style="background:rgba(251,146,60,0.15); border:1px solid rgba(251,146,60,0.45); color:#fdba74; padding:3px 8px; border-radius:999px; font-size:11px; font-weight:800;">⭐ +${reward.combat_stars} Étoiles</span>`
    );
  }
  if (reward.knowledge_points > 0) {
    badges.push(
      `<span style="background:rgba(74,222,128,0.14); border:1px solid rgba(74,222,128,0.4); color:#86efac; padding:3px 8px; border-radius:999px; font-size:11px; font-weight:800;">📖 +${reward.knowledge_points} Savoir</span>`
    );
  }
  if ((reward.starr_drop_bonus ?? 0) > 0) {
    badges.push(
      `<span style="background:rgba(244,114,182,0.16); border:1px solid rgba(244,114,182,0.45); color:#f9a8d4; padding:3px 8px; border-radius:999px; font-size:11px; font-weight:800;">🎁 +${reward.starr_drop_bonus} Casier</span>`
    );
  }
  if (reward.unlocked_title_or_badge) {
    badges.push(
      `<span style="background:rgba(192,132,252,0.16); border:1px solid rgba(192,132,252,0.45); color:#e9d5ff; padding:3px 8px; border-radius:999px; font-size:11px; font-weight:800;">🏅 ${escapeHtml(reward.unlocked_title_or_badge)}</span>`
    );
  }
  return badges.join('');
}

/**
 * Modale « Carnet de Quêtes & Missions du Collège » (Ticket #24).
 * Permet de consulter les 12 quêtes du collège, suivre une mission active,
 * filtrer par catégorie, réclamer les récompenses et lancer l'exploration 3D.
 */
export class QuestJournalModal {
  private readonly db: LocalSQLiteDB;
  private readonly questService: IQuestJournalService;

  constructor(db: LocalSQLiteDB, questService: IQuestJournalService) {
    this.db = db;
    this.questService = questService;
  }

  public open(options?: IQuestJournalOpenOptions): void {
    let activeFilter: QuestFilterCategory = 'TOUTES';
    let claimedBanner: { title: string; reward: IQuestReward } | null = null;
    let isClosed = false;

    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed; inset:0; background:rgba(2,6,23,0.92); display:flex; align-items:center; justify-content:center; z-index:9999; font-family:system-ui,sans-serif; padding:16px;';

    const modal = document.createElement('div');
    modal.style.cssText =
      'width:min(960px, 96vw); max-height:92vh; overflow-y:auto; background:#0f172a; border:2px solid #facc15; border-radius:20px; padding:22px; color:#f8fafc; box-shadow:0 24px 64px rgba(0,0,0,0.78);';
    overlay.appendChild(modal);

    const cleanupDom = (): void => {
      if (isClosed) return;
      isClosed = true;
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
    };

    const closeModal = (): void => {
      if (isClosed) return;
      cleanupDom();
      options?.onClose?.();
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeModal();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeModal();
      }
    });

    const render = (): void => {
      const profile = this.db.getPlayerProfile();
      const allEntries = [...this.questService.getAllQuestsWithStatus()].sort(
        (a, b) => a.quest.chapter_order - b.quest.chapter_order
      );
      const totalCount = allEntries.length;
      const completedCount = allEntries.filter((e) =>
        isAccomplishedStatus(e.progress.status)
      ).length;
      const claimableCount = allEntries.filter((e) => e.progress.status === 'COMPLETED').length;
      const progressPct =
        totalCount > 0 ? Math.min(100, Math.round((completedCount / totalCount) * 100)) : 0;

      const activeQuestInfo = this.questService.getActiveQuest();
      const filteredEntries =
        activeFilter === 'TOUTES'
          ? allEntries
          : allEntries.filter((entry) => entry.quest.category === activeFilter);

      const categoryCounts: Record<QuestFilterCategory, number> = {
        TOUTES: allEntries.length,
        PRINCIPALE: allEntries.filter((e) => e.quest.category === 'PRINCIPALE').length,
        MATIERE: allEntries.filter((e) => e.quest.category === 'MATIERE').length,
        VIE_COLLEGE: allEntries.filter((e) => e.quest.category === 'VIE_COLLEGE').length,
        DEFIS_204: allEntries.filter((e) => e.quest.category === 'DEFIS_204').length,
      };

      const exploreBtnHtml = options?.onStartCampusExploration
        ? `<button id="qj-explore-btn" style="padding:8px 14px; border-radius:10px; border:none; background:linear-gradient(135deg,#22c55e,#16a34a); color:#fff; font-weight:900; font-size:13px; cursor:pointer; box-shadow:0 4px 16px rgba(34,197,94,0.35);">
             🏫 Explorer le Collège
           </button>`
        : '';

      const claimAllBtnHtml =
        claimableCount > 0
          ? `<button id="qj-claim-all-btn" type="button" class="pulse-glow" style="padding:7px 14px; border-radius:10px; border:none; background:linear-gradient(135deg,#4ade80,#22c55e); color:#0f172a; font-weight:900; font-size:13px; cursor:pointer; box-shadow:0 4px 14px rgba(74,222,128,0.38);">
               🎁 Tout récupérer (${claimableCount})
             </button>`
          : '';

      const claimedBannerHtml = claimedBanner
        ? `<div style="margin-bottom:14px; padding:12px 14px; border-radius:12px; background:rgba(74,222,128,0.14); border:1px solid #4ade80; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px;">
             <div>
               <div style="font-size:13px; font-weight:900; color:#86efac;">🎉 Récompense récupérée — ${escapeHtml(claimedBanner.title)}</div>
               <div style="font-size:12px; color:#cbd5e1; margin-top:2px;">Ton profil SQLite a été crédité immédiatement !</div>
             </div>
             <div style="display:flex; flex-wrap:wrap; gap:6px;">
               ${buildRewardBadgesHtml(claimedBanner.reward)}
             </div>
           </div>`
        : '';

      const activeQuestBannerHtml = activeQuestInfo
        ? `<div style="margin-bottom:14px; padding:12px 14px; border-radius:12px; background:linear-gradient(135deg, rgba(250,204,21,0.14), rgba(56,189,248,0.1)); border:1px solid rgba(250,204,21,0.55); display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:10px;">
             <div>
               <div style="font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:0.8px; color:#facc15;">📍 Mission Suivie Actuellement</div>
               <div style="font-size:15px; font-weight:900; color:#f8fafc; margin-top:2px;">${escapeHtml(activeQuestInfo.quest.title)}</div>
               <div style="font-size:12px; color:#cbd5e1; margin-top:2px;">
                 Objectif en cours : <strong>${escapeHtml(activeQuestInfo.activeObjective.description)}</strong> • Salle cible : <span style="color:#7dd3fc; font-weight:700;">${escapeHtml(formatCampusRoom(activeQuestInfo.activeObjective.target_room_id))}</span>
               </div>
             </div>
             <div style="background:#0f172a; border:1px solid #334155; border-radius:10px; padding:6px 12px; text-align:center;">
               <div style="font-size:14px; font-weight:900; color:#facc15;">
                 ${Math.min(activeQuestInfo.activeObjective.required_count, Math.max(0, activeQuestInfo.progress.current_count))} / ${activeQuestInfo.activeObjective.required_count}
               </div>
               <div style="font-size:10px; color:#94a3b8;">Progression</div>
             </div>
           </div>`
        : '';

      modal.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
          <div>
            <h2 style="margin:0; font-size:22px; font-weight:900; color:#facc15;">🗺️ Carnet de Quêtes & Missions du Collège</h2>
            <div style="font-size:12px; color:#94a3b8; margin-top:4px; display:flex; flex-wrap:wrap; gap:10px;">
              <span>🪙 <strong style="color:#fde047;">${profile.coins}</strong> Pièces</span>
              <span>🏆 <strong style="color:#7dd3fc;">${profile.trophies}/1000</strong> Trophées</span>
              <span>⭐ <strong style="color:#fdba74;">${this.db.getCombatStars()}</strong> Étoiles</span>
              <span>📖 <strong style="color:#86efac;">${this.db.getKnowledgePoints()}</strong> Savoir</span>
              <span>🎁 <strong style="color:#f9a8d4;">${profile.starr_drops_available}</strong> Casier(s)</span>
            </div>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
            ${exploreBtnHtml}
            <button id="qj-close-btn" style="background:#334155; color:#fff; border:none; border-radius:10px; padding:8px 14px; cursor:pointer; font-weight:800; font-size:13px;">
              Fermer
            </button>
          </div>
        </div>

        <!-- Barre de progression globale -->
        <div style="background:#1e293b; border:1px solid #334155; border-radius:14px; padding:12px 14px; margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
            <span style="font-size:14px; font-weight:900; color:#f8fafc;">
              Progression globale : <span style="color:#4ade80;">${completedCount} / ${totalCount} quêtes accomplies</span>
            </span>
            <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
              <span style="font-size:12px; font-weight:800; color:${claimableCount > 0 ? '#4ade80' : '#94a3b8'};">
                ${claimableCount > 0 ? `🎁 ${claimableCount} récompense(s) prête(s) à récupérer !` : `${progressPct}% complété`}
              </span>
              ${claimAllBtnHtml}
            </div>
          </div>
          <div style="height:10px; background:#0f172a; border-radius:999px; overflow:hidden; border:1px solid #334155;">
            <div style="width:${progressPct}%; height:100%; background:linear-gradient(90deg, #38bdf8, #4ade80, #facc15); transition:width 0.25s ease;"></div>
          </div>
        </div>

        ${claimedBannerHtml}
        ${activeQuestBannerHtml}

        <!-- Onglets de filtre par catégorie -->
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;">
          ${FILTER_TABS.map((tab) => {
            const isSelected = activeFilter === tab.id;
            return `
              <button data-quest-filter="${tab.id}" style="padding:7px 12px; border-radius:999px; cursor:pointer; font-size:12px; font-weight:800;
                      border:1.5px solid ${isSelected ? '#facc15' : '#334155'};
                      background:${isSelected ? 'rgba(250,204,21,0.18)' : '#1e293b'};
                      color:${isSelected ? '#facc15' : '#cbd5e1'};">
                ${tab.label} (${categoryCounts[tab.id]})
              </button>
            `;
          }).join('')}
        </div>

        <!-- Liste des quêtes -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(390px, 1fr)); gap:12px;">
          ${
            filteredEntries.length === 0
              ? `<div style="grid-column:1/-1; background:#1e293b; border:1px solid #334155; border-radius:14px; padding:24px; text-align:center; color:#94a3b8; font-size:14px;">
                   Aucune quête disponible dans cette catégorie pour le moment.
                 </div>`
              : filteredEntries
                  .map(({ quest, progress }) => {
                    const catStyle = CATEGORY_META[quest.category];
                    const statusStyle = STATUS_META[progress.status];
                    const objectivesHtml = quest.objectives
                      .map((obj, idx) => {
                        const objState = computeObjectiveProgress(obj, idx, progress);
                        const objPct = Math.min(
                          100,
                          Math.round((objState.count / objState.required) * 100)
                        );
                        const icon = objState.completed ? '✅' : objState.isCurrent ? '🎯' : '⬜';
                        return `
                          <div style="background:#0f172a; border:1px solid ${objState.isCurrent ? 'rgba(250,204,21,0.55)' : '#334155'}; border-radius:10px; padding:8px 10px;">
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                              <div style="font-size:12px; color:${objState.completed ? '#86efac' : '#f1f5f9'}; font-weight:${objState.isCurrent ? '800' : '600'};">
                                ${icon} ${escapeHtml(obj.description)}
                              </div>
                              <span style="font-size:11px; font-weight:900; white-space:nowrap; color:${objState.completed ? '#4ade80' : '#facc15'};">
                                ${objState.count} / ${objState.required}
                              </span>
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:5px;">
                              <span style="font-size:11px; color:#7dd3fc;">📍 ${escapeHtml(formatCampusRoom(obj.target_room_id))}</span>
                              <div style="width:76px; height:5px; background:#1e293b; border-radius:999px; overflow:hidden;">
                                <div style="width:${objPct}%; height:100%; background:${objState.completed ? '#4ade80' : '#38bdf8'};"></div>
                              </div>
                            </div>
                          </div>
                        `;
                      })
                      .join('');

                    const canGoToRoom = Boolean(
                      options?.onTeleportToQuestRoom || options?.onStartCampusExploration
                    );
                    const goQuestRoomBtnHtml = canGoToRoom
                      ? `<button data-go-quest-room="${escapeHtml(quest.id)}" type="button" style="padding:8px 12px; border-radius:10px; border:none; background:linear-gradient(135deg,#facc15,#f59e0b); color:#0f172a; font-weight:900; font-size:12px; cursor:pointer; box-shadow:0 3px 10px rgba(250,204,21,0.3);">
                           🚀 Y aller
                         </button>`
                      : '';

                    let actionAreaHtml = '';
                    if (progress.status === 'COMPLETED') {
                      actionAreaHtml = `
                        <button data-claim-quest="${escapeHtml(quest.id)}" style="padding:8px 14px; border-radius:10px; border:none; background:linear-gradient(135deg,#4ade80,#22c55e); color:#0f172a; font-weight:900; font-size:13px; cursor:pointer; box-shadow:0 4px 14px rgba(74,222,128,0.35);">
                          🎁 Récupérer
                        </button>
                      `;
                    } else if (progress.status === 'AVAILABLE') {
                      actionAreaHtml = `
                        <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:flex-end;">
                          <button data-select-quest="${escapeHtml(quest.id)}" style="padding:8px 14px; border-radius:10px; border:1px solid #38bdf8; background:rgba(56,189,248,0.16); color:#7dd3fc; font-weight:900; font-size:12px; cursor:pointer;">
                            📍 Suivre cette quête
                          </button>
                          ${goQuestRoomBtnHtml}
                        </div>
                      `;
                    } else if (progress.status === 'ACTIVE') {
                      actionAreaHtml = `
                        <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:flex-end;">
                          <span style="padding:6px 12px; border-radius:10px; background:rgba(250,204,21,0.16); border:1px solid rgba(250,204,21,0.5); color:#facc15; font-weight:900; font-size:12px;">
                            📍 Suivie actuellement
                          </span>
                          ${goQuestRoomBtnHtml}
                        </div>
                      `;
                    } else if (progress.status === 'CLAIMED') {
                      actionAreaHtml = `
                        <span style="padding:6px 12px; border-radius:10px; background:rgba(34,197,94,0.12); color:#86efac; font-weight:800; font-size:12px;">
                          ✅ Récompense récupérée
                        </span>
                      `;
                    } else {
                      actionAreaHtml = `
                        <span style="padding:6px 12px; border-radius:10px; background:#0f172a; color:#94a3b8; font-weight:700; font-size:12px;">
                          🔒 Quête verrouillée
                        </span>
                      `;
                    }

                    return `
                      <article style="background:#1e293b; border:2px solid ${statusStyle.border}; border-radius:16px; padding:14px; display:flex; flex-direction:column; justify-content:space-between; gap:10px; opacity:${progress.status === 'LOCKED' ? '0.72' : '1'};">
                        <div>
                          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
                            <span style="background:${catStyle.bg}; color:${catStyle.color}; border:1px solid ${catStyle.color}; padding:2px 8px; border-radius:999px; font-size:10px; font-weight:900;">
                              ${catStyle.label}
                            </span>
                            <span style="background:${statusStyle.bg}; color:${statusStyle.color}; padding:3px 9px; border-radius:999px; font-size:10px; font-weight:900;">
                              ${statusStyle.label}
                            </span>
                          </div>
                          <h3 style="margin:0 0 4px; font-size:16px; font-weight:900; color:#f8fafc;">
                            #${quest.chapter_order} — ${escapeHtml(quest.title)}
                          </h3>
                          <p style="margin:0 0 10px; font-size:12px; color:#cbd5e1; line-height:1.45;">
                            ${escapeHtml(quest.briefing_short)}
                          </p>
                          <div style="display:flex; flex-direction:column; gap:6px;">
                            ${objectivesHtml}
                          </div>
                        </div>

                        <div style="border-top:1px solid #334155; padding-top:10px; display:flex; flex-direction:column; gap:10px;">
                          <div style="display:flex; flex-wrap:wrap; gap:6px;">
                            ${buildRewardBadgesHtml(quest.reward)}
                          </div>
                          <div style="display:flex; justify-content:flex-end; align-items:center;">
                            ${actionAreaHtml}
                          </div>
                        </div>
                      </article>
                    `;
                  })
                  .join('')
          }
        </div>
      `;

      modal.querySelector('#qj-close-btn')?.addEventListener('click', closeModal);

      modal.querySelector('#qj-explore-btn')?.addEventListener('click', () => {
        if (!options?.onStartCampusExploration) return;
        cleanupDom();
        options.onStartCampusExploration();
      });

      modal.querySelector<HTMLButtonElement>('#qj-claim-all-btn')?.addEventListener('click', () => {
        const claimableEntries = allEntries.filter(
          (entry) => entry.progress.status === 'COMPLETED'
        );
        if (claimableEntries.length === 0) return;

        const totalReward: IQuestReward = {
          coins: 0,
          trophies: 0,
          combat_stars: 0,
          knowledge_points: 0,
          starr_drop_bonus: 0,
        };
        const unlockedBadges: string[] = [];
        const claimedTitles: string[] = [];

        for (const entry of claimableEntries) {
          const reward = this.questService.claimQuestReward(entry.quest.id);
          if (!reward) continue;
          claimedTitles.push(entry.quest.title);
          totalReward.coins += Math.max(0, reward.coins);
          totalReward.trophies += Math.max(0, reward.trophies);
          totalReward.combat_stars += Math.max(0, reward.combat_stars);
          totalReward.knowledge_points += Math.max(0, reward.knowledge_points);
          totalReward.starr_drop_bonus =
            (totalReward.starr_drop_bonus ?? 0) + Math.max(0, reward.starr_drop_bonus ?? 0);
          if (reward.unlocked_title_or_badge) {
            unlockedBadges.push(reward.unlocked_title_or_badge);
          }
        }

        if (claimedTitles.length === 0) return;
        if (unlockedBadges.length > 0) {
          totalReward.unlocked_title_or_badge = unlockedBadges.join(' • ');
        }

        soundManager.playStarrDropReveal('EPIQUE');
        claimedBanner = {
          title:
            claimedTitles.length === 1
              ? claimedTitles[0]
              : `${claimedTitles.length} quêtes récupérées !`,
          reward: totalReward,
        };
        render();
      });

      modal.querySelectorAll<HTMLButtonElement>('[data-quest-filter]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const filter = btn.dataset.questFilter as QuestFilterCategory | undefined;
          if (filter) {
            activeFilter = filter;
            render();
          }
        });
      });

      modal.querySelectorAll<HTMLButtonElement>('[data-select-quest]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const questId = btn.dataset.selectQuest;
          if (questId) {
            this.questService.selectActiveQuest(questId);
            render();
            options?.onQuestSelected?.();
          }
        });
      });

      modal.querySelectorAll<HTMLButtonElement>('[data-go-quest-room]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const questId = btn.dataset.goQuestRoom;
          if (!questId) return;
          const entry = allEntries.find((item) => item.quest.id === questId);
          const currentObjective = entry
            ? entry.quest.objectives[entry.progress.current_objective_index] ??
              entry.quest.objectives[0]
            : undefined;
          const targetRoomId: CampusRoomId = currentObjective?.target_room_id ?? 'COUR_HONNEUR';

          this.questService.selectActiveQuest(questId);
          cleanupDom();
          if (options?.onTeleportToQuestRoom) {
            options.onTeleportToQuestRoom(targetRoomId);
          } else {
            options?.onStartCampusExploration?.();
          }
        });
      });

      modal.querySelectorAll<HTMLButtonElement>('[data-claim-quest]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const questId = btn.dataset.claimQuest;
          if (!questId) return;
          const questTitle =
            allEntries.find((entry) => entry.quest.id === questId)?.quest.title ?? questId;
          const reward = this.questService.claimQuestReward(questId);
          if (reward) {
            soundManager.playStarrDropReveal('RARE');
            claimedBanner = { title: questTitle, reward };
            render();
          }
        });
      });
    };

    render();
    document.body.appendChild(overlay);
  }
}
