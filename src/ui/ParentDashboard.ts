import type {
  IParentSubjectSummary,
  IQuestProgressRecord,
  ISkillMastery,
  SubjectCategory,
} from '../types/cctp';
import type { LocalSQLiteDB } from '../db/LocalSQLiteDB';

const SUBJECT_LABELS: Record<SubjectCategory, string> = {
  mathematiques: 'Maths',
  francais: 'Français',
  anglais: 'Anglais',
  histoire_geo_sciences: 'Hist-Géo / Sci.',
  vie_au_college: 'Vie au Collège',
};

const SKILL_LABELS: Record<string, string> = {
  MATH_MUL: 'Tables de multiplication',
  MATH_DIV: 'Divisions euclidiennes',
  MATH_FRAC: 'Fractions décimales',
  MATH_CONV: "Conversions d'unités",
  MATH_GEOM: 'Périmètres et aires',
  MATH_PRIO: 'Priorités opératoires',
  FR_HOMO: 'Homophones grammaticaux',
  FR_ACC: 'Accords Sujet-Verbe',
  FR_TERM: 'Terminaisons verbales',
  FR_NAT: 'Nature des mots',
  FR_PREF: 'Préfixes & suffixes',
  ANG_VOC: 'Vocabulaire du quotidien',
  ANG_PRON: 'Pronoms personnels',
  ANG_AUX: 'Auxiliaires Be & Have',
  ANG_INT: 'Mots interrogatifs',
  ANG_NUM: 'Nombres jusqu’à 100',
  HG_PER: 'Grandes périodes historiques',
  HG_GEO: 'Repères géographiques',
  SCI_SOL: 'Système solaire',
  SCI_MAT: 'États de la matière',
  SCI_VIV: 'Chaîne alimentaire',
  COL_EDT: "Lecture d'emploi du temps",
  COL_ADU: 'Rôle des adultes (CPE, CDI)',
  COL_CONS: 'Consignes doubles',
  COL_SAC: 'Préparation du cartable',
  COL_STRESS: 'Gestion du stress & confiance',
  COL_CPS: 'Coopération, respect & amitié',
  COL_LIEUX: 'Repères & lieux du collège',
};

const PARENT_COACHING_TIPS: Record<string, string> = {
  MATH_MUL:
    'Lancez un mini-défi de 2 minutes en voiture ou en cuisinant (« 7 × 8 ? »), toujours dans le jeu et sans chrono stressant.',
  MATH_DIV:
    'Partagez concrètement à la maison (part de gâteau, bonbons ou cartes à distribuer équitablement) pour ancrer le sens du partage.',
  MATH_FRAC:
    'Faites le lien avec la cuisine et la monnaie : 1/2 L, 1/4 d’heure, 0,50 €… Les fractions deviennent vite intuitives.',
  MATH_CONV:
    'Comparez les étiquettes des courses (500 g vs 1 kg, 1,5 L vs 150 cL) pour rendre les conversions concrètes.',
  MATH_GEOM:
    'Mesurez ensemble la table ou sa chambre en pas ou au mètre ruban pour distinguer le tour (périmètre) et la surface (aire).',
  MATH_PRIO:
    'Rappelez la règle d’or comme un jeu de piste : d’abord les parenthèses, puis × et ÷, et enfin + et −.',
  FR_HOMO:
    'Astuce ludique à tester à l’oral : remplacer « a » par « avait » ou « son » par « ses/était » devient vite un réflexe.',
  FR_ACC:
    'Demandez-lui « Qui est-ce qui fait l’action ? » avant d’accorder le verbe, même quand le sujet est caché ou loin.',
  FR_TERM:
    'Le truc du verbe « vendre / vendu » : si on peut dire « vendre », c’est -ER ; si on dit « vendu », c’est -É !',
  FR_NAT:
    'Jouez à trier les mots d’une phrase affichée (étiquette Nom, Verbe, Adjectif) comme des cartes de jeu.',
  FR_PREF:
    'Amusez-vous à démonter un mot en famille (« re-commenc-er », « in-croy-able ») pour deviner le sens de mots nouveaux.',
  ANG_VOC:
    'Glissez 3 petits mots du quotidien en anglais le matin (backpack, notebook, ready?) sur un ton complice.',
  ANG_PRON:
    'Mimez ensemble les pronoms (I, you, he, she, we, they) devant un miroir ou en désignant la famille.',
  ANG_AUX:
    'Associez « Be » à ce qu’on est/ressent et « Have » à ce qu’on possède dans de toutes petites phrases rigolotes.',
  ANG_INT:
    'Associez chaque mot en WH- à un geste simple (Where = chercher du regard, When = regarder sa montre, Who = montrer quelqu’un).',
  ANG_NUM:
    'Faites lire les numéros de portes, plaques ou prix jusqu’à 100 en anglais lors des trajets.',
  HG_PER:
    'Placez 3 repères visuels simples ensemble (Lascaux, Jules César, châteaux forts, Révolution…) comme une mini-frise sur le frigo.',
  HG_GEO:
    'Regardez 2 minutes un planisphère ou la météo du soir pour situer continents, océans et grandes villes de France.',
  SCI_SOL:
    'Observez la Lune ou cherchez une planète le soir et nommez ensemble l’ordre des planètes comme une comptine.',
  SCI_MAT:
    'En cuisinant (glaçon, eau, vapeur d’eau), observez les changements d’état : les sciences deviennent concrètes !',
  SCI_VIV:
    'En balade, imaginez « qui nourrit qui » dans la nature pour comprendre les équilibres des écosystèmes.',
  COL_EDT:
    'En fin d’été, lisez ensemble un faux emploi du temps (Semaine A/B) pendant 3 minutes : cela rassure énormément avant le jour J.',
  COL_ADU:
    'Rappelez-lui qu’au collège il y a toujours un adulte ressource (CPE, prof principal, documentaliste, infirmière) prêt à aider.',
  COL_CONS:
    'Invitez votre enfant à reformuler une consigne en deux petites étapes (« 1 : je souligne, 2 : je réponds »).',
  COL_SAC:
    'Instaurez le rituel tranquille du « cartable prêt la veille à 19h » pour garder des matins sereins sans précipitation.',
  COL_STRESS:
    'Normalisez le trac de la rentrée et testez ensemble la respiration calme (3s inspirer, 3s expirer) avant un moment impressionnant.',
  COL_CPS:
    'Parlez ensemble de comment demander de l’aide ou poser ses limites calmement ; savoir qu’il peut compter sur les adultes protège.',
  COL_LIEUX:
    'Repérez sur le plan du collège les « îlots de repère » (cour, Vie Scolaire, CDI, cantine, infirmerie) : la peur de se perdre disparaît vite.',
};

function formatSkillName(code: string): string {
  return SKILL_LABELS[code] ?? code;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatQuestIdentifier(questId: string): string {
  return questId
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

type AutonomyLandmarkStatus = 'ACQUIS' | 'EN_COURS' | 'A_DECOUVRIR';

interface IAutonomyLandmarkItem {
  label: string;
  detail: string;
  status: AutonomyLandmarkStatus;
}
/**
 * Dashboard Parent ("Carnet Parent") verrouillé par code PIN à 4 chiffres (défaut '0000').
 * Affiche le radar des 5 matières, les taux de réussite, le temps de réaction moyen
 * et le Top 5 des notions à consolider (US-04).
 */
export class ParentDashboard {
  private readonly db: LocalSQLiteDB;

  constructor(db: LocalSQLiteDB) {
    this.db = db;
  }

  public open(onClose?: () => void): void {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed; inset:0; background:rgba(2,6,23,0.92); display:flex; align-items:center; justify-content:center; z-index:9999; font-family:system-ui,sans-serif; padding:16px;';

    const modal = document.createElement('div');
    modal.style.cssText =
      'width:min(880px, 96vw); max-height:92vh; overflow-y:auto; background:#0f172a; border:2px solid #38bdf8; border-radius:18px; padding:22px; color:#f8fafc; box-shadow:0 24px 60px rgba(0,0,0,0.7);';
    overlay.appendChild(modal);

    let activeKeyHandler: ((e: KeyboardEvent) => void) | null = null;

    const cleanupPinListeners = (): void => {
      if (activeKeyHandler) {
        document.removeEventListener('keydown', activeKeyHandler);
        activeKeyHandler = null;
      }
    };

    const closeDashboard = (): void => {
      cleanupPinListeners();
      overlay.remove();
      onClose?.();
    };

    const renderPinPrompt = (errorMsg = ''): void => {
      cleanupPinListeners();
      let pinValue = '';

      const keypadButtons = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'];

      modal.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <h2 style="margin:0; font-size:20px; color:#38bdf8;">🔒 Carnet Parent — Accès Protégé</h2>
          <button id="pd-close-btn" type="button" style="background:#334155; color:#fff; border:none; border-radius:8px; padding:6px 12px; cursor:pointer; font-weight:700;">Fermer</button>
        </div>
        <p style="color:#cbd5e1; font-size:14px; margin:0 0 16px; text-align:center;">
          Saisissez le code PIN parent à 4 chiffres (défaut : <strong>0000</strong>).
        </p>

        <div style="max-width:290px; margin:0 auto; display:flex; flex-direction:column; align-items:center; gap:14px;">
          <div id="pd-pin-dots" aria-live="polite" style="display:flex; justify-content:center; gap:16px; padding:10px 20px; border-radius:14px; background:#1e293b; border:2px solid #334155;">
            <span data-pin-dot="0" style="font-size:24px; line-height:1; color:#475569;">○</span>
            <span data-pin-dot="1" style="font-size:24px; line-height:1; color:#475569;">○</span>
            <span data-pin-dot="2" style="font-size:24px; line-height:1; color:#475569;">○</span>
            <span data-pin-dot="3" style="font-size:24px; line-height:1; color:#475569;">○</span>
          </div>

          <div id="pd-pin-keypad" style="width:100%; display:grid; grid-template-columns:repeat(3, 1fr); gap:10px;">
            ${keypadButtons
              .map((key) => {
                const isOk = key === 'OK';
                const isBack = key === '⌫';
                const bg = isOk ? '#38bdf8' : isBack ? '#334155' : '#1e293b';
                const fg = isOk ? '#0f172a' : '#f8fafc';
                const border = isOk ? '#38bdf8' : '#475569';
                return `
                  <button type="button" data-pin-key="${key}" style="min-height:50px; border-radius:12px; border:1px solid ${border};
                          background:${bg}; color:${fg}; font-size:18px; font-weight:900; cursor:pointer; touch-action:manipulation;">
                    ${key}
                  </button>
                `;
              })
              .join('')}
          </div>

          <div id="pd-pin-error" style="min-height:20px; color:#f87171; font-weight:700; font-size:13px; text-align:center;">
            ${escapeHtml(errorMsg)}
          </div>
        </div>
      `;

      const dots = Array.from(modal.querySelectorAll<HTMLElement>('#pd-pin-dots [data-pin-dot]'));
      const errorBox = modal.querySelector<HTMLElement>('#pd-pin-error');

      const updateDots = (): void => {
        dots.forEach((dot, idx) => {
          const filled = idx < pinValue.length;
          dot.textContent = filled ? '●' : '○';
          dot.style.color = filled ? '#38bdf8' : '#475569';
        });
      };

      const appendDigit = (digit: string): void => {
        if (pinValue.length >= 4) return;
        pinValue += digit;
        if (errorBox) errorBox.textContent = '';
        updateDots();
      };

      const removeDigit = (): void => {
        if (pinValue.length === 0) return;
        pinValue = pinValue.slice(0, -1);
        if (errorBox) errorBox.textContent = '';
        updateDots();
      };

      const tryUnlock = (): void => {
        if (this.db.verifyParentPin(pinValue)) {
          cleanupPinListeners();
          renderAnalytics();
        } else {
          pinValue = '';
          updateDots();
          if (errorBox) {
            errorBox.textContent = 'Code PIN incorrect (défaut : 0000).';
          }
        }
      };

      modal.querySelector('#pd-close-btn')?.addEventListener('click', closeDashboard);

      modal.querySelectorAll<HTMLButtonElement>('[data-pin-key]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.pinKey;
          btn.blur();
          if (!key) return;
          if (key === '⌫') {
            removeDigit();
          } else if (key === 'OK') {
            tryUnlock();
          } else if (/^\d$/.test(key)) {
            appendDigit(key);
          }
        });
      });

      activeKeyHandler = (e: KeyboardEvent): void => {
        if (/^\d$/.test(e.key)) {
          e.preventDefault();
          appendDigit(e.key);
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          removeDigit();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          tryUnlock();
        }
      };
      document.addEventListener('keydown', activeKeyHandler);
    };

    const renderAnalytics = (): void => {
      cleanupPinListeners();
      const summaries = this.db.computeParentSubjectSummaries();
      const serenity = this.db.computeParentSerenityReport();
      const top5 = this.db.getTopSkillsToConsolidate(5);
      const logs = this.db.getTelemetryLogs(8);
      const profile = this.db.getPlayerProfile();
      const questProgress = this.db.getAllQuestProgress();

      const serenityColor =
        serenity.serenity_score_pct >= 75
          ? '#4ade80'
          : serenity.serenity_score_pct >= 50
            ? '#38bdf8'
            : '#facc15';

      modal.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
          <div>
            <h2 id="pd-header-title" style="margin:0; font-size:22px; color:#38bdf8;">📊 Carnet Parent — Suivi 6ème de ${escapeHtml(profile.nickname)}</h2>
            <div style="font-size:12px; color:#94a3b8;">Données 100% locales hors-ligne • Trophées : ${profile.trophies}/1000 • Savoir : ${this.db.getKnowledgePoints()} pts</div>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            <button id="pd-export-sql" type="button" style="background:#1e293b; color:#facc15; border:1px solid #facc15; border-radius:8px; padding:7px 12px; cursor:pointer; font-weight:700; font-size:12px;">Exporter SQLite</button>
            <button id="pd-download-sql" type="button" style="background:#1e293b; color:#4ade80; border:1px solid #4ade80; border-radius:8px; padding:7px 12px; cursor:pointer; font-weight:700; font-size:12px;">⬇ Télécharger .sql</button>
            <button id="pd-close-btn" type="button" style="background:#334155; color:#fff; border:none; border-radius:8px; padding:7px 14px; cursor:pointer; font-weight:700;">Fermer</button>
          </div>
        </div>

        <div style="background:#1e293b; border-radius:12px; padding:10px 14px; border:1px solid #334155; margin-bottom:16px; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px;">
          <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px;">
            <label for="pd-nickname-input" style="font-size:12px; font-weight:700; color:#cbd5e1;">Prénom / Pseudo de l'élève :</label>
            <input id="pd-nickname-input" type="text" maxlength="24"
                   style="padding:6px 10px; border-radius:8px; border:1px solid #475569; background:#0f172a; color:#f8fafc; font-size:13px; width:165px;" />
            <button id="pd-save-nickname" type="button"
                    style="padding:6px 12px; border-radius:8px; border:none; background:#38bdf8; color:#0f172a; font-size:12px; font-weight:800; cursor:pointer;">
              Enregistrer
            </button>
            <span id="pd-nickname-feedback" style="display:none; font-size:11px; font-weight:800; padding:3px 8px; border-radius:999px;"></span>
          </div>
        </div>

        <div style="background:linear-gradient(135deg, rgba(30,58,138,0.45), rgba(15,23,42,0.95)); border-radius:14px; padding:14px 16px; border:1px solid #38bdf8; margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
            <div>
              <h3 style="margin:0; font-size:15px; color:#7dd3fc;">🌱 Baromètre Sérénité & Adaptation 6ème</h3>
              <div style="font-size:11px; color:#cbd5e1; margin-top:2px;">Indicateur bienveillant d’aisance cognitive, d’autonomie collège et de confiance</div>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:11px; font-weight:800; color:#0f172a; background:${serenityColor}; padding:4px 10px; border-radius:999px;">${escapeHtml(serenity.status_label)}</span>
              <span style="font-size:22px; font-weight:900; color:${serenityColor};">${serenity.serenity_score_pct}%</span>
            </div>
          </div>
          <div style="width:100%; height:8px; background:#0f172a; border-radius:999px; overflow:hidden; margin-bottom:12px; border:1px solid #334155;">
            <div style="width:${serenity.serenity_score_pct}%; height:100%; background:linear-gradient(90deg, #38bdf8, ${serenityColor});"></div>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:10px;">
            <div style="background:rgba(15,23,42,0.85); border-radius:10px; padding:8px 10px; border:1px solid #334155;">
              <div style="font-size:11px; color:#94a3b8;">🧭 Autonomie Collège</div>
              <div style="font-size:17px; font-weight:900; color:#38bdf8;">${serenity.campus_autonomy_pct}%</div>
              <div style="font-size:10px; color:#cbd5e1;">Repères, salles, vie scolaire & entraide</div>
            </div>
            <div style="background:rgba(15,23,42,0.85); border-radius:10px; padding:8px 10px; border:1px solid #334155;">
              <div style="font-size:11px; color:#94a3b8;">🧠 Calme Exécutif</div>
              <div style="font-size:17px; font-weight:900; color:#4ade80;">${serenity.executive_calm_pct}%</div>
              <div style="font-size:10px; color:#cbd5e1;">Prend le temps de lire avant d’agir</div>
            </div>
            <div style="background:rgba(15,23,42,0.85); border-radius:10px; padding:8px 10px; border:1px solid #334155;">
              <div style="font-size:11px; color:#94a3b8;">🗺️ Notions explorées</div>
              <div style="font-size:17px; font-weight:900; color:#facc15;">${serenity.explored_skills_count} / ${serenity.total_skills_count}</div>
              <div style="font-size:10px; color:#cbd5e1;">Compétences découvertes en jouant</div>
            </div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin-bottom:16px;">
          <div style="background:#1e293b; border-radius:14px; padding:14px; border:1px solid #334155;">
            <h3 style="margin:0 0 10px; font-size:15px; color:#facc15;">Radar par Matière (Taux de réussite)</h3>
            ${this.buildRadarSvg(summaries)}
          </div>

          <div style="background:#1e293b; border-radius:14px; padding:14px; border:1px solid #334155;">
            <h3 style="margin:0 0 10px; font-size:15px; color:#facc15;">Top 5 des Compétences à Retravailler</h3>
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${top5.map((s, idx) => this.buildSkillRowHtml(s, idx + 1)).join('')}
            </div>
          </div>
        </div>

        <div style="background:#1e293b; border-radius:14px; padding:14px; border:1px solid #334155; margin-bottom:16px;">
          <h3 style="margin:0 0 10px; font-size:15px; color:#facc15;">Détail par Pilier du Bulletin Officiel</h3>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px;">
            ${summaries
              .map((s) => {
                const hasAttempts = (s.attempts_count ?? 0) > 0;
                const valueColor = !hasAttempts
                  ? '#38bdf8'
                  : s.success_rate_pct >= 70
                    ? '#4ade80'
                    : '#fb923c';
                const valueLabel = hasAttempts ? `${s.success_rate_pct}%` : 'À découvrir';
                const reactionLine = hasAttempts
                  ? `Réaction moy. : ${(s.avg_reaction_time_ms / 1000).toFixed(2)}s`
                  : 'Première mission à lancer';
                return `
                <div style="background:#0f172a; border-radius:10px; padding:10px; border:1px solid #334155;">
                  <div style="font-weight:800; font-size:13px; color:#38bdf8;">${SUBJECT_LABELS[s.subject]}</div>
                  <div style="font-size:${hasAttempts ? '22px' : '17px'}; font-weight:900; color:${valueColor}; margin:4px 0;">${valueLabel}</div>
                  <div style="font-size:11px; color:#cbd5e1;">${reactionLine}</div>
                  <div style="font-size:11px; color:#94a3b8; margin-top:4px;">À consolider : ${s.skills_to_consolidate.length > 0 ? s.skills_to_consolidate.map(formatSkillName).join(', ') : 'Aucune lacune'}</div>
                </div>
              `;
              })
              .join('')}
          </div>
        </div>

        ${this.buildCampusExplorationSectionHtml(questProgress)}

        <div style="background:#1e293b; border-radius:14px; padding:14px; border:1px solid #334155;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
            <h3 style="margin:0; font-size:14px; color:#e2e8f0;">Télémétrie Récente (${logs.length} derniers tirs)</h3>
            <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
              <input id="pd-new-pin" type="password" inputmode="numeric" maxlength="4" placeholder="Nouveau PIN" style="width:105px; padding:5px 8px; border-radius:6px; border:1px solid #475569; background:#0f172a; color:#fff; font-size:12px;" />
              <button id="pd-save-pin" type="button" style="padding:5px 10px; border-radius:6px; border:none; background:#475569; color:#fff; font-size:12px; cursor:pointer; font-weight:700;">Changer PIN</button>
              <span id="pd-pin-feedback" style="display:none; font-size:11px; font-weight:800; padding:3px 8px; border-radius:999px;"></span>
            </div>
          </div>
          ${
            logs.length === 0
              ? '<div style="font-size:12px; color:#94a3b8;">Aucune partie enregistrée pour le moment. Lancez une partie pour voir les statistiques en direct !</div>'
              : `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:6px; font-size:12px;">
                  ${logs
                    .map(
                      (l) => `
                    <div style="background:#0f172a; padding:6px 10px; border-radius:8px; display:flex; justify-content:space-between;">
                      <span>${l.is_hit_correct ? '✅' : '❌'} ${escapeHtml(l.question_id)} (${escapeHtml(l.brawler_used)})</span>
                      <span style="color:#94a3b8;">${(l.reaction_time_ms / 1000).toFixed(2)}s</span>
                    </div>`
                    )
                    .join('')}
                </div>`
          }
        </div>
        <pre id="pd-sql-preview" style="display:none; margin-top:12px; max-height:160px; overflow:auto; background:#020617; padding:10px; border-radius:8px; font-size:11px; color:#86efac;"></pre>
      `;

      const nicknameInput = modal.querySelector<HTMLInputElement>('#pd-nickname-input');
      if (nicknameInput) {
        nicknameInput.value = profile.nickname;
      }

      const showBadge = (el: HTMLElement | null, text: string, ok: boolean): void => {
        if (!el) return;
        el.style.display = 'inline-block';
        el.textContent = text;
        el.style.background = ok ? 'rgba(34, 197, 94, 0.18)' : 'rgba(248, 113, 113, 0.18)';
        el.style.border = ok ? '1px solid #4ade80' : '1px solid #f87171';
        el.style.color = ok ? '#4ade80' : '#f87171';
      };

      const saveNickname = (): void => {
        const rawName = nicknameInput?.value.trim() ?? '';
        const feedback = modal.querySelector<HTMLElement>('#pd-nickname-feedback');
        if (!rawName) {
          showBadge(feedback, 'Prénom requis', false);
          return;
        }
        const updated = this.db.updatePlayerProfile({ nickname: rawName });
        const headerTitle = modal.querySelector<HTMLElement>('#pd-header-title');
        if (headerTitle) {
          headerTitle.textContent = `📊 Carnet Parent — Suivi 6ème de ${updated.nickname}`;
        }
        if (nicknameInput) {
          nicknameInput.value = updated.nickname;
        }
        showBadge(feedback, '✔ Prénom mis à jour !', true);
      };

      modal.querySelector('#pd-save-nickname')?.addEventListener('click', saveNickname);
      nicknameInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveNickname();
        }
      });

      modal.querySelector('#pd-close-btn')?.addEventListener('click', closeDashboard);

      modal.querySelector('#pd-export-sql')?.addEventListener('click', () => {
        const pre = modal.querySelector<HTMLPreElement>('#pd-sql-preview');
        if (pre) {
          pre.style.display = pre.style.display === 'none' ? 'block' : 'none';
          pre.textContent = this.db.exportSqlDump();
        }
      });

      modal.querySelector('#pd-download-sql')?.addEventListener('click', () => {
        const sqlDump = this.db.exportSqlDump();
        const blob = new Blob([sqlDump], { type: 'application/sql;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'brawl_college_suivi.sql';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      });

      modal.querySelector('#pd-save-pin')?.addEventListener('click', () => {
        const pinInput = modal.querySelector<HTMLInputElement>('#pd-new-pin');
        const pinFeedback = modal.querySelector<HTMLElement>('#pd-pin-feedback');
        const val = pinInput?.value.trim() ?? '';
        if (/^\d{4}$/.test(val)) {
          this.db.updateParentPin(val);
          if (pinInput) pinInput.value = '';
          showBadge(pinFeedback, '✔ Code PIN mis à jour !', true);
        } else {
          showBadge(pinFeedback, '4 chiffres requis', false);
        }
      });
    };

    renderPinPrompt();
    document.body.appendChild(overlay);
  }

  private buildCampusExplorationSectionHtml(questProgress: IQuestProgressRecord[]): string {
    const accomplished = questProgress.filter(
      (q) => q.status === 'CLAIMED' || q.status === 'COMPLETED'
    );
    const claimedCount = questProgress.filter((q) => q.status === 'CLAIMED').length;
    const completedPendingCount = questProgress.filter((q) => q.status === 'COMPLETED').length;
    const activeQuests = questProgress.filter((q) => q.status === 'ACTIVE');
    const availableCount = questProgress.filter((q) => q.status === 'AVAILABLE').length;
    const landmarks = this.evaluateAutonomyLandmarks(questProgress);

    const activeListHtml =
      activeQuests.length === 0
        ? `<div style="font-size:12px; color:#94a3b8;">
             ${
               questProgress.length === 0
                 ? "Aucune quête démarrée pour le moment. L'exploration du collège enrichira cet indicateur."
                 : `Aucune quête suivie activement (${availableCount} quête(s) disponible(s)).`
             }
           </div>`
        : `<div style="display:flex; flex-direction:column; gap:6px;">
             ${activeQuests
               .map(
                 (q) => `
               <div style="background:#0f172a; border:1px solid #334155; border-left:3px solid #facc15; border-radius:8px; padding:7px 10px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                 <div>
                   <div style="font-size:12px; font-weight:800; color:#f8fafc;">📍 ${escapeHtml(formatQuestIdentifier(q.quest_id))}</div>
                   <div style="font-size:11px; color:#94a3b8;">ID : ${escapeHtml(q.quest_id)}</div>
                 </div>
                 <span style="font-size:11px; font-weight:800; color:#facc15; white-space:nowrap;">
                   Étape ${q.current_objective_index + 1} (${q.current_count})
                 </span>
               </div>
             `
               )
               .join('')}
           </div>`;

    const landmarksHtml = landmarks
      .map((item) => {
        const badge =
          item.status === 'ACQUIS'
            ? { icon: '✅', text: 'Acquis', color: '#4ade80', border: '#22c55e' }
            : item.status === 'EN_COURS'
              ? { icon: '⏳', text: 'En cours', color: '#facc15', border: '#eab308' }
              : { icon: '⬜', text: 'À découvrir', color: '#94a3b8', border: '#334155' };

        return `
          <div style="background:#0f172a; border:1px solid ${badge.border}; border-radius:10px; padding:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
              <strong style="font-size:12px; color:#f8fafc;">${escapeHtml(item.label)}</strong>
              <span style="font-size:11px; font-weight:800; color:${badge.color}; white-space:nowrap;">${badge.icon} ${badge.text}</span>
            </div>
            <div style="font-size:11px; color:#94a3b8; margin-top:4px;">${escapeHtml(item.detail)}</div>
          </div>
        `;
      })
      .join('');

    return `
      <div style="background:#1e293b; border-radius:14px; padding:14px; border:1px solid #334155; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          <h3 style="margin:0; font-size:15px; color:#facc15;">🏫 Progression Exploration & Quêtes du Collège</h3>
          <span style="font-size:12px; color:#cbd5e1; font-weight:700;">
            ${accomplished.length} accomplie(s) • ${activeQuests.length} en cours
          </span>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; margin-bottom:12px;">
          <div style="background:#0f172a; border-radius:10px; padding:12px; border:1px solid #334155;">
            <div style="font-size:12px; color:#94a3b8; font-weight:700;">Quêtes accomplies</div>
            <div style="font-size:26px; font-weight:900; color:#4ade80; margin:4px 0;">
              ${accomplished.length}${questProgress.length > 0 ? ` <span style="font-size:14px; color:#94a3b8; font-weight:700;">/ ${questProgress.length}</span>` : ''}
            </div>
            <div style="font-size:11px; color:#cbd5e1;">
              ${claimedCount} réclamée(s) • ${completedPendingCount} à récupérer
            </div>
          </div>

          <div style="background:#0f172a; border-radius:10px; padding:12px; border:1px solid #334155;">
            <div style="font-size:12px; color:#94a3b8; font-weight:700; margin-bottom:6px;">Quêtes en cours</div>
            ${activeListHtml}
          </div>
        </div>

        <div style="font-size:12px; font-weight:800; color:#38bdf8; margin-bottom:8px;">
          Repères d'autonomie acquis au collège
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:8px;">
          ${landmarksHtml}
        </div>
      </div>
    `;
  }

  private evaluateAutonomyLandmarks(
    questProgress: IQuestProgressRecord[]
  ): IAutonomyLandmarkItem[] {
    const accomplished = questProgress.filter(
      (q) => q.status === 'CLAIMED' || q.status === 'COMPLETED'
    );
    const active = questProgress.filter((q) => q.status === 'ACTIVE');
    const unlockedRewards = this.db.getUnlockedRewards().map((r) => r.toUpperCase());
    const edtMastery = this.db.getSkillMastery('COL_EDT');
    const aduMastery = this.db.getSkillMastery('COL_ADU');
    const accomplishedCount = accomplished.length;

    const hasQuestMatch = (list: IQuestProgressRecord[], tokens: string[]): boolean =>
      list.some((q) => {
        const upperId = q.quest_id.toUpperCase();
        return tokens.some((token) => upperId.includes(token));
      });

    const hasRewardMatch = (tokens: string[]): boolean =>
      unlockedRewards.some((reward) => tokens.some((token) => reward.includes(token)));

    const definitions: Array<{
      label: string;
      detail: string;
      questTokens: string[];
      rewardTokens: string[];
      mastery?: ISkillMastery;
      minMasterySuccess: number;
      minAccomplishedQuests: number;
    }> = [
      {
        label: 'Salle 204',
        detail: 'Repérage étage 2 / porte 04',
        questTokens: ['204', 'SALLE_204', 'DEFIS_204', 'ETAGE'],
        rewardTokens: ['204'],
        mastery: edtMastery,
        minMasterySuccess: 2,
        minAccomplishedQuests: 4,
      },
      {
        label: 'CDI',
        detail: 'Recherche & documentaliste',
        questTokens: ['CDI', 'BIBLIO', 'DOC'],
        rewardTokens: ['CDI'],
        mastery: aduMastery,
        minMasterySuccess: 2,
        minAccomplishedQuests: 2,
      },
      {
        label: 'Vie Scolaire',
        detail: 'Rôle du CPE & vie du collège',
        questTokens: ['VIE', 'CPE', 'SCOLAIRE', 'RENTREE', 'Q01'],
        rewardTokens: ['CPE', 'VIE SCOLAIRE'],
        mastery: aduMastery,
        minMasterySuccess: 1,
        minAccomplishedQuests: 1,
      },
      {
        label: 'Emploi du temps',
        detail: 'Semaine A/B & changement de salle',
        questTokens: ['EDT', 'EMPLOI', 'HORAIRE', 'PLANNING'],
        rewardTokens: ['EDT', 'EMPLOI'],
        mastery: edtMastery,
        minMasterySuccess: 1,
        minAccomplishedQuests: 3,
      },
    ];

    return definitions.map((def) => {
      const isAcquired =
        hasQuestMatch(accomplished, def.questTokens) ||
        hasRewardMatch(def.rewardTokens) ||
        (def.mastery !== undefined && def.mastery.success_count >= def.minMasterySuccess) ||
        accomplishedCount >= def.minAccomplishedQuests;

      const isInProgress =
        hasQuestMatch(active, def.questTokens) ||
        (def.mastery !== undefined && def.mastery.attempts_count >= 1);

      const status: AutonomyLandmarkStatus = isAcquired
        ? 'ACQUIS'
        : isInProgress
          ? 'EN_COURS'
          : 'A_DECOUVRIR';

      return {
        label: def.label,
        detail: def.detail,
        status,
      };
    });
  }

  private buildSkillRowHtml(skill: ISkillMastery, rank: number): string {
    const rate =
      skill.attempts_count > 0
        ? Math.round((skill.success_count / skill.attempts_count) * 100)
        : 0;
    const tip = PARENT_COACHING_TIPS[skill.skill_code];
    const tipHtml = tip
      ? `<div style="margin-top:6px; padding-top:6px; border-top:1px dashed #334155; font-size:11px; color:#cbd5e1; line-height:1.35;">💡 <strong style="color:#7dd3fc;">Astuce parent :</strong> ${escapeHtml(tip)}</div>`
      : '';
    return `
      <div style="background:#0f172a; padding:8px 10px; border-radius:8px; border-left:3px solid #fb923c;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <div>
            <div style="font-size:13px; font-weight:700; color:#f8fafc;">#${rank} ${formatSkillName(skill.skill_code)}</div>
            <div style="font-size:11px; color:#94a3b8;">${SUBJECT_LABELS[skill.subject_category]} • Elo ${skill.elo_rating}</div>
          </div>
          <div style="text-align:right; flex-shrink:0;">
            <div style="font-size:13px; font-weight:800; color:${rate >= 70 ? '#4ade80' : '#fb923c'};">${skill.attempts_count > 0 ? `${rate}%` : 'À tester'}</div>
            <div style="font-size:11px; color:#94a3b8;">${(skill.avg_response_ms / 1000).toFixed(1)}s moy.</div>
          </div>
        </div>
        ${tipHtml}
      </div>
    `;
  }

  private buildRadarSvg(summaries: IParentSubjectSummary[]): string {
    const cx = 135;
    const cy = 115;
    const maxR = 78;
    const n = summaries.length;

    const pointAt = (idx: number, ratio: number): { x: number; y: number } => {
      const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / n;
      return {
        x: cx + Math.cos(angle) * maxR * ratio,
        y: cy + Math.sin(angle) * maxR * ratio,
      };
    };

    const gridRings = [0.25, 0.5, 0.75, 1].map((r) => {
      const pts = summaries.map((_, i) => {
        const p = pointAt(i, r);
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      });
      return `<polygon points="${pts.join(' ')}" fill="none" stroke="#334155" stroke-width="1" />`;
    });

    const axes = summaries.map((s, i) => {
      const outer = pointAt(i, 1);
      const labelPos = pointAt(i, 1.24);
      return `
        <line x1="${cx}" y1="${cy}" x2="${outer.x.toFixed(1)}" y2="${outer.y.toFixed(1)}" stroke="#475569" stroke-width="1" />
        <text x="${labelPos.x.toFixed(1)}" y="${labelPos.y.toFixed(1)}" fill="#cbd5e1" font-size="10" font-weight="700" text-anchor="middle" dominant-baseline="middle">${SUBJECT_LABELS[s.subject]}</text>
      `;
    });

    const dataPts = summaries.map((s, i) => {
      const ratio = Math.max(0.12, s.success_rate_pct / 100);
      const p = pointAt(i, ratio);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    });

    return `
      <svg viewBox="0 0 270 230" style="width:100%; max-height:220px; display:block; margin:auto;">
        ${gridRings.join('')}
        ${axes.join('')}
        <polygon points="${dataPts.join(' ')}" fill="rgba(56,189,248,0.32)" stroke="#38bdf8" stroke-width="2.5" />
      </svg>
    `;
  }
}
