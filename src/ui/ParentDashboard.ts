import type { IParentSubjectSummary, ISkillMastery, SubjectCategory } from '../types/cctp';
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
};

function formatSkillName(code: string): string {
  return SKILL_LABELS[code] ?? code;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
      const top5 = this.db.getTopSkillsToConsolidate(5);
      const logs = this.db.getTelemetryLogs(8);
      const profile = this.db.getPlayerProfile();

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
              .map(
                (s) => `
                <div style="background:#0f172a; border-radius:10px; padding:10px; border:1px solid #334155;">
                  <div style="font-weight:800; font-size:13px; color:#38bdf8;">${SUBJECT_LABELS[s.subject]}</div>
                  <div style="font-size:22px; font-weight:900; color:${s.success_rate_pct >= 70 ? '#4ade80' : '#fb923c'}; margin:4px 0;">${s.success_rate_pct}%</div>
                  <div style="font-size:11px; color:#cbd5e1;">Réaction moy. : ${(s.avg_reaction_time_ms / 1000).toFixed(2)}s</div>
                  <div style="font-size:11px; color:#94a3b8; margin-top:4px;">À consolider : ${s.skills_to_consolidate.length > 0 ? s.skills_to_consolidate.map(formatSkillName).join(', ') : 'Aucune lacune'}</div>
                </div>
              `
              )
              .join('')}
          </div>
        </div>

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

  private buildSkillRowHtml(skill: ISkillMastery, rank: number): string {
    const rate =
      skill.attempts_count > 0
        ? Math.round((skill.success_count / skill.attempts_count) * 100)
        : 0;
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; background:#0f172a; padding:8px 10px; border-radius:8px; border-left:3px solid #fb923c;">
        <div>
          <div style="font-size:13px; font-weight:700; color:#f8fafc;">#${rank} ${formatSkillName(skill.skill_code)}</div>
          <div style="font-size:11px; color:#94a3b8;">${SUBJECT_LABELS[skill.subject_category]} • Elo ${skill.elo_rating}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:13px; font-weight:800; color:${rate >= 70 ? '#4ade80' : '#fb923c'};">${skill.attempts_count > 0 ? `${rate}%` : 'À tester'}</div>
          <div style="font-size:11px; color:#94a3b8;">${(skill.avg_response_ms / 1000).toFixed(1)}s moy.</div>
        </div>
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
