import './styles/brawl-theme.css';
import type { BrawlerId, GameModeId, IGameMode, IQuestion } from './types/cctp';
import { LocalSQLiteDB } from './db/LocalSQLiteDB';
import { GameEngine, type IMatchSummary } from './engine/GameEngine';
import { getAllBrawlers, getBrawlerById } from './entities/Brawlers';
import { ALL_GAME_MODES, getGameModeById, getHourlyRotatedMode } from './modes/ModesRegistry';
import { ELO_DEFAULT } from './services/EloEngine';
import { QuestionProvider } from './services/QuestionProvider';
import { soundManager } from './services/SoundManager';
import { ParentDashboard } from './ui/ParentDashboard';
import { LobbyBrawlerPreview3D } from './ui/LobbyBrawlerPreview3D';
import { renderTrophyRoadHtml, StarrDropModal } from './ui/StarrDropModal';

const SUBJECT_NAMES: Record<string, string> = {
  mathematiques: 'Maths & Logique',
  francais: 'Français & Conjugaison',
  anglais: 'Anglais LV1',
  histoire_geo_sciences: 'Histoire-Géo & Sciences',
  vie_au_college: 'Vie au Collège 6e',
};

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
  private readonly starrDropModal = new StarrDropModal(this.db);
  private readonly parentDashboard = new ParentDashboard(this.db);

  private selectedModeId: GameModeId = getHourlyRotatedMode().id;
  private matchCounter = 0;
  private activeEngine: GameEngine | null = null;
  private lobbyPreview3D: LobbyBrawlerPreview3D | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  public async bootstrap(): Promise<void> {
    await this.db.init();
    this.renderLobby();
  }

  private renderLobby(): void {
    this.activeEngine?.stop();
    this.activeEngine = null;
    this.lobbyPreview3D?.dispose();
    this.lobbyPreview3D = null;

    const profile = this.db.getPlayerProfile();
    const brawlers = getAllBrawlers();
    const selectedBrawler = getBrawlerById(profile.selected_brawler);
    const selectedMode = getGameModeById(this.selectedModeId);
    const hourlyMode = getHourlyRotatedMode();
    const stars = this.db.getCombatStars();
    const starsProgress = stars % 3;
    const isMuted = soundManager.isMuted();

    this.root.innerHTML = `
      <div class="brawl-bg" style="min-height:100dvh; padding:14px 16px;">
        <div class="lobby-shell" style="max-width:1200px; margin:0 auto; display:flex; flex-direction:column; gap:14px;">
          <!-- Header Bar -->
          <header class="brawl-card" style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px; padding:12px 18px;">
            <div>
              <div class="brawl-outline-text" style="font-size:11px; text-transform:uppercase; letter-spacing:1.3px; color:#38bdf8;">Brawl Collège : Opération 6ème</div>
              <h1 class="brawl-title" style="margin:2px 0 0; font-size:22px; color:#ffd426;">🎒 ${profile.nickname} — Prêt pour l'arène !</h1>
            </div>
            <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px;">
              <div class="brawl-outline-text" style="background:#0b1129; border:2.5px solid #090d16; padding:7px 12px; border-radius:11px; font-size:13px; box-shadow:0 3px 0 #090d16;">🏆 ${profile.trophies} / 1000</div>
              <div class="brawl-outline-text" style="background:#0b1129; border:2.5px solid #090d16; padding:7px 12px; border-radius:11px; font-size:13px; color:#ffd426; box-shadow:0 3px 0 #090d16;">🪙 ${profile.coins}</div>
              <div class="brawl-outline-text" style="background:#0b1129; border:2.5px solid #090d16; padding:7px 12px; border-radius:11px; font-size:13px; color:#22b8ff; box-shadow:0 3px 0 #090d16;">⭐ ${starsProgress}/3</div>
              <button id="btn-starr-drop" class="brawl-btn brawl-btn-sm ${profile.starr_drops_available > 0 ? 'brawl-btn-yellow brawl-pulse' : ''}" ${profile.starr_drops_available === 0 ? 'disabled' : ''}>
                🎁 Casiers (${profile.starr_drops_available})
              </button>
              <button id="btn-parent-dash" class="brawl-btn brawl-btn-sm brawl-btn-blue">
                🔒 Carnet Parent
              </button>
              <button id="btn-toggle-mute" class="brawl-btn brawl-btn-sm" title="Activer ou couper les effets sonores">
                ${isMuted ? '🔇 Muet' : '🔊 Son'}
              </button>
            </div>
          </header>

          <!-- Route vers la 6ème -->
          ${renderTrophyRoadHtml(profile.trophies)}

          <!-- Sélection Héros & Modes -->
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:16px;">
            <!-- 4 Héros -->
            <section class="brawl-card" style="padding:14px;">
              <h2 class="brawl-outline-text" style="margin:0 0 10px; font-size:17px; color:#ffd426;">⚡ LES 4 ÉLÈVES-HÉROS</h2>
              <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:10px;">
                ${brawlers
                  .map((b) => {
                    const isSelected = b.id === selectedBrawler.id;
                    const accent = BRAWLER_BADGE_COLORS[b.id];
                    const ringClass = BRAWLER_RING_CLASS[b.id];
                    return `
                    <button data-brawler-id="${b.id}" class="brawl-card ${isSelected ? 'brawl-card-active' : ''}" style="text-align:left; padding:10px; cursor:pointer; display:flex; align-items:center; gap:10px;">
                      <span class="brawl-portrait-ring ${ringClass}" style="width:52px; height:52px; flex-shrink:0;">
                        <img src="${BRAWLER_PORTRAITS[b.id]}" alt="${b.name}" style="width:100%; height:100%; object-fit:cover; display:block;" />
                      </span>
                      <div style="min-width:0; flex:1;">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:4px;">
                          <strong class="brawl-outline-text" style="font-size:15px; color:${accent};">${b.name}</strong>
                          <span style="font-size:11px; font-weight:800; color:#f8fafc;">❤️ ${b.base_hp}</span>
                        </div>
                        <div style="font-size:11px; color:#cbd5e1; margin:1px 0 3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${b.title}</div>
                        <div style="font-size:11px; font-weight:700; color:#e2e8f0;">📚 ${SUBJECT_NAMES[b.favorite_subject]}</div>
                        <div style="font-size:10px; color:#fde68a; margin-top:2px;">⚡ ${b.super_ability.name}</div>
                      </div>
                    </button>
                  `;
                  })
                  .join('')}
              </div>
              <div style="margin-top:12px; display:grid; grid-template-columns:minmax(180px, 240px) 1fr; gap:12px; align-items:stretch;">
                <div class="brawl-pd-subcard" style="background:radial-gradient(circle at 50% 45%, #263c9e 0%, #090e26 88%); padding:6px; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                  <div id="brawler-3d-preview" style="width:100%; height:200px;"></div>
                  <div style="font-size:10px; color:#cbd5e1; margin-top:2px; font-weight:700;">🧊 Modèle 3D — glisser pour pivoter</div>
                </div>
                <div class="brawl-pd-subcard" style="padding:12px; font-size:12px; color:#e2e8f0; display:flex; flex-direction:column; justify-content:center; gap:7px;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span class="brawl-portrait-ring ${BRAWLER_RING_CLASS[selectedBrawler.id]}" style="width:36px; height:36px; flex-shrink:0;">
                      <img src="${BRAWLER_PORTRAITS[selectedBrawler.id]}" alt="${selectedBrawler.name}" style="width:100%; height:100%; object-fit:cover; display:block;" />
                    </span>
                    <div>
                      <div style="font-size:15px;"><strong class="brawl-outline-text" style="color:${BRAWLER_BADGE_COLORS[selectedBrawler.id]};">${selectedBrawler.name}</strong> — <span style="font-weight:700;">${selectedBrawler.title}</span></div>
                      <div style="font-size:11px; color:#93c5fd; font-weight:700;">${selectedBrawler.archetype} • ⚡ ${selectedBrawler.speed_value} • ❤️ ${selectedBrawler.base_hp} PV</div>
                    </div>
                  </div>
                  <div>🎯 <strong>${selectedBrawler.basic_attack.name}</strong> : ${selectedBrawler.basic_attack.projectiles_count}×${selectedBrawler.basic_attack.base_damage} dégâts</div>
                  <div>🟡 <strong>Super</strong> : ${selectedBrawler.super_ability.name}</div>
                  <div>🟢 <strong>Gadget (×3)</strong> : ${selectedBrawler.gadget.name}</div>
                </div>
              </div>
            </section>

            <!-- 5 Modes -->
            <section class="brawl-card" style="padding:14px; display:flex; flex-direction:column; justify-content:space-between;">
              <div>
                <h2 class="brawl-outline-text" style="margin:0 0 10px; font-size:17px; color:#22b8ff;">🏟️ LES 5 MODES D'ARÈNE <span style="font-size:12px; color:#fde047;">(Rotation : ${hourlyMode.name})</span></h2>
                <div style="display:flex; flex-direction:column; gap:8px;">
                  ${ALL_GAME_MODES.map((m) => {
                    const active = m.id === selectedMode.id;
                    return `
                    <button data-mode-id="${m.id}" class="brawl-card ${active ? 'brawl-card-active' : ''}" style="text-align:left; padding:9px 12px; cursor:pointer;">
                      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                        <strong class="brawl-outline-text" style="font-size:14px; color:${active ? '#ffd426' : '#f8fafc'};">${m.mode_number}. ${m.name}</strong>
                        <span style="font-size:11px; color:#ffd426; font-weight:900; background:#090e26; border:2px solid #090d16; border-radius:8px; padding:2px 7px;">${m.format} • ${m.duration_seconds}s</span>
                      </div>
                      <div style="font-size:11px; color:#cbd5e1; margin-top:3px;">${m.description}</div>
                    </button>
                  `;
                  }).join('')}
                </div>
              </div>

              <button id="btn-play-match" class="brawl-btn brawl-btn-lg brawl-btn-yellow brawl-pulse" style="margin-top:14px; width:100%;">
                ▶ JOUER (${selectedBrawler.name.toUpperCase()} — ${selectedMode.name.toUpperCase()})
              </button>
            </section>
          </div>
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
        const mId = btn.dataset.modeId as GameModeId | undefined;
        if (mId) {
          this.selectedModeId = mId;
          this.renderLobby();
        }
      });
    });

    // Casier Mystère
    this.root.querySelector('#btn-starr-drop')?.addEventListener('click', () => {
      if (this.db.getPlayerProfile().starr_drops_available > 0) {
        this.starrDropModal.open(() => this.renderLobby());
      }
    });

    // Dashboard Parent
    this.root.querySelector('#btn-parent-dash')?.addEventListener('click', () => {
      this.parentDashboard.open(() => this.renderLobby());
    });

    // Audio Mute Toggle
    const muteBtn = this.root.querySelector<HTMLButtonElement>('#btn-toggle-mute');
    muteBtn?.addEventListener('click', () => {
      const mutedNow = soundManager.toggleMute();
      muteBtn.textContent = mutedNow ? '🔇 Muet' : '🔊 Son';
    });

    // Lancer le combat 60 FPS
    this.root.querySelector('#btn-play-match')?.addEventListener('click', () => {
      this.startMatch(selectedBrawler.id, selectedMode);
    });
  }

  private startMatch(brawlerId: BrawlerId, mode: IGameMode): void {
    this.lobbyPreview3D?.dispose();
    this.lobbyPreview3D = null;
    this.matchCounter += 1;
    const currentMatchIndex = this.matchCounter;
    const brawler = getBrawlerById(brawlerId);
    const preferredSubject = mode.target_subject ?? brawler.favorite_subject;

    this.root.innerHTML = `
      <div class="arena-container">
        <canvas id="arena-canvas" style="display:block; width:100%; height:100%;"></canvas>

        <!-- Boutons haut gauche sous HUD -->
        <div style="position:absolute; top:68px; left:14px; display:flex; gap:8px; z-index:10;">
          <button id="btn-quit-match" class="brawl-btn brawl-btn-sm">
            ✖ Quitter
          </button>
          <button id="btn-match-mute" class="brawl-btn brawl-btn-sm" title="Son">
            ${soundManager.isMuted() ? '🔇' : '🔊'}
          </button>
        </div>

        <!-- Aide commandes desktop/tactile -->
        <div style="position:absolute; bottom:14px; left:16px; background:rgba(9,13,22,0.82); border:2px solid #090d16; padding:6px 12px; border-radius:11px; font-size:11px; font-weight:700; color:#e2e8f0; pointer-events:none;">
          🕹️ Gauche / ZQSD : Bouger • 🎯 Droite / Clic : Viser & Tirer • 🟡 Espace : Super • 🟢 E : Gadget
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
    const superPctBadge = this.root.querySelector<HTMLElement>('#super-pct-badge');
    const gadgetBadge = this.root.querySelector<HTMLElement>('#gadget-count-badge');

    const getAdaptiveQuestion = (): IQuestion => {
      // Sur la toute première question de Timo en Maths, garantir 7x8=56 pour validation US-01
      if (currentMatchIndex === 1 && brawlerId === 'TIMO') {
        const firstQ = this.questionProvider.getQuestionById('MATH_MUL_001');
        if (firstQ) return firstQ;
      }
      const subjectSkills = this.db
        .getAllSkillMasteries()
        .filter((s) => s.subject_category === preferredSubject);
      const avgElo =
        subjectSkills.length > 0
          ? Math.round(
              subjectSkills.reduce((acc, s) => acc + s.elo_rating, 0) / subjectSkills.length
            )
          : ELO_DEFAULT;

      return this.questionProvider.getNextQuestion({
        subject: mode.target_subject ?? (Math.random() < 0.7 ? preferredSubject : undefined),
        targetElo: avgElo,
        currentMatchIndex,
      });
    };

    const engine = new GameEngine({
      canvas,
      brawler,
      mode,
      requestNextQuestion: getAdaptiveQuestion,
      onHitTelemetry: ({ question, isCorrect, reactionTimeMs }) => {
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

        engine.setTargetSpeedMultiplier(
          this.questionProvider.getTargetSpeedMultiplier(eloResult.new_elo)
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
        this.handleMatchFinished(summary);
      },
    });

    this.activeEngine = engine;
    engine.start();

    btnSuper?.addEventListener('click', () => engine.triggerSuperFromUI());
    btnGadget?.addEventListener('click', () => engine.triggerGadgetFromUI());
    const matchMuteBtn = this.root.querySelector<HTMLButtonElement>('#btn-match-mute');
    matchMuteBtn?.addEventListener('click', () => {
      const mutedNow = soundManager.toggleMute();
      matchMuteBtn.textContent = mutedNow ? '🔇' : '🔊';
    });
    this.root.querySelector('#btn-quit-match')?.addEventListener('click', () => {
      engine.stop();
      this.renderLobby();
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

    const overlay = document.createElement('div');
    overlay.className = 'brawl-modal-overlay';

    overlay.innerHTML = `
      <div class="brawl-modal-panel brawl-pop" style="width:min(460px, 94vw); padding:26px; text-align:center;">
        ${summary.victory ? '<div class="brawl-rays"></div>' : ''}
        <div style="position:relative; z-index:1;">
          <h2 class="brawl-title" style="margin:0 0 8px; font-size:30px; color:${summary.victory ? '#ffd426' : '#22b8ff'};">
            ${summary.victory ? '🏆 VICTOIRE !' : '📘 FIN DE PARTIE'}
          </h2>
          <div style="font-size:14px; color:#e2e8f0; margin-bottom:16px; font-weight:700;">
            Score d'objectif : <strong style="color:#ffd426;">${summary.objectiveScore}</strong> • Bonnes cibles : <strong style="color:#38e54d;">${summary.correctHits}</strong>
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
          ${
            starUpdate.unlockedStarrDrops > 0
              ? `<div class="brawl-pd-subcard" style="background:rgba(250,204,21,0.18); border-color:#ffd426; color:#fef08a; font-weight:900; margin-bottom:14px;">
                  🎁 +${starUpdate.unlockedStarrDrops} Casier Mystère débloqué au Lobby !
                 </div>`
              : ''
          }
          <button id="btn-back-lobby" class="brawl-btn brawl-btn-lg brawl-btn-yellow" style="width:100%;">
            RETOUR AU LOBBY
          </button>
        </div>
      </div>
    `;

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
