import './styles/brawl-theme.css';
import type Phaser from 'phaser';
import type {
  BrawlerId,
  CampusRoomId,
  GameModeId,
  IGameMode,
  IQuestion,
  SubjectCategory,
} from './types/cctp';
import { AntiTiltGuard } from './accessibility/AntiTiltGuard';
import { SensoryProfile } from './accessibility/SensoryProfile';
import { SpeechReader } from './accessibility/SpeechReader';
import {
  generateBrawlerSvgMarkup,
  getSkinsForBrawler,
  preloadSkinThumbnailDataUrls,
  type SkinId,
} from './art/BrawlerSvgGenerator';
import { LocalSQLiteDB } from './db/LocalSQLiteDB';
import { KillstreakAnnouncer } from './director/KillstreakAnnouncer';
import { VersusIntroOverlay } from './director/VersusIntroOverlay';
import { CampusEngine } from './engine/CampusEngine';
import { getAllBrawlers, getBrawlerById } from './entities/Brawlers';
import { getNeuroTraitProfile, renderNeuroProfileCardHtml } from './entities/NeuroTraits';
import { BrawlPassSystem } from './liveops/BrawlPassSystem';
import { CollectorAlbum } from './liveops/CollectorAlbum';
import { QuestGenerator } from './liveops/QuestGenerator';
import {
  ALL_GAME_MODES,
  CAMPUS_WORLD_DATA,
  getGameModeById,
  getHourlyRotatedMode,
  getModeQuickGuide,
  getRoomById,
} from './modes/ModesRegistry';
import { InteractiveCampScene } from './onboarding/InteractiveCampScene';
import { LobbyTourGuide } from './onboarding/LobbyTourGuide';
import { RegistrationWizard } from './onboarding/RegistrationWizard';
import { AutoPlaytestBot } from './pwa/AutoPlaytestBot';
import { ServiceWorkerManager } from './pwa/ServiceWorkerManager';
import { TouchLock } from './pwa/TouchLock';
import {
  BrawlerUpgradeManager,
  MAX_BRAWLER_LEVEL,
} from './rpg/BrawlerUpgradeManager';
import {
  getDefaultGadgetForBrawler,
  SCHOOL_GADGETS,
  type SchoolGadgetId,
} from './rpg/GadgetSystem';
import { BRAWLER_STAR_POWERS, STAR_POWER_UNLOCK_LEVEL } from './rpg/StarPowerSystem';
import { CalmCornerModal } from './safespace/CalmCornerModal';
import { EmergencyHelpCard } from './safespace/EmergencyHelpCard';
import { recordPreventionTopicEncounter } from './safespace/ParentWellbeingAlert';
import { createPhaserBrawlGame } from './scenes/BootScene';
import { ELO_DEFAULT } from './services/EloEngine';
import { PREVENTION_QUESTIONS_100 } from './services/PreventionQuestionBank';
import { ALL_QUESTIONS_300, QuestionProvider, getSubjectVisualMeta } from './services/QuestionProvider';
import { QuestService } from './services/QuestService';
import { soundManager } from './services/SoundManager';
import { LobbyBrawlerPreview3D } from './ui/LobbyBrawlerPreview3D';
import { ParentDashboard } from './ui/ParentDashboard';
import { QuestJournalModal } from './ui/QuestJournalModal';
import { getCurrentTrophyRank, renderTrophyRoadHtml, StarrDropModal } from './ui/StarrDropModal';
import { CognitiveHintOverlay } from './ux/CognitiveHintOverlay';
import { EmoteWheel } from './ux/EmoteWheel';
import { MatchEndPodium } from './ux/MatchEndPodium';

export interface IMatchResultSummary {
  won: boolean;
  brawlerId: BrawlerId;
  modeId: GameModeId;
  objectiveScore: number;
  correctHits: number;
  fastReflexHits: number;
  missedQuestions: IQuestion[];
  starsEarned: number;
  previousElo: number;
  newElo: number;
}

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
  private readonly questionProvider = new QuestionProvider(ALL_QUESTIONS_300);
  private readonly questService = new QuestService(this.db);
  private readonly starrDropModal = new StarrDropModal(this.db);
  private readonly parentDashboard = new ParentDashboard(this.db);
  private readonly questJournalModal = new QuestJournalModal(this.db, this.questService);
  private readonly touchLock = new TouchLock({ preventPinchOutsideControls: true });
  private readonly swManager = new ServiceWorkerManager();
  private readonly sensoryProfile = new SensoryProfile(this.db);
  private readonly speechReader = new SpeechReader();
  private readonly antiTiltGuard = new AntiTiltGuard();
  private readonly upgradeManager = new BrawlerUpgradeManager(this.db);
  private readonly brawlPass = new BrawlPassSystem(this.db);
  private readonly collectorAlbum = new CollectorAlbum(this.db);
  private readonly questGenerator = new QuestGenerator(this.db);
  private readonly calmCorner = new CalmCornerModal();
  private readonly emergencyHelpCard = new EmergencyHelpCard();
  private readonly playtestBot = new AutoPlaytestBot();

  private selectedModeId: GameModeId = getHourlyRotatedMode().id;
  private readonly selectedSkinByBrawler: Partial<Record<BrawlerId, SkinId>> = {};
  private readonly selectedGadgetByBrawler: Partial<Record<BrawlerId, SchoolGadgetId>> = {};
  private matchCounter = 0;
  private activePhaserGame: Phaser.Game | null = null;
  private activeCampusEngine: CampusEngine | null = null;
  private lobbyPreview3D: LobbyBrawlerPreview3D | null = null;
  private activeCampScene: InteractiveCampScene | null = null;
  private activeEmoteWheel: EmoteWheel | null = null;
  private activeHintOverlay: CognitiveHintOverlay | null = null;
  private activeKillstreak: KillstreakAnnouncer | null = null;
  private lobbyBannerMsg: string | null = null;
  private readonly collectedCampusBadgeIds = new Set<string>();
  private returnToCampusAfterMatch = false;
  private activeKeyHandler: ((ev: KeyboardEvent) => void) | null = null;
  private qaOverlayVisible = false;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  public async bootstrap(): Promise<void> {
    await this.db.init();
    this.touchLock.attach(this.root);
    preloadSkinThumbnailDataUrls();
    void this.swManager.init();
    this.questionProvider.hydrateSpacedQueue(this.db.getSpacedRepetitionEntries());

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (ev) => {
        if (ev.key === 'F9') {
          ev.preventDefault();
          if (this.qaOverlayVisible) {
            document.getElementById('brawl-qa-debug-overlay')?.remove();
            this.qaOverlayVisible = false;
          } else {
            this.playtestBot.mountDebugMenuOverlay(document.body);
            this.qaOverlayVisible = true;
          }
        }
      });
    }

    if (!RegistrationWizard.isProfileInitialized(this.db)) {
      const wizard = new RegistrationWizard(this.db);
      const reg = await wizard.ensureRegistered({ hostElement: document.body });
      this.renderLobby();
      if (!reg.alreadyRegistered) {
        this.activeCampScene = new InteractiveCampScene({
          brawlerId: reg.selectedBrawler,
          playerNickname: reg.profile.nickname,
          hostElement: document.body,
          onComplete: () => {
            this.activeCampScene = null;
            this.db.updateAccessibilitySettings({ onboarding_seen: true });
            this.renderLobby();
            new LobbyTourGuide(this.db).startPostCampCelebrationAndTour({
              hostElement: document.body,
              onDropClaimed: () => this.renderLobby(),
              onTourFinished: () => this.renderLobby(),
            });
          },
        });
        this.activeCampScene.start();
        return;
      }
    }

    this.renderLobby();
    if (!this.db.getAccessibilitySettings().onboarding_seen) {
      this.openComfortAndGuideModal(true);
    }
  }

  private openLiveOpsAndAlbumModal(): void {
    document.getElementById('brawl-liveops-modal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'brawl-liveops-modal';
    overlay.className = 'brawl-modal-overlay';

    const masteries = this.db.getAllSkillMasteries();
    const quests = this.questGenerator.getActiveQuests();

    const renderContent = (): void => {
      const updatedProfile = this.db.getPlayerProfile();
      const questsHtml = quests
        .map((q) => {
          const canClaim = !q.claimed && q.progress >= q.target;
          return `
            <div class="brawl-pd-subcard" style="padding:10px 12px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
              <div>
                <div style="font-weight:900; color:#f8fafc;">${q.title}</div>
                <div style="font-size:12px; color:#cbd5e1;">${q.description} • ${q.progress}/${q.target}</div>
              </div>
              <div>
                ${
                  q.claimed
                    ? '<span style="color:#4ade80; font-weight:900;">✓ Réclamée</span>'
                    : canClaim
                      ? `<button type="button" data-liveops-claim="${q.id}" class="brawl-btn brawl-btn-sm brawl-btn-yellow">Réclamer (+${q.pass_tokens_reward}🎟️)</button>`
                      : `<span style="color:#facc15; font-size:12px; font-weight:800;">+${q.pass_tokens_reward}🎟️ +${q.reward_coins}🪙</span>`
                }
              </div>
            </div>
          `;
        })
        .join('');

      overlay.innerHTML = `
        <div class="brawl-modal-panel brawl-pop" style="width:min(920px, 95vw); max-height:90vh; overflow:auto; padding:22px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; gap:10px; flex-wrap:wrap;">
            <div>
              <h2 class="brawl-title" style="margin:0; font-size:24px; color:#ffd426;">🎟️ Passe de Rentrée (30 Paliers) & Album Collector</h2>
              <div style="font-size:12px; color:#cbd5e1; font-weight:700;">100% Gratuit & Éthique • Pièces : ${updatedProfile.coins}🪙 • Trophées : ${updatedProfile.trophies}🏆</div>
            </div>
            <div style="display:flex; gap:8px;">
              <button id="btn-liveops-claim-pass-all" class="brawl-btn brawl-btn-sm brawl-btn-yellow">✨ Tout Réclamer</button>
              <button id="btn-close-liveops" class="brawl-btn brawl-btn-sm">Fermer</button>
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:14px;">
            <div>${this.brawlPass.renderPassTrackHtml()}</div>
            <div style="display:grid; gap:8px;">
              <div style="font-size:14px; font-weight:900; color:#38bdf8;">⚡ Défis Live-Ops du Jour (Elo Ciblé)</div>
              ${questsHtml}
            </div>
            <div>${this.collectorAlbum.renderAlbumHtml({ masteries, trophies: updatedProfile.trophies })}</div>
          </div>
        </div>
      `;

      overlay.querySelector('#btn-close-liveops')?.addEventListener('click', () => {
        overlay.remove();
        this.renderLobby();
      });

      overlay.querySelector('#btn-liveops-claim-pass-all')?.addEventListener('click', () => {
        const res = this.brawlPass.claimAllUnlockedTiers();
        if (res.claimedCount > 0) {
          soundManager.playStarrDropReveal('EPIQUE');
          this.lobbyBannerMsg = `✨ ${res.claimedCount} palier(s) du Passe de Rentrée débloqué(s) !`;
        }
        renderContent();
      });

      overlay.querySelectorAll<HTMLButtonElement>('[data-claim-pass-tier]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tierNum = Number(btn.dataset.claimPassTier);
          const claimed = this.brawlPass.claimTier(tierNum);
          if (claimed.claimed) {
            soundManager.playStarrDropReveal('RARE');
            renderContent();
          }
        });
      });

      overlay.querySelectorAll<HTMLButtonElement>('[data-liveops-claim]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const qId = btn.dataset.liveopsClaim;
          if (!qId) return;
          const res = this.questGenerator.claimQuest(qId);
          if (res.claimed) {
            this.brawlPass.addPassTokens(res.passTokens);
            soundManager.playStarrDropReveal('SUPER_RARE');
            renderContent();
          }
        });
      });
    };

    renderContent();
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        this.renderLobby();
      }
    });
    document.body.appendChild(overlay);
  }

  private openSensoryAndTtsModal(): void {
    document.getElementById('brawl-sensory-modal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'brawl-sensory-modal';
    overlay.className = 'brawl-modal-overlay';

    overlay.innerHTML = `
      <div class="brawl-modal-panel brawl-pop" style="width:min(560px, 94vw); padding:22px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <h2 class="brawl-title" style="margin:0; font-size:22px; color:#38bdf8;">🧠 Profil Sensoriel (TSA / TDAH / Dys) & Voix FR</h2>
          <button id="btn-close-sensory" class="brawl-btn brawl-btn-sm">Fermer</button>
        </div>
        <div id="sensory-quick-mount" style="margin-bottom:14px;"></div>
        <div class="brawl-pd-subcard" style="padding:12px 14px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <div>
            <div style="font-weight:900; color:#f8fafc;">🗣️ Lecture Vocale Automatique (Web Speech FR)</div>
            <div style="font-size:12px; color:#cbd5e1;">Lit chaque consigne à voix haute dès son apparition en arène.</div>
          </div>
          <button id="btn-toggle-tts-auto" type="button" class="brawl-btn brawl-btn-sm ${this.speechReader.isAutoReadEnabled() ? 'brawl-btn-green' : ''}">
            ${this.speechReader.isAutoReadEnabled() ? '🔊 Lecture Auto : ON' : '🔇 Lecture Auto : OFF'}
          </button>
        </div>
      </div>
    `;

    const mount = overlay.querySelector<HTMLElement>('#sensory-quick-mount');
    if (mount) {
      this.sensoryProfile.mountQuickTogglePanel(mount);
    }

    const ttsBtn = overlay.querySelector<HTMLButtonElement>('#btn-toggle-tts-auto');
    ttsBtn?.addEventListener('click', () => {
      const next = !this.speechReader.isAutoReadEnabled();
      this.speechReader.setEnabled(true);
      this.speechReader.setAutoRead(next);
      ttsBtn.textContent = next ? '🔊 Lecture Auto : ON' : '🔇 Lecture Auto : OFF';
      ttsBtn.className = `brawl-btn brawl-btn-sm ${next ? 'brawl-btn-green' : ''}`;
      if (next) {
        this.speechReader.speakText('Lecture vocale automatique activée.');
      }
    });

    overlay.querySelector('#btn-close-sensory')?.addEventListener('click', () => {
      overlay.remove();
      this.renderLobby();
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        this.renderLobby();
      }
    });
    document.body.appendChild(overlay);
  }

  private openEmergencyHelpModal(): void {
    document.getElementById('brawl-emergency-modal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'brawl-emergency-modal';
    overlay.className = 'brawl-modal-overlay';
    overlay.style.zIndex = '9950';
    overlay.innerHTML = `
      <div class="brawl-modal-panel brawl-pop" style="width:min(620px, 94vw); max-height:90vh; overflow:auto; padding:22px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h2 class="brawl-title" style="margin:0; font-size:22px; color:#38bdf8;">📞 Numéros d’Écoute & Aide Bienveillante</h2>
          <button id="btn-close-emergency" class="brawl-btn brawl-btn-sm">Fermer</button>
        </div>
        <div id="emergency-card-mount"></div>
      </div>
    `;
    const mount = overlay.querySelector<HTMLElement>('#emergency-card-mount');
    if (mount) {
      this.emergencyHelpCard.mountInteractiveCard(mount);
    }
    overlay.querySelector('#btn-close-emergency')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
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

  private cleanupActiveArena(): void {
    if (this.activePhaserGame) {
      this.activePhaserGame.destroy(true);
      this.activePhaserGame = null;
    }
    this.activeEmoteWheel?.destroy();
    this.activeEmoteWheel = null;
    this.activeHintOverlay?.destroy();
    this.activeHintOverlay = null;
    this.activeKillstreak?.destroy();
    this.activeKillstreak = null;
    this.speechReader.stop();
    this.touchLock.setGameMode(false);
  }

  private openNeuroCardModal(brawlerId: BrawlerId): void {
    const overlay = document.createElement('div');
    overlay.className = 'brawl-modal-overlay';
    overlay.innerHTML = `
      <div class="brawl-modal-panel brawl-pop" style="width:min(540px, 95vw); padding:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h2 class="brawl-title" style="margin:0; font-size:22px; color:#facc15;">🧠 Pouvoir Cognitif Neuro-Inclusif</h2>
          <button id="btn-close-neuro-modal" class="brawl-btn brawl-btn-sm">✖</button>
        </div>
        ${renderNeuroProfileCardHtml(brawlerId)}
      </div>
    `;
    overlay.querySelector('#btn-close-neuro-modal')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  private renderLobby(): void {
    this.clearActiveKeyHandler();
    this.cleanupActiveArena();
    this.activeCampusEngine?.stop();
    this.activeCampusEngine = null;
    this.lobbyPreview3D?.dispose();
    this.lobbyPreview3D = null;
    this.returnToCampusAfterMatch = false;

    const profile = this.db.getPlayerProfile();
    const brawlers = getAllBrawlers();
    const selectedBrawler = getBrawlerById(profile.selected_brawler);
    const selectedBrawlerLevel = this.db.getBrawlerLevel(selectedBrawler.id);
    const scaledStats = this.upgradeManager.getBrawlerStats(
      selectedBrawler.id,
      selectedBrawlerLevel
    );
    const selectedScaledHp = scaledStats.maxHp;
    const selectedScaledDmg = scaledStats.baseDamage;
    const upgradeCost = this.db.getUpgradeCost(selectedBrawlerLevel);
    const knowledgePoints = this.db.getKnowledgePoints();
    const neuroTrait = getNeuroTraitProfile(selectedBrawler.id);
    const availableSkins = getSkinsForBrawler(selectedBrawler.id);
    const activeSkinId = this.selectedSkinByBrawler[selectedBrawler.id] ?? 'RENTREE';
    const activeSkin = availableSkins.find((s) => s.id === activeSkinId) ?? availableSkins[0];
    const activeGadgetId =
      this.selectedGadgetByBrawler[selectedBrawler.id] ??
      getDefaultGadgetForBrawler(selectedBrawler.id);
    const activeGadget = SCHOOL_GADGETS[activeGadgetId];
    const starPower = BRAWLER_STAR_POWERS[selectedBrawler.id];
    const starPowerUnlocked = selectedBrawlerLevel >= STAR_POWER_UNLOCK_LEVEL;
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

              <button id="btn-liveops-modal" class="brawl-btn brawl-btn-sm brawl-btn-blue" title="Passe de Rentrée & Album Collector">
                🎟️ Passe & Album
              </button>
              <button id="btn-starr-drop" class="brawl-btn brawl-btn-sm ${profile.starr_drops_available > 0 ? 'brawl-btn-yellow brawl-pulse' : ''}" ${profile.starr_drops_available === 0 ? 'disabled' : ''}>
                🎁 Casiers (${profile.starr_drops_available})
              </button>
              <button id="btn-calm-corner" class="brawl-btn brawl-btn-sm brawl-btn-green" title="Coin Calme, Météo des Émotions & Numéros d'Aide">
                🛡️ Coin Calme
              </button>
              <button id="btn-sensory-tts" class="brawl-btn brawl-btn-sm" title="Profil Sensoriel (TSA/TDAH/Dys) & Synthèse Vocale">
                🧠 Sensoriel
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
                  <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <button id="btn-neuro-trait" class="brawl-subject-tag" style="background:rgba(15,23,42,0.86); color:${neuroTrait.accentColor}; border-color:${neuroTrait.accentColor}; cursor:pointer;" title="${neuroTrait.loreSummary}">
                      ${neuroTrait.icon} ${neuroTrait.cognitiveBadge}
                    </button>
                    <span class="brawl-subject-tag" style="background:${brawlerSubjectMeta.badge_bg}; color:#f8fafc; border-color:${brawlerSubjectMeta.accent_color};">
                      ${brawlerSubjectMeta.icon} ${brawlerSubjectMeta.short_label}
                    </span>
                  </div>
                </div>
                <div id="brawler-3d-preview" style="width:100%; height:100%; position:relative; z-index:2;"></div>
                <div style="position:absolute; right:10px; bottom:24px; z-index:4; background:rgba(9,13,22,0.8); border:2px solid rgba(250,204,21,0.55); border-radius:12px; padding:3px; pointer-events:none;" title="Aperçu Skin SVG HD">
                  ${generateBrawlerSvgMarkup({ brawlerId: selectedBrawler.id, skinId: activeSkin.id, width: 42, height: 42 })}
                </div>
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
                  ⭐ <strong>Pouvoir Star (Niv.${STAR_POWER_UNLOCK_LEVEL})</strong> : ${starPower.icon} ${starPower.name} ${starPowerUnlocked ? '✅' : '🔒'}
                </div>
              </div>

              <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; width:100%;">
                <button id="btn-cycle-skin" class="brawl-btn brawl-btn-sm brawl-btn-purple" style="width:100%; font-size:11px;" title="Changer de Skin SVG HD">
                  🎨 Skin : ${activeSkin.displayTitle}
                </button>
                <button id="btn-cycle-gadget" class="brawl-btn brawl-btn-sm brawl-btn-green" style="width:100%; font-size:11px;" title="${activeGadget.description}">
                  ${activeGadget.icon} Gadget : ${activeGadget.shortLabel}
                </button>
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

              <button id="btn-upgrade-brawler" class="brawl-btn brawl-btn-sm brawl-btn-yellow" ${selectedBrawlerLevel >= MAX_BRAWLER_LEVEL ? 'disabled' : ''} style="width:100%;">
                ${
                  selectedBrawlerLevel >= MAX_BRAWLER_LEVEL
                    ? `⭐ NIVEAU MAX (${MAX_BRAWLER_LEVEL})`
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

    // Passe de Rentrée & Album Collector
    this.root.querySelector('#btn-liveops-modal')?.addEventListener('click', () => {
      soundManager.playUiClick();
      this.openLiveOpsAndAlbumModal();
    });

    // Casier Mystère
    this.root.querySelector('#btn-starr-drop')?.addEventListener('click', () => {
      if (this.db.getPlayerProfile().starr_drops_available > 0) {
        this.starrDropModal.open(() => this.renderLobby());
      }
    });

    // Coin Calme & Numéros d'Aide Safe-Space (M8)
    this.root.querySelector('#btn-calm-corner')?.addEventListener('click', () => {
      soundManager.playUiClick();
      this.calmCorner.open(document.body, {
        onMoodSelected: () => {},
        onOpenHelp: () => this.openEmergencyHelpModal(),
      });
    });

    // Profil Sensoriel (TSA/TDAH/Dys) & Synthèse Vocale (M7/M8)
    this.root.querySelector('#btn-sensory-tts')?.addEventListener('click', () => {
      soundManager.playUiClick();
      this.openSensoryAndTtsModal();
    });

    // Carte Pouvoir Neuro-Inclusif du Héros (M8)
    this.root.querySelector('#btn-neuro-trait')?.addEventListener('click', () => {
      soundManager.playUiClick();
      this.openNeuroCardModal(selectedBrawler.id);
    });

    // Cycle Skin SVG HD du Héros (M5)
    this.root.querySelector('#btn-cycle-skin')?.addEventListener('click', () => {
      soundManager.playUiClick();
      const idx = availableSkins.findIndex((s) => s.id === activeSkin.id);
      const nextSkin = availableSkins[(idx + 1) % availableSkins.length] ?? availableSkins[0];
      this.selectedSkinByBrawler[selectedBrawler.id] = nextSkin.id;
      this.lobbyBannerMsg = `Skin activé pour ${selectedBrawler.name} : ${nextSkin.displayTitle} !`;
      this.renderLobby();
    });

    // Cycle Gadget Tactique Scolaire (M7)
    this.root.querySelector('#btn-cycle-gadget')?.addEventListener('click', () => {
      soundManager.playUiClick();
      const gadgetOrder: SchoolGadgetId[] = ['GOMME_MAGIQUE', 'SABLIER_GELE', 'HALO_EXPERT'];
      const gIdx = gadgetOrder.indexOf(activeGadgetId);
      const nextGadgetId = gadgetOrder[(gIdx + 1) % gadgetOrder.length];
      this.selectedGadgetByBrawler[selectedBrawler.id] = nextGadgetId;
      this.lobbyBannerMsg = `Gadget sélectionné : ${SCHOOL_GADGETS[nextGadgetId].icon} ${SCHOOL_GADGETS[nextGadgetId].name}`;
      this.renderLobby();
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

    // Amélioration Héros Niveau 1 -> 11
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
    this.cleanupActiveArena();
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
    this.cleanupActiveArena();
    this.activeCampusEngine?.stop();
    this.activeCampusEngine = null;
    this.lobbyPreview3D?.dispose();
    this.lobbyPreview3D = null;
    this.matchCounter += 1;
    const currentMatchIndex = this.matchCounter;
    const profile = this.db.getPlayerProfile();
    const brawler = getBrawlerById(brawlerId);
    const brawlerLevel = this.db.getBrawlerLevel(brawlerId);
    const accessibility = this.db.getAccessibilitySettings();
    const preferredSubject = mode.target_subject ?? brawler.favorite_subject;
    const candidateSubjects = mode.target_subject
      ? [mode.target_subject]
      : brawler.secondary_subject
        ? [brawler.favorite_subject, brawler.secondary_subject]
        : [brawler.favorite_subject];
    const initialAvgElo = this.computeSubjectAvgElo(preferredSubject);
    const selectedGadgetId =
      this.selectedGadgetByBrawler[brawlerId] ?? getDefaultGadgetForBrawler(brawlerId);

    this.touchLock.setGameMode(true);
    this.antiTiltGuard.reset();

    this.root.innerHTML = `
      <div class="arena-container" style="position:relative; width:100%; height:100%; overflow:hidden; background:#020617;">
        <div id="phaser-arena-mount" style="width:100%; height:100%; position:relative;"></div>
        <div id="killstreak-banner-host" style="position:absolute; inset:0; pointer-events:none; z-index:45;"></div>
      </div>
    `;

    const arenaContainer = this.root.querySelector<HTMLElement>('.arena-container');
    const phaserMount = this.root.querySelector<HTMLElement>('#phaser-arena-mount');
    const killstreakHost = this.root.querySelector<HTMLElement>('#killstreak-banner-host');
    if (!arenaContainer || !phaserMount) return;

    this.activeKillstreak = new KillstreakAnnouncer();
    if (killstreakHost) {
      this.activeKillstreak.mountBannerContainer(killstreakHost);
    }

    this.activeHintOverlay = new CognitiveHintOverlay({
      container: arenaContainer,
      accessibility,
    });

    this.activeEmoteWheel = new EmoteWheel({
      container: arenaContainer,
      brawlerId,
      buttonAnchor: 'top-right',
    });

    const launchArena = (): void => {
      if (this.matchCounter !== currentMatchIndex || !phaserMount.isConnected) return;

      const game = createPhaserBrawlGame(phaserMount, {
        brawlerId,
        brawlerLevel,
        modeId: mode.id,
        playerNickname: profile.nickname,
        questions:
          mode.id === 'LES_GARDIENS_DE_LA_RECRE'
            ? [...PREVENTION_QUESTIONS_100]
            : [...ALL_QUESTIONS_300],
        sensoryProfile: this.sensoryProfile,
        antiTiltGuard: this.antiTiltGuard,
        selectedGadgetId,
        touchLock: this.touchLock,
        onRequestNextQuestion: (subj) => {
          if (mode.id === 'LES_GARDIENS_DE_LA_RECRE') {
            return this.antiTiltGuard.selectNextQuestion(
              PREVENTION_QUESTIONS_100,
              this.computeSubjectAvgElo('vie_au_college'),
              'vie_au_college'
            ).question;
          }
          return this.pickAdaptiveQuestion(
            subj ?? mode.target_subject,
            candidateSubjects,
            currentMatchIndex,
            currentMatchIndex === 1 && brawlerId === 'TIMO'
          );
        },
        onAttemptRecorded: ({ question, isCorrect, reactionTimeMs }) => {
          this.recordAdaptiveTelemetry(
            question,
            brawlerId,
            isCorrect,
            reactionTimeMs,
            currentMatchIndex
          );
          this.activeHintOverlay?.recordAnswerResult(question.subject, isCorrect, question);
          if (isCorrect) {
            this.activeKillstreak?.registerCorrectHit();
          } else {
            this.activeKillstreak?.registerError();
          }
          if (question.skill_code.startsWith('PREV_')) {
            recordPreventionTopicEncounter(question.skill_code);
          }
        },
        onHintRequested: (question) => {
          this.activeHintOverlay?.showHint(question.subject, question);
        },
        onQuitRequested: () => {
          this.clearActiveKeyHandler();
          this.cleanupActiveArena();
          if (this.returnToCampusAfterMatch) {
            this.startCampusExploration(brawlerId);
          } else {
            this.renderLobby();
          }
        },
        onMatchFinished: (result) => {
          this.clearActiveKeyHandler();
          const finalAvgElo = this.computeSubjectAvgElo(preferredSubject);
          const starsEarned = result.won ? (result.fastReflexHits >= 3 ? 3 : 2) : 1;
          this.handleMatchFinished({
            won: result.won,
            brawlerId,
            modeId: result.modeId,
            objectiveScore: result.objectiveScore,
            correctHits: result.correctHits,
            fastReflexHits: result.fastReflexHits,
            missedQuestions: result.missedQuestions,
            starsEarned,
            previousElo: initialAvgElo,
            newElo: finalAvgElo,
          });
        },
      });

      game.registry.set('externalMatchEndUI', true);
      this.activePhaserGame = game;
      this.setActiveKeyHandler((ev) => {
        if (ev.key === 'Escape' && this.activePhaserGame === game) {
          ev.preventDefault();
          this.clearActiveKeyHandler();
          this.cleanupActiveArena();
          if (this.returnToCampusAfterMatch) {
            this.startCampusExploration(brawlerId);
          } else {
            this.renderLobby();
          }
        }
      });
    };

    const skipIntro = this.sensoryProfile.getConfig().tsaSensoryComfort;
    if (skipIntro) {
      launchArena();
    } else {
      void new VersusIntroOverlay()
        .play({
          container: arenaContainer,
          brawler,
          brawlerLevel,
          mode,
          playerName: profile.nickname,
          versusHoldMs: 1050,
          countdownStepMs: 380,
        })
        .then(() => {
          launchArena();
        });
    }
  }

  private handleMatchFinished(summary: IMatchResultSummary): void {
    this.cleanupActiveArena();
    const profile = this.db.getPlayerProfile();
    const previousTrophies = profile.trophies;
    const previousCoins = profile.coins;
    const trophiesGain = summary.won ? 25 : 8;
    const coinsGain = summary.won ? 40 : 15;
    const newTrophies = previousTrophies + trophiesGain;

    this.db.updatePlayerProfile({
      trophies: newTrophies,
      coins: previousCoins + coinsGain,
    });
    const starUpdate = this.db.addCombatStars(summary.starsEarned);
    const mode = getGameModeById(summary.modeId);
    const brawler = getBrawlerById(summary.brawlerId);
    const preferredSubject = mode.target_subject ?? brawler.favorite_subject;

    this.db.recordQuestProgress({
      correctHits: summary.correctHits,
      fastReflexHits: summary.fastReflexHits,
      matchWon: summary.won,
    });
    this.questGenerator.recordCombatOutcome({
      subject: preferredSubject,
      correctHits: summary.correctHits,
      fastReflexHits: summary.fastReflexHits,
      matchWon: summary.won,
    });
    this.brawlPass.addPassTokens(summary.won ? 45 : 20);
    this.collectorAlbum.evaluateAlbum({
      masteries: this.db.getAllSkillMasteries(),
      trophies: newTrophies,
    });
    this.db.setSpacedRepetitionEntries(this.questionProvider.serializeSpacedQueue());

    const podium = new MatchEndPodium({
      container: document.body,
      victory: summary.won,
      modeName: mode.name,
      playerBrawlerId: summary.brawlerId,
      playerName: profile.nickname,
      playerScoreLabel: `${summary.objectiveScore} pts • ${summary.correctHits} cibles • ${summary.fastReflexHits}⚡`,
      previousTrophies,
      newTrophies,
      coinsEarned: coinsGain,
      previousCoins,
      starsEarned: summary.starsEarned,
      previousElo: summary.previousElo,
      newElo: summary.newElo,
      subjectCategory: preferredSubject,
      starrDropEarned: starUpdate.unlockedStarrDrops > 0,
      starrDropsUnlocked: starUpdate.unlockedStarrDrops,
      onReplay: () => this.startMatch(summary.brawlerId, mode),
      onOpenStarrDrop: () => this.starrDropModal.open(() => this.renderLobby()),
      onReturnCollege: () => {
        if (this.returnToCampusAfterMatch) {
          this.startCampusExploration(summary.brawlerId);
        } else {
          this.renderLobby();
        }
      },
    });
    podium.show();
  }
}

const appRoot = document.getElementById('app');
if (appRoot) {
  const app = new BrawlCollegeApp(appRoot);
  void app.bootstrap();
}
