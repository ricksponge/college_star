import './styles/brawl-theme.css';
import type {
  BrawlerId,
  CampusRoomId,
  GameModeId,
  IGameMode,
  IQuestion,
  SubjectCategory,
} from './types/cctp';
import { LocalSQLiteDB } from './db/LocalSQLiteDB';
import { CampusEngine } from './engine/CampusEngine';
import { GameEngine, type IMatchSummary } from './engine/GameEngine';
import { getAllBrawlers, getBrawlerById } from './entities/Brawlers';
import {
  ALL_GAME_MODES,
  CAMPUS_WORLD_DATA,
  getGameModeById,
  getHourlyRotatedMode,
  getModeQuickGuide,
  getRoomById,
} from './modes/ModesRegistry';
import { ELO_DEFAULT } from './services/EloEngine';
import { QuestionProvider, getSubjectVisualMeta } from './services/QuestionProvider';
import { QuestService } from './services/QuestService';
import { soundManager } from './services/SoundManager';
import { ParentDashboard } from './ui/ParentDashboard';
import { LobbyBrawlerPreview3D } from './ui/LobbyBrawlerPreview3D';
import { QuestJournalModal } from './ui/QuestJournalModal';
import { getCurrentTrophyRank, renderTrophyRoadHtml, StarrDropModal } from './ui/StarrDropModal';

const TROPHY_MILESTONE_THRESHOLDS = [0, 100, 250, 450, 650, 850, 1000] as const;

const BRAWLER_BADGE_COLORS: Record<BrawlerId, string> = {
  TIMO: '#facc15',
  LEO: '#c084fc',
  MAYA: '#4ade80',
  ZACK: '#22d3ee',
};

const BRAWLER_PORTRAITS: Record<BrawlerId, string> = {
  TIMO: '/assets/timo.jpg',
  LEO: '/assets/leo.jpg',
  MAYA: '/assets/maya.jpg',
  ZACK: '/assets/zack.jpg',
};

const BRAWLER_RING_CLASS: Record<BrawlerId, string> = {
  TIMO: '',
  LEO: 'brawl-portrait-ring-purple',
  MAYA: 'brawl-portrait-ring-green',
  ZACK: 'brawl-portrait-ring-blue',
};

class BrawlCollegeApp {
  private readonly root: HTMLElement;
  private readonly db = new LocalSQLiteDB();
  private readonly questionProvider = new QuestionProvider();
  private readonly questService = new QuestService(this.db);
  private readonly starrDropModal = new StarrDropModal(this.db);
  private readonly parentDashboard = new ParentDashboard(this.db);
  private readonly questJournalModal = new QuestJournalModal(this.db, this.questService);

  private selectedModeId: GameModeId = getHourlyRotatedMode().id;
  private matchCounter = 0;
  private activeEngine: GameEngine | null = null;
  private activeCampusEngine: CampusEngine | null = null;
  private lobbyPreview3D: LobbyBrawlerPreview3D | null = null;
  private lobbyBannerMsg: string | null = null;
  private readonly collectedCampusBadgeIds = new Set<string>();
  private returnToCampusAfterMatch = false;
  private activeKeyHandler: ((ev: KeyboardEvent) => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  public async bootstrap(): Promise<void> {
    await this.db.init();
    this.questionProvider.hydrateSpacedQueue(this.db.getSpacedRepetitionEntries());
    this.renderLobby();
    if (!this.db.getAccessibilitySettings().onboarding_seen) {
      this.openComfortAndGuideModal(true);
    }
  }

  private clearActiveKeyHandler(): void {
    if (this.activeKeyHandler) {
      window.removeEventListener('keydown', this.activeKeyHandler);
      this.activeKeyHandler = null;
    }
  }

  private setActiveKeyHandler(handler: (ev: KeyboardEvent) => void): void {
    this.clearActiveKeyHandler();
    this.activeKeyHandler = handler;
    window.addEventListener('keydown', handler);
  }

  private openComfortAndGuideModal(isFirstVisit = false): void {
    const existing = document.getElementById('brawl-comfort-modal');
    existing?.remove();

    let settings = this.db.getAccessibilitySettings();
    const overlay = document.createElement('div');
    overlay.id = 'brawl-comfort-modal';
    overlay.className = 'brawl-modal-overlay';

    const toggleItems: Array<{
      key: 'smart_auto_aim' | 'visual_gps_compass' | 'calm_mode' | 'auto_hint_assist';
      title: string;
      desc: string;
    }> = [
      {
        key: 'smart_auto_aim',
        title: '🎯 Visée Assistée Intelligente',
        desc: 'Aligne ton tir vers la cible la plus proche quand tu appuies vite ou touches une étiquette.',
      },
      {
        key: 'visual_gps_compass',
        title: '🧭 Boussole GPS Visuelle',
        desc: 'Affiche une flèche dorée pour te guider vers la bonne cible ou ta salle au collège.',
      },
      {
        key: 'calm_mode',
        title: '🐢 Mode Calme (-20% vitesse)',
        desc: 'Ralentit les cibles mouvantes pour lire tranquillement chaque question.',
      },
      {
        key: 'auto_hint_assist',
        title: '💡 Indice Automatique Doux',
        desc: 'Montre une astuce au bout de quelques secondes d’hésitation, sans aucune pénalité.',
      },
    ];

    const renderContent = (): void => {
      settings = this.db.getAccessibilitySettings();
      overlay.innerHTML = `
        <div class="brawl-modal-panel brawl-pop" style="width:min(700px, 95vw); padding:22px; max-height:92dvh; overflow-y:auto;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:14px;">
            <div>
              <div class="brawl-outline-text" style="font-size:11px; color:#38bdf8; letter-spacing:1px;">GUIDE EXPRESS EN 3 SECONDES</div>
              <h2 class="brawl-title" style="margin:2px 0 0; font-size:23px; color:#ffd426;">
                ${isFirstVisit ? '⚡ BIENVENUE DANS BRAWL COLLÈGE !' : '⚙️ COMMENT JOUER & CONFORT'}
              </h2>
            </div>
            <button id="btn-comfort-close-x" class="brawl-btn brawl-btn-sm">✖</button>
          </div>

          <div class="brawl-guide-grid">
            <div class="brawl-guide-card">
              <div style="font-size:28px; margin-bottom:4px;">🕹️</div>
              <div class="brawl-outline-text" style="font-size:14px; color:#fde047; margin-bottom:4px;">1. BOUGER</div>
              <div style="font-size:12px; color:#cbd5e1; line-height:1.4;">
                Stick gauche (ou touches <strong>ZQSD / Flèches</strong>) pour esquiver et te placer.
              </div>
            </div>
            <div class="brawl-guide-card">
              <div style="font-size:28px; margin-bottom:4px;">🎯</div>
              <div class="brawl-outline-text" style="font-size:14px; color:#38bdf8; margin-bottom:4px;">2. TIRER MALIN</div>
              <div style="font-size:12px; color:#cbd5e1; line-height:1.4;">
                Glisse à droite / souris <strong>OU touche directement la bonne réponse</strong> à l’écran !
              </div>
            </div>
            <div class="brawl-guide-card">
              <div style="font-size:28px; margin-bottom:4px;">💡</div>
              <div class="brawl-outline-text" style="font-size:14px; color:#4ade80; margin-bottom:4px;">3. ZÉRO BLOCAGE</div>
              <div style="font-size:12px; color:#cbd5e1; line-height:1.4;">
                Un doute ? Utilise <strong>💡 Indice</strong>, ton <strong>🟢 Gadget (×3)</strong> ou ton <strong>🟡 Super</strong> !
              </div>
            </div>
          </div>

          <div class="brawl-pd-subcard" style="padding:12px; margin-bottom:16px;">
            <div class="brawl-outline-text" style="font-size:13px; color:#93c5fd; margin-bottom:8px;">
              🛠️ RÉGLAGES ACCESSIBILITÉ & CONFORT
            </div>
            <div class="brawl-toggle-list">
              ${toggleItems
                .map((item) => {
                  const isOn = settings[item.key];
                  return `
                    <button type="button" data-acc-key="${item.key}" class="brawl-toggle-row" style="text-align:left; color:#f8fafc;">
                      <div>
                        <div style="font-size:13px; font-weight:800; color:#fef9c3;">${item.title}</div>
                        <div style="font-size:11px; color:#cbd5e1;">${item.desc}</div>
                      </div>
                      <span class="brawl-switch ${isOn ? 'on' : ''}" aria-hidden="true"></span>
                    </button>
                  `;
                })
                .join('')}
            </div>
          </div>

          <button id="btn-comfort-done" class="brawl-btn brawl-btn-lg brawl-btn-yellow" style="width:100%;">
            🚀 C’EST PARTI !
          </button>
        </div>
      `;

      overlay.querySelectorAll<HTMLButtonElement>('[data-acc-key]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.accKey as
            | 'smart_auto_aim'
            | 'visual_gps_compass'
            | 'calm_mode'
            | 'auto_hint_assist'
            | undefined;
          if (!key) return;
          const current = this.db.getAccessibilitySettings();
          this.db.updateAccessibilitySettings({ [key]: !current[key] });
          renderContent();
        });
      });

      const closeAndSave = (): void => {
        this.db.updateAccessibilitySettings({ onboarding_seen: true });
        overlay.remove();
        this.renderLobby();
      };

      overlay.querySelector('#btn-comfort-close-x')?.addEventListener('click', closeAndSave);
      overlay.querySelector('#btn-comfort-done')?.addEventListener('click', closeAndSave);
    };

    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) {
        this.db.updateAccessibilitySettings({ onboarding_seen: true });
        overlay.remove();
        this.renderLobby();
      }
    });

    document.body.appendChild(overlay);
    renderContent();
  }

  private openTrophyRoadModal(): void {
    const existing = document.getElementById('brawl-trophy-modal');
    existing?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'brawl-trophy-modal';
    overlay.className = 'brawl-modal-overlay';

    const renderModal = (): void => {
      const profile = this.db.getPlayerProfile();
      const claimedMilestones = this.db.getClaimedMilestones();
      const rank = getCurrentTrophyRank(profile.trophies);
      const claimableCount = TROPHY_MILESTONE_THRESHOLDS.filter(
        (t) => profile.trophies >= t && !claimedMilestones.includes(t)
      ).length;

      overlay.innerHTML = `
        <div class="brawl-modal-panel brawl-pop" style="width:min(760px, 95vw); padding:20px; max-height:90dvh; overflow-y:auto;">
          <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:10px; margin-bottom:12px;">
            <div>
              <div class="brawl-outline-text" style="font-size:11px; color:#38bdf8;">PROGRESSION VERS LA 6ÈME</div>
              <h2 class="brawl-title" style="margin:2px 0 0; font-size:22px; color:#ffd426;">
                🏆 ${profile.trophies} / 1000 Trophées — ${rank}
              </h2>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              ${
                claimableCount > 0
                  ? `<button id="btn-trophy-claim-all" class="brawl-btn brawl-btn-sm brawl-btn-yellow brawl-pulse">
                      ✨ Tout réclamer (${claimableCount})
                    </button>`
                  : ''
              }
              <button id="btn-trophy-close" class="brawl-btn brawl-btn-sm brawl-btn-blue">Fermer</button>
            </div>
          </div>

          ${renderTrophyRoadHtml(profile.trophies, claimedMilestones)}
        </div>
      `;

      overlay.querySelectorAll<HTMLButtonElement>('[data-claim-milestone]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const val = Number(btn.dataset.claimMilestone);
          if (!Number.isFinite(val)) return;
          const res = this.db.claimTrophyMilestone(val);
          this.lobbyBannerMsg = res.claimed
            ? `Palier ${val} 🏆 réclamé : ${res.rewardDescription} !`
            : res.rewardDescription;
          if (res.claimed) soundManager.playStarrDropReveal('EPIQUE');
          renderModal();
        });
      });

      overlay.querySelector('#btn-trophy-claim-all')?.addEventListener('click', () => {
        const res = this.db.claimAllAvailableRewards();
        if (res.claimedCount > 0) {
          soundManager.playStarrDropReveal('EPIQUE');
          this.lobbyBannerMsg = `✨ ${res.claimedCount} récompense(s) récupérée(s) : +${res.coinsEarned}🪙 !`;
        }
        renderModal();
      });

      overlay.querySelector('#btn-trophy-close')?.addEventListener('click', () => {
        overlay.remove();
        this.renderLobby();
      });
    };

    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) {
        overlay.remove();
        this.renderLobby();
      }
    });

    document.body.appendChild(overlay);
    renderModal();
  }

  private renderLobby(): void {
    this.clearActiveKeyHandler();
    this.activeEngine?.stop();
    this.activeEngine = null;
    this.activeCampusEngine?.stop();
    this.activeCampusEngine = null;
    this.lobbyPreview3D?.dispose();
    this.lobbyPreview3D = null;
    this.returnToCampusAfterMatch = false;

    const profile = this.db.getPlayerProfile();
    const brawlers = getAllBrawlers();
    const selectedBrawler = getBrawlerById(profile.selected_brawler);
    const selectedBrawlerLevel = this.db.getBrawlerLevel(selectedBrawler.id);
    const selectedScaledHp = Math.round(
      selectedBrawler.base_hp * (1 + 0.08 * (selectedBrawlerLevel - 1))
    );
    const selectedScaledDmg = Math.round(
      selectedBrawler.basic_attack.base_damage * (1 + 0.08 * (selectedBrawlerLevel - 1))
    );
    const upgradeCost = this.db.getUpgradeCost(selectedBrawlerLevel);
    const knowledgePoints = this.db.getKnowledgePoints();
    const claimedMilestones = this.db.getClaimedMilestones();
    const dailyQuests = this.db.getDailyQuests();
    const unlockedRewards = this.db.getUnlockedRewards();
    const selectedMode = getGameModeById(this.selectedModeId);
    const selectedModeGuide = getModeQuickGuide(selectedMode.id);
    const hourlyMode = getHourlyRotatedMode();
    const stars = this.db.getCombatStars();
    const starsProgress = stars % 3;
    const isMuted = soundManager.isMuted();
    const trophyRank = getCurrentTrophyRank(profile.trophies);
    const trophyProgressPct = Math.min(100, Math.round((profile.trophies / 1000) * 100));
    const brawlerSubjectMeta = getSubjectVisualMeta(selectedBrawler.favorite_subject);
    const accessibility = this.db.getAccessibilitySettings();

    const allQuestsWithStatus = this.questService.getAllQuestsWithStatus();
    const totalQuestsCount = allQuestsWithStatus.length;
    const completedQuestsCount = allQuestsWithStatus.filter(
      (entry) => entry.progress.status === 'COMPLETED' || entry.progress.status === 'CLAIMED'
    ).length;
    const claimableCampusQuestsCount = allQuestsWithStatus.filter(
      (entry) => entry.progress.status === 'COMPLETED'
    ).length;
    const claimableDailyQuestsCount = dailyQuests.filter(
      (q) => !q.claimed && q.progress >= q.target
    ).length;
    const claimableMilestonesCount = TROPHY_MILESTONE_THRESHOLDS.filter(
      (t) => profile.trophies >= t && !claimedMilestones.includes(t)
    ).length;
    const totalClaimableCount =
      claimableDailyQuestsCount + claimableCampusQuestsCount + claimableMilestonesCount;

    const activeQuestInfo = this.questService.getActiveQuest();
    const activeQuestTargetRoom = activeQuestInfo
      ? getRoomById(activeQuestInfo.activeObjective.target_room_id)
      : null;

    this.root.innerHTML = `
      <div class="brawl-bg">
        <div class="brawl-lobby-shell">
          <!-- Barre supérieure style Brawl Stars -->
          <header class="brawl-topbar">
            <div class="brawl-topbar-left">
              <div>
                <div class="brawl-outline-text" style="font-size:10px; text-transform:uppercase; letter-spacing:1.1px; color:#38bdf8;">
                  Brawl Collège • Opération 6ème
                </div>
                <h1 class="brawl-title" style="margin:0; font-size:19px; color:#ffd426;">
                  🎒 ${profile.nickname}
                </h1>
              </div>

              <button id="btn-open-trophy-road" class="brawl-trophy-pill" title="Ouvrir la Route des Trophées">
                <span style="font-size:16px;">🏆</span>
                <div style="text-align:left;">
                  <div style="font-size:12px; font-weight:900; line-height:1.1;">
                    ${profile.trophies} / 1000 <span style="color:#fde047;">• ${trophyRank}</span>
                  </div>
                  <div class="brawl-trophy-track" style="margin-top:3px;">
                    <div class="brawl-trophy-fill" style="width:${trophyProgressPct}%;"></div>
                  </div>
                </div>
                ${claimableMilestonesCount > 0 ? '<span class="brawl-ready-dot" title="Palier prêt !"></span>' : ''}
              </button>
            </div>

            <div class="brawl-topbar-right">
              <div class="brawl-stat-pill" style="color:#ffd426;" title="Trophées de la Route vers la 6ème">🏆 ${profile.trophies}</div>
              <div class="brawl-stat-pill" style="color:#38bdf8;" title="Étoiles pour le prochain Casier">⭐ ${starsProgress}/3</div>
              <div class="brawl-stat-pill" style="color:#4ade80;" title="Niveau Elo pédagogique moyen">🎯 Elo ${this.computeSubjectAvgElo()}</div>
              <div class="brawl-stat-pill" style="color:#fbbf24;" title="Pièces d'or">🪙 ${profile.coins}</div>
              <div class="brawl-stat-pill" style="color:#c084fc;" title="Points de Savoir">📖 ${knowledgePoints}</div>

              ${
                totalClaimableCount > 0
                  ? `<button id="btn-claim-all" class="brawl-btn brawl-btn-sm brawl-btn-yellow brawl-pulse">
                      ✨ Tout réclamer (${totalClaimableCount})
                    </button>`
                  : ''
              }

              <button id="btn-starr-drop" class="brawl-btn brawl-btn-sm ${profile.starr_drops_available > 0 ? 'brawl-btn-yellow brawl-pulse' : ''}" ${profile.starr_drops_available === 0 ? 'disabled' : ''}>
                🎁 Casiers (${profile.starr_drops_available})
              </button>
              <button id="btn-comfort-help" class="brawl-btn brawl-btn-sm brawl-btn-blue" title="Guide 3 secondes & Réglages Confort">
                ⚙️ Aide${accessibility.calm_mode ? ' • 🐢' : ''}
              </button>
              <button id="btn-parent-dash" class="brawl-btn brawl-btn-sm brawl-btn-purple">
                🔒 Parent
              </button>
              <button id="btn-toggle-mute" class="brawl-btn brawl-btn-sm" title="Activer ou couper le son">
                ${isMuted ? '🔇' : '🔊'}
              </button>
              <button id="btn-fullscreen" class="brawl-btn brawl-btn-sm" title="Plein écran & Paysage">
                ⛶
              </button>
            </div>
          </header>

          ${
            this.lobbyBannerMsg
              ? `<div class="brawl-pd-subcard" style="background:rgba(56,189,248,0.18); border-color:#38bdf8; color:#e0f2fe; font-weight:800; padding:8px 12px; display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
                  <span>✨ ${this.lobbyBannerMsg}</span>
                  <button id="btn-dismiss-banner" style="background:transparent; border:none; color:#fef08a; font-weight:900; cursor:pointer;">✖</button>
                </div>`
              : ''
          }

          <!-- Grille principale 3 Piliers sans scroll inutile -->
          <main class="brawl-lobby-grid">
            <!-- PILIER GAUCHE : Exploration Collège & Quêtes -->
            <section class="brawl-lobby-col">
              <div class="brawl-col-title">
                <span>🏫 COLLÈGE 3D & QUÊTES</span>
                <span style="color:#4ade80;">${completedQuestsCount}/${totalQuestsCount}</span>
              </div>

              <div class="brawl-campus-card">
                <div style="font-size:11px; font-weight:900; color:#86efac; letter-spacing:0.6px;">
                  🗺️ CARTE OUVERTE DU COLLÈGE (2400×1800)
                </div>
                ${
                  activeQuestInfo
                    ? `<div style="font-size:12px; color:#f8fafc; line-height:1.4;">
                        <strong style="color:#fde047;">📜 ${activeQuestInfo.quest.title}</strong><br/>
                        ${activeQuestInfo.activeObjective.description}
                        <span style="color:#86efac; font-weight:900;">(${Math.min(activeQuestInfo.progress.current_count, activeQuestInfo.activeObjective.required_count)}/${activeQuestInfo.activeObjective.required_count})</span>
                        ${
                          activeQuestTargetRoom
                            ? `<div style="color:#bae6fd; font-weight:800; margin-top:2px;">📍 ${activeQuestTargetRoom.name} (${activeQuestTargetRoom.floor_label})</div>`
                            : ''
                        }
                      </div>`
                    : `<div style="font-size:12px; color:#86efac; font-weight:800;">🏆 Toutes les missions du collège sont réussies !</div>`
                }
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <button id="btn-explore-campus" class="brawl-btn brawl-btn-sm brawl-btn-yellow" style="flex:1;">
                    🏫 EXPLORER
                  </button>
                  ${
                    activeQuestInfo && activeQuestTargetRoom
                      ? `<button id="btn-quick-quest-go" class="brawl-btn brawl-btn-sm brawl-btn-green" style="flex:1;">
                          🚀 Y ALLER
                        </button>`
                      : ''
                  }
                </div>
              </div>

              <div class="brawl-col-title" style="margin-top:2px;">
                <span>⚡ QUÊTES DU JOUR</span>
                <button id="btn-open-quests-card" class="brawl-btn brawl-btn-sm brawl-btn-blue" style="padding:3px 9px; font-size:11px;">
                  📜 Carnet (12)
                </button>
              </div>

              <div class="brawl-quest-mini-list">
                ${dailyQuests
                  .map((q) => {
                    const pct = Math.min(100, Math.round((q.progress / Math.max(1, q.target)) * 100));
                    const canClaim = !q.claimed && q.progress >= q.target;
                    return `
                      <div class="brawl-quest-mini-item ${canClaim ? 'brawl-quest-ready' : ''}">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:4px;">
                          <strong style="color:#f8fafc;">${q.title}</strong>
                          <span style="font-size:11px; font-weight:900; color:#facc15;">+${q.reward_coins}🪙${q.reward_stars > 0 ? ` +${q.reward_stars}⭐` : ''}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                          <div style="flex:1; height:7px; background:#090d16; border-radius:999px; overflow:hidden; border:1px solid #1e293b;">
                            <div style="width:${pct}%; height:100%; background:${q.claimed ? '#475569' : '#22c55e'};"></div>
                          </div>
                          <span style="font-size:11px; color:#cbd5e1; font-weight:700;">${q.progress}/${q.target}</span>
                          ${
                            q.claimed
                              ? `<span style="font-size:11px; color:#86efac; font-weight:900;">✓</span>`
                              : canClaim
                                ? `<button data-claim-quest="${q.id}" class="brawl-btn brawl-btn-sm brawl-btn-yellow" style="padding:2px 8px; font-size:11px;">Réclamer</button>`
                                : ''
                          }
                        </div>
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            </section>

            <!-- PILIER CENTRAL : Podium Héros 3D & Dock 4 Héros -->
            <section class="brawl-lobby-col brawl-hero-stage">
              <div class="brawl-col-title">
                <span>🌟 ÉLÈVE-HÉROS SÉLECTIONNÉ</span>
                <span style="color:#fde047;">Niv.${selectedBrawlerLevel}</span>
              </div>

              <div class="brawl-hero-3d-wrap">
                <div class="brawl-hero-banner">
                  <div>
                    <div class="brawl-outline-text" style="font-size:20px; color:${BRAWLER_BADGE_COLORS[selectedBrawler.id]};">
                      ${selectedBrawler.name}
                    </div>
                    <div style="font-size:11px; font-weight:700; color:#e2e8f0;">${selectedBrawler.title}</div>
                  </div>
                  <span class="brawl-subject-tag" style="background:${brawlerSubjectMeta.badge_bg}; color:#f8fafc; border-color:${brawlerSubjectMeta.accent_color};">
                    ${brawlerSubjectMeta.icon} ${brawlerSubjectMeta.short_label}
                  </span>
                </div>
                <div id="brawler-3d-preview" style="width:100%; height:100%; position:relative; z-index:2;"></div>
                <div class="brawl-hero-pedestal-ring"></div>
                <div style="position:absolute; bottom:6px; left:0; right:0; text-align:center; font-size:10px; color:#cbd5e1; font-weight:700; pointer-events:none;">
                  👆 Glisse pour faire pivoter en 3D
                </div>
              </div>

              <div class="brawl-brawler-dock">
                ${brawlers
                  .map((b) => {
                    const isSelected = b.id === selectedBrawler.id;
                    const lvl = this.db.getBrawlerLevel(b.id);
                    const ringClass = BRAWLER_RING_CLASS[b.id];
                    return `
                      <button data-brawler-id="${b.id}" class="brawl-hero-chip ${isSelected ? 'active' : ''}">
                        <span class="brawl-portrait-ring ${ringClass}" style="width:44px; height:44px;">
                          <img src="${BRAWLER_PORTRAITS[b.id]}" alt="${b.name}" />
                        </span>
                        <span style="font-size:11px; font-weight:900; color:${BRAWLER_BADGE_COLORS[b.id]};">${b.name}</span>
                        <span style="font-size:10px; color:#cbd5e1; font-weight:700;">Niv.${lvl}</span>
                      </button>
                    `;
                  })
                  .join('')}
              </div>

              <div class="brawl-hero-stats-bar">
                <div class="brawl-stat-chip">
                  ❤️ <strong>${selectedScaledHp} PV</strong> • ⚡ Vit. ${selectedBrawler.speed_value}
                </div>
                <div class="brawl-stat-chip">
                  🎯 <strong>${selectedBrawler.basic_attack.name}</strong> (${selectedBrawler.id === 'MAYA' ? 3 : selectedBrawler.basic_attack.projectiles_count}×${selectedScaledDmg})
                </div>
                <div class="brawl-stat-chip">
                  🟡 <strong>Super</strong> : ${selectedBrawler.super_ability.name}
                </div>
                <div class="brawl-stat-chip">
                  🟢 <strong>Gadget (×3)</strong> : ${selectedBrawler.gadget.name}
                </div>
              </div>

              ${
                unlockedRewards.length > 0
                  ? `<div style="display:flex; flex-wrap:wrap; gap:4px;">
                      ${unlockedRewards
                        .slice(-3)
                        .map(
                          (r) =>
                            `<span style="background:rgba(250,204,21,0.16); border:1px solid #facc15; color:#fef08a; border-radius:6px; padding:1px 6px; font-size:10px; font-weight:800;">🏅 ${r}</span>`
                        )
                        .join('')}
                    </div>`
                  : ''
              }

              <button id="btn-upgrade-brawler" class="brawl-btn brawl-btn-sm brawl-btn-yellow" ${selectedBrawlerLevel >= 10 ? 'disabled' : ''} style="width:100%;">
                ${
                  selectedBrawlerLevel >= 10
                    ? '⭐ NIVEAU MAX (10)'
                    : `⬆️ Améliorer Niv.${selectedBrawlerLevel + 1} (${upgradeCost.coins}🪙 + ${upgradeCost.knowledgePoints}📖)`
                }
              </button>
            </section>

            <!-- PILIER DROIT : Choix du Mode & Bouton Géant JOUER -->
            <section class="brawl-lobby-col" style="justify-content:space-between;">
              <div>
                <div class="brawl-col-title" style="margin-bottom:8px;">
                  <span>🏟️ MODES D'ARÈNE</span>
                  <span style="font-size:11px; color:#fde047;">⏰ ${hourlyMode.name}</span>
                </div>

                <div class="brawl-modes-stack">
                  ${ALL_GAME_MODES.map((m) => {
                    const active = m.id === selectedMode.id;
                    const guide = getModeQuickGuide(m.id);
                    const isRecommended =
                      guide.recommendedBrawler === selectedBrawler.id ||
                      m.target_subject === selectedBrawler.favorite_subject;
                    const subjMeta = m.target_subject ? getSubjectVisualMeta(m.target_subject) : null;
                    return `
                      <button data-mode-id="${m.id}" class="brawl-mode-pill ${active ? 'active' : ''}">
                        <span class="brawl-mode-illus-badge" style="background:${subjMeta ? subjMeta.badge_bg : 'linear-gradient(135deg,#3b82f6,#1d4ed8)'}; border-color:#090d16;">${guide.icon}</span>
                        <div style="flex:1; min-width:0;">
                          <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap;">
                            <strong class="brawl-mode-title brawl-outline-text" style="font-size:15px; color:${active ? '#ffd426' : '#f8fafc'};">${m.name}</strong>
                            ${
                              isRecommended
                                ? '<span class="brawl-recommend-badge">⭐ Conseillé</span>'
                                : ''
                            }
                          </div>
                          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:2px; font-size:11px; color:#cbd5e1;">
                            <span>${guide.shortTag}</span>
                            <span>• ${m.format} • ${m.duration_seconds}s</span>
                            ${
                              subjMeta
                                ? `<span class="brawl-subject-tag" style="background:${subjMeta.badge_bg}; color:#f8fafc; border-color:${subjMeta.accent_color};">${subjMeta.icon} ${subjMeta.short_label}</span>`
                                : ''
                            }
                          </div>
                        </div>
                      </button>
                    `;
                  }).join('')}
                </div>
              </div>

              <div class="brawl-pd-subcard" style="padding:9px 11px; font-size:11px; color:#e2e8f0; display:flex; flex-direction:column; gap:4px;">
                <div style="font-weight:900; color:#fde047;">${selectedModeGuide.icon} ${selectedModeGuide.oneLineGoal}</div>
                <div style="display:flex; flex-direction:column; gap:2px; color:#cbd5e1;">
                  ${selectedModeGuide.howToWinSteps.map((step) => `<span>• ${step}</span>`).join('')}
                </div>
              </div>

              <button id="btn-play-match" class="brawl-btn brawl-btn-yellow brawl-play-cta brawl-pulse">
                ▶ JOUER !
                <div style="font-size:11px; font-weight:800; opacity:0.9; margin-top:1px;">
                  ${selectedBrawler.name.toUpperCase()} • ${selectedMode.name.toUpperCase()}
                </div>
              </button>
            </section>
          </main>
        </div>
      </div>
    `;

    const previewContainer = this.root.querySelector<HTMLElement>('#brawler-3d-preview');
    if (previewContainer) {
      this.lobbyPreview3D = new LobbyBrawlerPreview3D(previewContainer, selectedBrawler.id);
    }

    // Listeners Héros
    this.root.querySelectorAll<HTMLButtonElement>('[data-brawler-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        soundManager.playUiClick();
        const bId = btn.dataset.brawlerId as BrawlerId | undefined;
        if (bId) {
          this.db.updatePlayerProfile({ selected_brawler: bId });
          this.renderLobby();
        }
      });
    });

    // Listeners Modes
    this.root.querySelectorAll<HTMLButtonElement>('[data-mode-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        soundManager.playUiClick();
        const mId = btn.dataset.modeId as GameModeId | undefined;
        if (mId) {
          this.selectedModeId = mId;
          this.renderLobby();
        }
      });
    });

    // Route des Trophées
    this.root.querySelector('#btn-open-trophy-road')?.addEventListener('click', () => {
      soundManager.playUiClick();
      this.openTrophyRoadModal();
    });

    // Tout Réclamer en 1 clic
    this.root.querySelector('#btn-claim-all')?.addEventListener('click', () => {
      const dbRes = this.db.claimAllAvailableRewards();
      const qRes = this.questService.claimAllCompletedQuests();
      const totalItems = dbRes.claimedCount + qRes.count;
      if (totalItems > 0) {
        soundManager.playStarrDropReveal('EPIQUE');
        const totalCoins = dbRes.coinsEarned + qRes.totalCoins;
        const totalStars = dbRes.starsEarned + qRes.totalStars;
        this.lobbyBannerMsg = `✨ ${totalItems} récompense(s) récupérée(s) : +${totalCoins}🪙${totalStars > 0 ? ` +${totalStars}⭐` : ''}${qRes.totalTrophies > 0 ? ` +${qRes.totalTrophies}🏆` : ''} !`;
      }
      this.renderLobby();
    });

    // Casier Mystère
    this.root.querySelector('#btn-starr-drop')?.addEventListener('click', () => {
      if (this.db.getPlayerProfile().starr_drops_available > 0) {
        this.starrDropModal.open(() => this.renderLobby());
      }
    });

    // Guide & Confort
    this.root.querySelector('#btn-comfort-help')?.addEventListener('click', () => {
      this.openComfortAndGuideModal(false);
    });

    // Dashboard Parent
    this.root.querySelector('#btn-parent-dash')?.addEventListener('click', () => {
      this.parentDashboard.open(() => this.renderLobby());
    });

    // Audio Mute Toggle
    const muteBtn = this.root.querySelector<HTMLButtonElement>('#btn-toggle-mute');
    muteBtn?.addEventListener('click', () => {
      const mutedNow = soundManager.toggleMute();
      muteBtn.textContent = mutedNow ? '🔇' : '🔊';
    });

    // Plein écran & Paysage mobile
    this.root.querySelector('#btn-fullscreen')?.addEventListener('click', () => {
      try {
        if (!document.fullscreenElement) {
          void document.documentElement.requestFullscreen?.();
        } else {
          void document.exitFullscreen?.();
        }
        const orientation = screen.orientation as unknown as { lock?: (o: string) => Promise<void> };
        void orientation?.lock?.('landscape')?.catch?.(() => {});
      } catch {
        // Ignoré sur navigateurs sans API Fullscreen/Orientation
      }
    });

    // Fermeture bannière
    this.root.querySelector('#btn-dismiss-banner')?.addEventListener('click', () => {
      this.lobbyBannerMsg = null;
      this.renderLobby();
    });

    // Réclamation Quêtes du Jour
    this.root.querySelectorAll<HTMLButtonElement>('[data-claim-quest]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qId = btn.dataset.claimQuest;
        if (!qId) return;
        if (this.db.claimDailyQuest(qId)) {
          soundManager.playStarrDropReveal('RARE');
          this.lobbyBannerMsg = 'Quête du jour validée et récompense ajoutée !';
          this.renderLobby();
        }
      });
    });

    // Amélioration Héros Niveau 1 -> 10
    this.root.querySelector('#btn-upgrade-brawler')?.addEventListener('click', () => {
      const up = this.db.upgradeBrawler(selectedBrawler.id);
      if (up.success) {
        soundManager.playSuperReady();
        this.lobbyBannerMsg = `${selectedBrawler.name} passe Niveau ${up.newLevel} ! (+8% PV & Dégâts)`;
      } else {
        this.lobbyBannerMsg = up.reason ?? 'Amélioration impossible.';
      }
      this.renderLobby();
    });

    // Carnet de Quêtes & Mode Exploration du Collège (M4)
    this.root.querySelector('#btn-open-quests-card')?.addEventListener('click', () => {
      this.questJournalModal.open({
        onClose: () => this.renderLobby(),
        onStartCampusExploration: () => {
          this.lobbyBannerMsg = null;
          this.startCampusExploration(selectedBrawler.id);
        },
        onTeleportToQuestRoom: (roomId) => {
          this.lobbyBannerMsg = null;
          this.startCampusExploration(selectedBrawler.id, roomId);
        },
        onQuestSelected: () => {},
      });
    });

    this.root.querySelector('#btn-explore-campus')?.addEventListener('click', () => {
      this.lobbyBannerMsg = null;
      this.startCampusExploration(selectedBrawler.id);
    });

    this.root.querySelector('#btn-quick-quest-go')?.addEventListener('click', () => {
      this.lobbyBannerMsg = null;
      this.startCampusExploration(
        selectedBrawler.id,
        activeQuestInfo?.activeObjective.target_room_id
      );
    });

    // Lancer le combat 60 FPS
    this.root.querySelector('#btn-play-match')?.addEventListener('click', () => {
      soundManager.playUiClick();
      this.lobbyBannerMsg = null;
      this.returnToCampusAfterMatch = false;
      this.startMatch(selectedBrawler.id, selectedMode);
    });
  }

  private bindPointerTap(el: Element | null, handler: () => void): void {
    if (!el) return;
    el.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      handler();
    });
  }

  private computeSubjectAvgElo(subject?: SubjectCategory): number {
    const allSkills = this.db.getAllSkillMasteries();
    const filtered = subject
      ? allSkills.filter((s) => s.subject_category === subject)
      : allSkills;
    if (filtered.length === 0) return ELO_DEFAULT;
    return Math.round(filtered.reduce((acc, s) => acc + s.elo_rating, 0) / filtered.length);
  }

  private pickAdaptiveQuestion(
    preferredSubject: SubjectCategory | undefined,
    fallbackSubjects: SubjectCategory[],
    currentMatchIndex: number,
    guaranteeIntroMath = false
  ): IQuestion {
    if (guaranteeIntroMath) {
      const firstQ = this.questionProvider.getQuestionById('MATH_MUL_001');
      if (firstQ) return firstQ;
    }

    const chosenSubject =
      preferredSubject ??
      (Math.random() < 0.78 && fallbackSubjects.length > 0
        ? fallbackSubjects[Math.floor(Math.random() * fallbackSubjects.length)]
        : undefined);

    const allSkills = this.db.getAllSkillMasteries();
    const subjectSkills = chosenSubject
      ? allSkills.filter((s) => s.subject_category === chosenSubject)
      : allSkills;
    const weakestSkill = [...subjectSkills].sort((a, b) => a.elo_rating - b.elo_rating)[0];

    return this.questionProvider.getNextQuestion({
      subject: chosenSubject,
      targetElo: this.computeSubjectAvgElo(chosenSubject),
      currentMatchIndex,
      preferSkillCode: weakestSkill?.skill_code,
    });
  }

  private recordAdaptiveTelemetry(
    question: IQuestion,
    brawlerId: BrawlerId,
    isCorrect: boolean,
    reactionTimeMs: number,
    currentMatchIndex: number
  ): number {
    const mastery = this.db.getSkillMastery(question.skill_code);
    const currentElo = mastery?.elo_rating ?? ELO_DEFAULT;
    const eloResult = this.questionProvider.registerAttempt(
      question,
      currentElo,
      isCorrect,
      reactionTimeMs,
      currentMatchIndex
    );

    this.db.recordCombatTelemetry(
      {
        question_id: question.id,
        brawler_used: brawlerId,
        is_hit_correct: isCorrect,
        reaction_time_ms: reactionTimeMs,
      },
      {
        skill_code: question.skill_code,
        subject_category: question.subject,
        new_elo: eloResult.new_elo,
      }
    );
    this.db.setSpacedRepetitionEntries(this.questionProvider.serializeSpacedQueue());
    return eloResult.new_elo;
  }

  private startCampusExploration(brawlerId: BrawlerId, initialRoomId?: CampusRoomId): void {
    this.clearActiveKeyHandler();
    this.activeEngine?.stop();
    this.activeEngine = null;
    this.activeCampusEngine?.stop();
    this.activeCampusEngine = null;
    this.lobbyPreview3D?.dispose();
    this.lobbyPreview3D = null;
    this.returnToCampusAfterMatch = false;

    this.matchCounter += 1;
    const currentMatchIndex = this.matchCounter;
    const brawler = getBrawlerById(brawlerId);
    const brawlerLevel = this.db.getBrawlerLevel(brawlerId);
    const initialAvgElo = this.computeSubjectAvgElo(brawler.favorite_subject);
    const accessibility = this.db.getAccessibilitySettings();

    this.root.innerHTML = `
      <div class="arena-container">
        <canvas id="campus-canvas" style="display:block; width:100%; height:100%;"></canvas>

        <!-- Boutons haut gauche sous HUD -->
        <div style="position:absolute; top:68px; left:14px; display:flex; flex-wrap:wrap; gap:8px; z-index:10;">
          <button id="btn-campus-lobby" class="brawl-btn brawl-btn-sm">
            🏠 Lobby
          </button>
          <button id="btn-campus-quests" class="brawl-btn brawl-btn-sm brawl-btn-blue">
            📜 Quêtes
          </button>
          <button id="btn-campus-teleport" class="brawl-btn brawl-btn-sm brawl-hud-teleport-btn" title="Aller directement à l'objectif actif">
            🚀 Aller à l'objectif
          </button>
          <button id="btn-campus-interact" class="brawl-btn brawl-btn-sm">
            💬 Parler / Défi
          </button>
          <button id="btn-campus-challenge" class="brawl-btn brawl-btn-sm brawl-btn-green">
            🎯 Défi Salle
          </button>
          <button id="btn-campus-mute" class="brawl-btn brawl-btn-sm" title="Son">
            ${soundManager.isMuted() ? '🔇' : '🔊'}
          </button>
        </div>

        <!-- Aide commandes Exploration Collège -->
        <div style="position:absolute; bottom:14px; left:16px; background:rgba(9,13,22,0.84); border:2px solid #090d16; padding:6px 12px; border-radius:11px; font-size:11px; font-weight:700; color:#e2e8f0; pointer-events:none;">
          🕹️ ZQSD / Stick : Bouger • 🎯 Clic ou touche une cible : Tirer • 🚀 Objectif : Téléport • 💬 Entrée : Parler • 🟡 Super • 🟢 Gadget
        </div>

        <!-- Boutons tactiles Super (Jaune) & Gadget (Vert) -->
        <div style="position:absolute; right:20px; bottom:20px; display:flex; align-items:flex-end; gap:14px; z-index:10;">
          <button id="btn-campus-gadget" class="brawl-btn brawl-btn-green" style="width:72px; height:72px; padding:0; border-radius:999px; flex-direction:column; gap:1px; font-size:11px;">
            <span>GADGET</span><span id="campus-gadget-count-badge" style="font-size:14px;">3</span>
          </button>
          <button id="btn-campus-super" class="brawl-btn" style="width:90px; height:90px; padding:0; border-radius:999px; flex-direction:column; gap:2px; font-size:13px;">
            <span>SUPER</span><span id="campus-super-pct-badge" style="font-size:15px;">0%</span>
          </button>
        </div>
      </div>
    `;

    const canvas = this.root.querySelector<HTMLCanvasElement>('#campus-canvas');
    if (!canvas) return;

    const btnInteract = this.root.querySelector<HTMLButtonElement>('#btn-campus-interact');
    const btnSuper = this.root.querySelector<HTMLButtonElement>('#btn-campus-super');
    const btnGadget = this.root.querySelector<HTMLButtonElement>('#btn-campus-gadget');
    const superPctBadge = this.root.querySelector<HTMLElement>('#campus-super-pct-badge');
    const gadgetBadge = this.root.querySelector<HTMLElement>('#campus-gadget-count-badge');

    const campusEngine = new CampusEngine({
      canvas,
      brawler,
      world: CAMPUS_WORLD_DATA,
      questService: this.questService,
      brawlerLevel,
      targetSpeedMultiplier: this.questionProvider.getTargetSpeedMultiplier(initialAvgElo),
      initialCollectedBadgeIds: Array.from(this.collectedCampusBadgeIds),
      accessibility,
      requestNextQuestion: (subject?: SubjectCategory) =>
        this.pickAdaptiveQuestion(
          subject,
          brawler.secondary_subject
            ? [brawler.favorite_subject, brawler.secondary_subject]
            : [brawler.favorite_subject],
          currentMatchIndex,
          false
        ),
      onHitTelemetry: ({ question, isCorrect, reactionTimeMs, impact }) => {
        if (isCorrect) {
          soundManager.playHitCorrect(impact.combo_multiplier);
        } else {
          soundManager.playHitError();
        }
        const newElo = this.recordAdaptiveTelemetry(
          question,
          brawlerId,
          isCorrect,
          reactionTimeMs,
          currentMatchIndex
        );
        this.db.recordQuestProgress({
          correctHits: isCorrect ? 1 : 0,
          fastReflexHits: isCorrect && reactionTimeMs <= 2500 ? 1 : 0,
        });
        campusEngine.setTargetSpeedMultiplier(
          this.questionProvider.getTargetSpeedMultiplier(newElo)
        );
      },
      onHudStateChange: (hud) => {
        if (btnInteract) {
          if (hud.nearbyNpc) {
            btnInteract.textContent = `💬 Parler : ${hud.nearbyNpc.name}`;
            btnInteract.classList.add('brawl-btn-yellow', 'brawl-pulse');
          } else {
            btnInteract.textContent = '💬 Parler / Défi';
            btnInteract.classList.remove('brawl-btn-yellow', 'brawl-pulse');
          }
        }
        if (superPctBadge) {
          superPctBadge.textContent = `${hud.superGaugePct}%`;
        }
        if (btnSuper) {
          const ready = hud.superGaugePct >= 100;
          btnSuper.classList.toggle('brawl-btn-yellow', ready);
          btnSuper.classList.toggle('brawl-pulse', ready);
          btnSuper.style.boxShadow = ready
            ? '0 5px 0 #090d16, 0 0 28px rgba(250,204,21,0.9)'
            : '0 5px 0 #090d16';
        }
        if (gadgetBadge) {
          gadgetBadge.textContent = `${hud.gadgetCharges}`;
        }
        if (btnGadget) {
          btnGadget.style.opacity = hud.gadgetCharges > 0 ? '1' : '0.45';
        }
      },
      onQuestStepAdvanced: (result) => {
        if (result.questCompleted) {
          soundManager.playStarrDropReveal('EPIQUE');
        } else if (result.objectiveCompleted) {
          soundManager.playSuperReady();
        }
      },
      onBadgeCollected: (coinsGranted, badge) => {
        if (badge) {
          this.collectedCampusBadgeIds.add(badge.id);
        }
        const p = this.db.getPlayerProfile();
        this.db.updatePlayerProfile({ coins: p.coins + Math.max(0, coinsGranted) });
        soundManager.playStarrDropTap(3, true);
      },
      onNpcArenaRequested: (npc) => {
        if (!npc.linked_arena_mode) return;
        const linkedMode = getGameModeById(npc.linked_arena_mode);
        this.clearActiveKeyHandler();
        campusEngine.stop();
        this.activeCampusEngine = null;
        this.returnToCampusAfterMatch = true;
        this.startMatch(brawlerId, linkedMode);
      },
    });

    this.activeCampusEngine = campusEngine;
    campusEngine.start();
    if (initialRoomId) {
      campusEngine.teleportToRoom(initialRoomId);
    }

    this.bindPointerTap(btnSuper, () => campusEngine.triggerSuperFromUI());
    this.bindPointerTap(btnGadget, () => campusEngine.triggerGadgetFromUI());
    this.bindPointerTap(btnInteract, () => campusEngine.triggerInteractFromUI());
    this.bindPointerTap(this.root.querySelector('#btn-campus-teleport'), () => {
      if (!campusEngine.teleportToActiveQuestObjective()) {
        campusEngine.spawnChallengeInCurrentRoom();
      }
    });
    this.bindPointerTap(this.root.querySelector('#btn-campus-challenge'), () =>
      campusEngine.spawnChallengeInCurrentRoom()
    );
    this.bindPointerTap(this.root.querySelector('#btn-campus-quests'), () => {
      this.questJournalModal.open({
        onClose: () => campusEngine.refreshQuestOverlay(),
        onQuestSelected: () => campusEngine.refreshQuestOverlay(),
        onTeleportToQuestRoom: (roomId) => {
          campusEngine.teleportToRoom(roomId);
          campusEngine.refreshQuestOverlay();
        },
      });
    });

    const campusMuteBtn = this.root.querySelector<HTMLButtonElement>('#btn-campus-mute');
    this.bindPointerTap(campusMuteBtn, () => {
      const mutedNow = soundManager.toggleMute();
      if (campusMuteBtn) {
        campusMuteBtn.textContent = mutedNow ? '🔇' : '🔊';
      }
    });

    this.bindPointerTap(this.root.querySelector('#btn-campus-lobby'), () => {
      this.clearActiveKeyHandler();
      campusEngine.stop();
      this.activeCampusEngine = null;
      this.renderLobby();
    });
  }

  private startMatch(brawlerId: BrawlerId, mode: IGameMode): void {
    this.clearActiveKeyHandler();
    this.activeEngine?.stop();
    this.activeEngine = null;
    this.activeCampusEngine?.stop();
    this.activeCampusEngine = null;
    this.lobbyPreview3D?.dispose();
    this.lobbyPreview3D = null;
    this.matchCounter += 1;
    const currentMatchIndex = this.matchCounter;
    const brawler = getBrawlerById(brawlerId);
    const brawlerLevel = this.db.getBrawlerLevel(brawlerId);
    const accessibility = this.db.getAccessibilitySettings();
    const preferredSubject = mode.target_subject ?? brawler.favorite_subject;
    const candidateSubjects = mode.target_subject
      ? [mode.target_subject]
      : brawler.secondary_subject
        ? [brawler.favorite_subject, brawler.secondary_subject]
        : [brawler.favorite_subject];

    this.root.innerHTML = `
      <div class="arena-container">
        <canvas id="arena-canvas" style="display:block; width:100%; height:100%;"></canvas>

        <!-- Boutons haut gauche sous HUD -->
        <div style="position:absolute; top:68px; left:14px; display:flex; flex-wrap:wrap; gap:8px; z-index:10;">
          <button id="btn-quit-match" class="brawl-btn brawl-btn-sm">
            ✖ Quitter
          </button>
          <button id="btn-match-hint" class="brawl-btn brawl-btn-sm brawl-hud-hint-btn" title="Afficher une astuce et surligner la bonne réponse (Touche H)">
            💡 Indice (H)
          </button>
          <button id="btn-match-mute" class="brawl-btn brawl-btn-sm" title="Son">
            ${soundManager.isMuted() ? '🔇' : '🔊'}
          </button>
        </div>

        <!-- Aide commandes desktop/tactile -->
        <div style="position:absolute; bottom:14px; left:16px; background:rgba(9,13,22,0.82); border:2px solid #090d16; padding:6px 12px; border-radius:11px; font-size:11px; font-weight:700; color:#e2e8f0; pointer-events:none;">
          🕹️ ZQSD / Stick : Bouger • 🎯 Glisser OU toucher la bonne réponse • 💡 H : Indice • 🟡 Espace : Super • 🟢 E : Gadget
        </div>

        <!-- Boutons tactiles Super (Jaune) & Gadget (Vert) -->
        <div style="position:absolute; right:20px; bottom:20px; display:flex; align-items:flex-end; gap:14px; z-index:10;">
          <button id="btn-hud-gadget" class="brawl-btn brawl-btn-green" style="width:72px; height:72px; padding:0; border-radius:999px; flex-direction:column; gap:1px; font-size:11px;">
            <span>GADGET</span><span id="gadget-count-badge" style="font-size:14px;">3</span>
          </button>
          <button id="btn-hud-super" class="brawl-btn" style="width:90px; height:90px; padding:0; border-radius:999px; flex-direction:column; gap:2px; font-size:13px;">
            <span>SUPER</span><span id="super-pct-badge" style="font-size:15px;">0%</span>
          </button>
        </div>
      </div>
    `;

    const canvas = this.root.querySelector<HTMLCanvasElement>('#arena-canvas');
    if (!canvas) return;

    const btnSuper = this.root.querySelector<HTMLButtonElement>('#btn-hud-super');
    const btnGadget = this.root.querySelector<HTMLButtonElement>('#btn-hud-gadget');
    const btnHint = this.root.querySelector<HTMLButtonElement>('#btn-match-hint');
    const superPctBadge = this.root.querySelector<HTMLElement>('#super-pct-badge');
    const gadgetBadge = this.root.querySelector<HTMLElement>('#gadget-count-badge');

    const initialAvgElo = this.computeSubjectAvgElo(preferredSubject);

    const engine = new GameEngine({
      canvas,
      brawler,
      mode,
      brawlerLevel,
      targetSpeedMultiplier: this.questionProvider.getTargetSpeedMultiplier(initialAvgElo),
      accessibility,
      requestNextQuestion: () =>
        this.pickAdaptiveQuestion(
          mode.target_subject,
          candidateSubjects,
          currentMatchIndex,
          currentMatchIndex === 1 && brawlerId === 'TIMO'
        ),
      onHitTelemetry: ({ question, isCorrect, reactionTimeMs }) => {
        const newElo = this.recordAdaptiveTelemetry(
          question,
          brawlerId,
          isCorrect,
          reactionTimeMs,
          currentMatchIndex
        );
        engine.setTargetSpeedMultiplier(
          this.questionProvider.getTargetSpeedMultiplier(newElo)
        );
      },
      onHudStateChange: (hud) => {
        if (superPctBadge) {
          superPctBadge.textContent = `${hud.superGaugePct}%`;
        }
        if (btnSuper) {
          const ready = hud.superGaugePct >= 100;
          btnSuper.classList.toggle('brawl-btn-yellow', ready);
          btnSuper.classList.toggle('brawl-pulse', ready);
          btnSuper.style.boxShadow = ready
            ? '0 5px 0 #090d16, 0 0 28px rgba(250,204,21,0.9)'
            : '0 5px 0 #090d16';
        }
        if (gadgetBadge) {
          gadgetBadge.textContent = `${hud.gadgetCharges}`;
        }
        if (btnGadget) {
          btnGadget.style.opacity = hud.gadgetCharges > 0 ? '1' : '0.45';
        }
      },
      onMatchFinished: (summary) => {
        this.clearActiveKeyHandler();
        this.handleMatchFinished(summary);
      },
    });

    this.activeEngine = engine;
    engine.start();

    this.bindPointerTap(btnSuper, () => engine.triggerSuperFromUI());
    this.bindPointerTap(btnGadget, () => engine.triggerGadgetFromUI());
    this.bindPointerTap(btnHint, () => engine.triggerFreeHintFromUI());
    this.setActiveKeyHandler((ev) => {
      if (ev.code === 'KeyH' && this.activeEngine === engine) {
        ev.preventDefault();
        engine.triggerFreeHintFromUI();
      }
    });

    const matchMuteBtn = this.root.querySelector<HTMLButtonElement>('#btn-match-mute');
    this.bindPointerTap(matchMuteBtn, () => {
      const mutedNow = soundManager.toggleMute();
      if (matchMuteBtn) {
        matchMuteBtn.textContent = mutedNow ? '🔇' : '🔊';
      }
    });
    this.bindPointerTap(this.root.querySelector('#btn-quit-match'), () => {
      this.clearActiveKeyHandler();
      engine.stop();
      if (this.returnToCampusAfterMatch) {
        this.startCampusExploration(brawlerId);
      } else {
        this.renderLobby();
      }
    });
  }

  private handleMatchFinished(summary: IMatchSummary): void {
    const profile = this.db.getPlayerProfile();
    const trophiesGain = summary.victory ? 25 : 8;
    const coinsGain = summary.victory ? 40 : 15;

    this.db.updatePlayerProfile({
      trophies: profile.trophies + trophiesGain,
      coins: profile.coins + coinsGain,
    });
    const starUpdate = this.db.addCombatStars(summary.starsEarned);
    this.db.recordQuestProgress({
      correctHits: summary.correctHits,
      fastReflexHits: summary.fastReflexHits,
      matchWon: summary.victory,
    });
    this.db.setSpacedRepetitionEntries(this.questionProvider.serializeSpacedQueue());

    const missedHtml =
      summary.missedQuestions.length > 0
        ? `<div class="brawl-pd-subcard" style="text-align:left; padding:10px 12px; margin-bottom:14px; background:rgba(15,23,42,0.86); border-color:#38bdf8;">
            <div style="font-size:12px; font-weight:900; color:#38bdf8; margin-bottom:6px;">💡 À RETENIR DE CETTE PARTIE</div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              ${summary.missedQuestions
                .slice(0, 3)
                .map(
                  (q) => `
                <div style="font-size:11px; color:#e2e8f0; border-left:3px solid #facc15; padding-left:8px;">
                  <div style="font-weight:800; color:#fef08a;">${q.hud_prompt}</div>
                  <div style="color:#cbd5e1;">${q.explanation_flash}</div>
                </div>`
                )
                .join('')}
            </div>
          </div>`
        : '';

    const canReturnCampus = this.returnToCampusAfterMatch;
    const overlay = document.createElement('div');
    overlay.className = 'brawl-modal-overlay';

    overlay.innerHTML = `
      <div class="brawl-modal-panel brawl-pop" style="width:min(490px, 94vw); padding:24px; text-align:center;">
        ${summary.victory ? '<div class="brawl-rays"></div>' : ''}
        <div style="position:relative; z-index:1;">
          <h2 class="brawl-title" style="margin:0 0 8px; font-size:30px; color:${summary.victory ? '#ffd426' : '#22b8ff'};">
            ${summary.victory ? '🏆 VICTOIRE !' : '📘 FIN DE PARTIE'}
          </h2>
          <div style="font-size:14px; color:#e2e8f0; margin-bottom:16px; font-weight:700;">
            Score d'objectif : <strong style="color:#ffd426;">${summary.objectiveScore}</strong> • Bonnes cibles : <strong style="color:#38e54d;">${summary.correctHits}</strong> • Réflexes ⚡ : <strong style="color:#38bdf8;">${summary.fastReflexHits}</strong>
          </div>
          <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:14px;">
            <div class="brawl-reward-tile">
              <div class="brawl-outline-text" style="font-size:20px; color:#ffd426;">+${trophiesGain}</div>
              <div style="font-size:11px; font-weight:700; color:#cbd5e1;">Trophées 🏆</div>
            </div>
            <div class="brawl-reward-tile">
              <div class="brawl-outline-text" style="font-size:20px; color:#fbbf24;">+${coinsGain}</div>
              <div style="font-size:11px; font-weight:700; color:#cbd5e1;">Pièces 🪙</div>
            </div>
            <div class="brawl-reward-tile">
              <div class="brawl-outline-text" style="font-size:20px; color:#22b8ff;">+${summary.starsEarned}</div>
              <div style="font-size:11px; font-weight:700; color:#cbd5e1;">Étoiles ⭐</div>
            </div>
          </div>
          ${missedHtml}
          ${
            starUpdate.unlockedStarrDrops > 0
              ? `<div class="brawl-pd-subcard" style="background:rgba(250,204,21,0.18); border-color:#ffd426; color:#fef08a; font-weight:900; margin-bottom:14px;">
                  🎁 +${starUpdate.unlockedStarrDrops} Casier Mystère débloqué au Lobby !
                 </div>`
              : ''
          }
          <div style="display:grid; grid-template-columns:${canReturnCampus ? 'repeat(3, 1fr)' : '1fr 1fr'}; gap:10px;">
            <button id="btn-replay-match" class="brawl-btn brawl-btn-lg brawl-btn-yellow" style="width:100%;">
              🔄 REJOUER
            </button>
            ${
              canReturnCampus
                ? `<button id="btn-return-campus" class="brawl-btn brawl-btn-lg brawl-btn-green" style="width:100%;">
                    🏫 COLLÈGE
                  </button>`
                : ''
            }
            <button id="btn-back-lobby" class="brawl-btn brawl-btn-lg brawl-btn-blue" style="width:100%;">
              LOBBY
            </button>
          </div>
        </div>
      </div>
    `;

    overlay.querySelector('#btn-replay-match')?.addEventListener('click', () => {
      overlay.remove();
      this.startMatch(summary.brawlerId, getGameModeById(summary.modeId));
    });

    overlay.querySelector('#btn-return-campus')?.addEventListener('click', () => {
      overlay.remove();
      this.startCampusExploration(summary.brawlerId);
    });

    overlay.querySelector('#btn-back-lobby')?.addEventListener('click', () => {
      overlay.remove();
      this.renderLobby();
    });

    document.body.appendChild(overlay);
  }
}

const appRoot = document.getElementById('app');
if (appRoot) {
  const app = new BrawlCollegeApp(appRoot);
  void app.bootstrap();
}
