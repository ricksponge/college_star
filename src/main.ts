import type { BrawlerId, GameModeId, IGameMode, IQuestion } from './types/cctp';
import { LocalSQLiteDB } from './db/LocalSQLiteDB';
import { GameEngine, type IMatchSummary } from './engine/GameEngine';
import { getAllBrawlers, getBrawlerById } from './entities/Brawlers';
import { ALL_GAME_MODES, getGameModeById, getHourlyRotatedMode } from './modes/ModesRegistry';
import { ELO_DEFAULT } from './services/EloEngine';
import { QuestionProvider } from './services/QuestionProvider';
import { ParentDashboard } from './ui/ParentDashboard';
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
  LEO: '#a855f7',
  MAYA: '#84cc16',
  ZACK: '#22d3ee',
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

    const profile = this.db.getPlayerProfile();
    const brawlers = getAllBrawlers();
    const selectedBrawler = getBrawlerById(profile.selected_brawler);
    const selectedMode = getGameModeById(this.selectedModeId);
    const hourlyMode = getHourlyRotatedMode();
    const stars = this.db.getCombatStars();
    const starsProgress = stars % 3;

    this.root.innerHTML = `
      <div style="max-width:1180px; margin:0 auto; padding:16px; display:flex; flex-direction:column; gap:16px;">
        <!-- Header Bar -->
        <header style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px; background:#0f172a; border:2px solid #1e293b; border-radius:16px; padding:12px 18px;">
          <div>
            <div style="font-size:11px; text-transform:uppercase; letter-spacing:1.2px; color:#38bdf8; font-weight:800;">Brawl Collège : Opération 6ème</div>
            <h1 style="margin:2px 0 0; font-size:22px; font-weight:900; color:#facc15;">🎒 ${profile.nickname} — Prêt pour l'arène !</h1>
          </div>
          <div style="display:flex; flex-wrap:wrap; align-items:center; gap:10px;">
            <div style="background:#1e293b; padding:8px 12px; border-radius:10px; font-weight:800; font-size:14px;">🏆 ${profile.trophies} / 1000</div>
            <div style="background:#1e293b; padding:8px 12px; border-radius:10px; font-weight:800; font-size:14px; color:#facc15;">🪙 ${profile.coins}</div>
            <div style="background:#1e293b; padding:8px 12px; border-radius:10px; font-weight:800; font-size:14px; color:#38bdf8;">⭐ ${starsProgress}/3</div>
            <button id="btn-starr-drop" style="padding:9px 14px; border-radius:10px; border:2px solid ${profile.starr_drops_available > 0 ? '#facc15' : '#475569'};
                    background:${profile.starr_drops_available > 0 ? 'linear-gradient(135deg,#eab308,#f97316)' : '#1e293b'};
                    color:${profile.starr_drops_available > 0 ? '#0f172a' : '#94a3b8'}; font-weight:900; cursor:pointer;">
              🎁 Casiers (${profile.starr_drops_available})
            </button>
            <button id="btn-parent-dash" style="padding:9px 14px; border-radius:10px; border:1px solid #38bdf8; background:#0f172a; color:#38bdf8; font-weight:800; cursor:pointer;">
              🔒 Carnet Parent
            </button>
          </div>
        </header>

        <!-- Route vers la 6ème -->
        ${renderTrophyRoadHtml(profile.trophies)}

        <!-- Sélection Héros & Modes -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:16px;">
          <!-- 4 Héros -->
          <section style="background:#0f172a; border:1px solid #1e293b; border-radius:16px; padding:14px;">
            <h2 style="margin:0 0 10px; font-size:16px; color:#facc15;">⚡ Les 4 Élèves-Héros</h2>
            <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:10px;">
              ${brawlers
                .map((b) => {
                  const isSelected = b.id === selectedBrawler.id;
                  const accent = BRAWLER_BADGE_COLORS[b.id];
                  return `
                  <button data-brawler-id="${b.id}" style="text-align:left; padding:10px; border-radius:12px; cursor:pointer;
                          background:${isSelected ? 'rgba(250,204,21,0.12)' : '#1e293b'};
                          border:2px solid ${isSelected ? accent : '#334155'}; color:#f8fafc;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                      <strong style="font-size:15px; color:${accent};">${b.name}</strong>
                      <span style="font-size:11px; color:#cbd5e1;">❤️ ${b.base_hp}</span>
                    </div>
                    <div style="font-size:11px; color:#94a3b8; margin:2px 0 4px;">${b.title}</div>
                    <div style="font-size:11px; color:#e2e8f0;">📚 ${SUBJECT_NAMES[b.favorite_subject]}</div>
                    <div style="font-size:10px; color:#cbd5e1; margin-top:4px;">Super : <strong>${b.super_ability.name}</strong></div>
                  </button>
                `;
                })
                .join('')}
            </div>
            <div style="margin-top:10px; background:#1e293b; border-radius:10px; padding:10px; font-size:12px; color:#cbd5e1;">
              <div><strong>${selectedBrawler.name}</strong> (${selectedBrawler.archetype}) — Vitesse ${selectedBrawler.speed_value}</div>
              <div style="margin-top:4px;">🎯 Tir : <em>${selectedBrawler.basic_attack.name}</em> (${selectedBrawler.basic_attack.projectiles_count}×${selectedBrawler.basic_attack.base_damage} dégâts)</div>
              <div>🟡 Super : <em>${selectedBrawler.super_ability.name}</em> • 🟢 Gadget : <em>${selectedBrawler.gadget.name}</em></div>
            </div>
          </section>

          <!-- 5 Modes -->
          <section style="background:#0f172a; border:1px solid #1e293b; border-radius:16px; padding:14px; display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <h2 style="margin:0 0 10px; font-size:16px; color:#38bdf8;">🏟️ Les 5 Modes d'Arène (Rotation : ${hourlyMode.name})</h2>
              <div style="display:flex; flex-direction:column; gap:8px;">
                ${ALL_GAME_MODES.map((m) => {
                  const active = m.id === selectedMode.id;
                  return `
                  <button data-mode-id="${m.id}" style="text-align:left; padding:9px 12px; border-radius:10px; cursor:pointer;
                          background:${active ? 'rgba(56,189,248,0.16)' : '#1e293b'};
                          border:2px solid ${active ? '#38bdf8' : '#334155'}; color:#f8fafc;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                      <strong style="font-size:14px;">${m.mode_number}. ${m.name}</strong>
                      <span style="font-size:11px; color:#facc15; font-weight:700;">${m.format} • ${m.duration_seconds}s</span>
                    </div>
                    <div style="font-size:11px; color:#94a3b8; margin-top:2px;">${m.description}</div>
                  </button>
                `;
                }).join('')}
              </div>
            </div>

            <button id="btn-play-match" style="margin-top:14px; width:100%; padding:15px; border-radius:14px; border:none;
                    background:linear-gradient(135deg, #facc15, #f97316); color:#0f172a; font-size:20px; font-weight:900;
                    cursor:pointer; box-shadow:0 10px 30px rgba(250,204,21,0.35);">
              ▶ JOUER (${selectedBrawler.name.toUpperCase()} — ${selectedMode.name.toUpperCase()})
            </button>
          </section>
        </div>
      </div>
    `;

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

    // Lancer le combat 60 FPS
    this.root.querySelector('#btn-play-match')?.addEventListener('click', () => {
      this.startMatch(selectedBrawler.id, selectedMode);
    });
  }

  private startMatch(brawlerId: BrawlerId, mode: IGameMode): void {
    this.matchCounter += 1;
    const currentMatchIndex = this.matchCounter;
    const brawler = getBrawlerById(brawlerId);
    const preferredSubject = mode.target_subject ?? brawler.favorite_subject;

    this.root.innerHTML = `
      <div style="position:relative; width:100vw; height:100vh; overflow:hidden; background:#020617;">
        <canvas id="arena-canvas" style="display:block; width:100%; height:100%;"></canvas>

        <!-- Bouton Quitter haut gauche sous HUD -->
        <button id="btn-quit-match" style="position:absolute; top:64px; left:14px; padding:7px 14px; border-radius:10px;
                border:1px solid #475569; background:rgba(15,23,42,0.85); color:#f8fafc; font-weight:800; cursor:pointer; z-index:10;">
          ✖ Quitter
        </button>

        <!-- Aide commandes desktop/tactile -->
        <div style="position:absolute; bottom:14px; left:16px; background:rgba(15,23,42,0.78); padding:6px 12px; border-radius:10px; font-size:11px; color:#cbd5e1; pointer-events:none;">
          🕹️ Gauche / ZQSD : Bouger • 🎯 Droite / Clic : Viser & Tirer • 🟡 Espace : Super • 🟢 E : Gadget
        </div>

        <!-- Boutons tactiles Super (Jaune) & Gadget (Vert) -->
        <div style="position:absolute; right:20px; bottom:20px; display:flex; align-items:flex-end; gap:14px; z-index:10;">
          <button id="btn-hud-gadget" style="width:70px; height:70px; border-radius:999px; border:3px solid #86efac;
                  background:#16a34a; color:#fff; font-weight:900; font-size:12px; cursor:pointer; box-shadow:0 6px 20px rgba(22,163,74,0.5);">
            GADGET<br><span id="gadget-count-badge">3</span>
          </button>
          <button id="btn-hud-super" style="width:88px; height:88px; border-radius:999px; border:4px solid #fef08a;
                  background:#475569; color:#cbd5e1; font-weight:900; font-size:14px; cursor:pointer; transition:all 0.15s;">
            SUPER<br><span id="super-pct-badge">0%</span>
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
          btnSuper.style.background = ready
            ? 'linear-gradient(135deg, #facc15, #f59e0b)'
            : '#475569';
          btnSuper.style.color = ready ? '#0f172a' : '#cbd5e1';
          btnSuper.style.boxShadow = ready ? '0 0 28px rgba(250,204,21,0.9)' : 'none';
        }
        if (gadgetBadge) {
          gadgetBadge.textContent = `${hud.gadgetCharges}`;
        }
        if (btnGadget) {
          btnGadget.style.opacity = hud.gadgetCharges > 0 ? '1' : '0.4';
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
    overlay.style.cssText =
      'position:fixed; inset:0; background:rgba(2,6,23,0.9); display:flex; align-items:center; justify-content:center; z-index:9998; padding:16px;';

    overlay.innerHTML = `
      <div style="width:min(460px, 94vw); background:#0f172a; border:3px solid ${summary.victory ? '#facc15' : '#38bdf8'}; border-radius:20px; padding:24px; text-align:center;">
        <h2 style="margin:0 0 6px; font-size:28px; color:${summary.victory ? '#facc15' : '#38bdf8'};">
          ${summary.victory ? '🏆 VICTOIRE !' : '📘 FIN DE PARTIE'}
        </h2>
        <div style="font-size:14px; color:#cbd5e1; margin-bottom:16px;">
          Score d'objectif : <strong>${summary.objectiveScore}</strong> • Bonnes cibles : <strong>${summary.correctHits}</strong>
        </div>
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:14px;">
          <div style="background:#1e293b; padding:10px; border-radius:12px;">
            <div style="font-size:18px; font-weight:900; color:#facc15;">+${trophiesGain}</div>
            <div style="font-size:11px; color:#94a3b8;">Trophées 🏆</div>
          </div>
          <div style="background:#1e293b; padding:10px; border-radius:12px;">
            <div style="font-size:18px; font-weight:900; color:#fbbf24;">+${coinsGain}</div>
            <div style="font-size:11px; color:#94a3b8;">Pièces 🪙</div>
          </div>
          <div style="background:#1e293b; padding:10px; border-radius:12px;">
            <div style="font-size:18px; font-weight:900; color:#38bdf8;">+${summary.starsEarned}</div>
            <div style="font-size:11px; color:#94a3b8;">Étoiles ⭐</div>
          </div>
        </div>
        ${
          starUpdate.unlockedStarrDrops > 0
            ? `<div style="padding:10px; border-radius:10px; background:rgba(250,204,21,0.18); color:#fef08a; font-weight:800; margin-bottom:14px;">
                🎁 +${starUpdate.unlockedStarrDrops} Casier Mystère débloqué au Lobby !
               </div>`
            : ''
        }
        <button id="btn-back-lobby" style="width:100%; padding:13px; border-radius:12px; border:none; background:#facc15; color:#0f172a; font-weight:900; font-size:16px; cursor:pointer;">
          RETOUR AU LOBBY
        </button>
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
