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

    const renderPinPrompt = (errorMsg = ''): void => {
      modal.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <h2 style="margin:0; font-size:20px; color:#38bdf8;">🔒 Carnet Parent — Accès Protégé</h2>
          <button id="pd-close-btn" style="background:#334155; color:#fff; border:none; border-radius:8px; padding:6px 12px; cursor:pointer; font-weight:700;">Fermer</button>
        </div>
        <p style="color:#cbd5e1; font-size:14px; margin-bottom:14px;">
          Saisissez le code PIN parent à 4 chiffres pour consulter les statistiques pédagogiques (code par défaut : <strong>0000</strong>).
        </p>
        <div style="display:flex; gap:10px; align-items:center; max-width:340px;">
          <input id="pd-pin-input" type="password" inputmode="numeric" maxlength="4" placeholder="••••"
                 style="flex:1; padding:10px 14px; border-radius:10px; border:2px solid #475569; background:#1e293b; color:#fff; font-size:20px; letter-spacing:8px; text-align:center;" />
          <button id="pd-unlock-btn" style="padding:11px 18px; border-radius:10px; border:none; background:#38bdf8; color:#0f172a; font-weight:900; cursor:pointer;">Déverrouiller</button>
        </div>
        ${errorMsg ? `<div style="margin-top:10px; color:#f87171; font-weight:700; font-size:13px;">${errorMsg}</div>` : ''}
      `;

      modal.querySelector('#pd-close-btn')?.addEventListener('click', () => {
        overlay.remove();
        onClose?.();
      });

      const input = modal.querySelector<HTMLInputElement>('#pd-pin-input');
      const tryUnlock = (): void => {
        const value = input?.value ?? '';
        if (this.db.verifyParentPin(value)) {
          renderAnalytics();
        } else {
          renderPinPrompt('Code PIN incorrect (défaut : 0000).');
        }
      };

      modal.querySelector('#pd-unlock-btn')?.addEventListener('click', tryUnlock);
      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') tryUnlock();
      });
      input?.focus();
    };

    const renderAnalytics = (): void => {
      const summaries = this.db.computeParentSubjectSummaries();
      const top5 = this.db.getTopSkillsToConsolidate(5);
      const logs = this.db.getTelemetryLogs(8);
      const profile = this.db.getPlayerProfile();
      const questProgress = this.db.getAllQuestProgress();

      modal.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:16px;">
          <div>
            <h2 style="margin:0; font-size:22px; color:#38bdf8;">📊 Carnet Parent — Suivi 6ème de ${profile.nickname}</h2>
            <div style="font-size:12px; color:#94a3b8;">Données 100% locales hors-ligne • Trophées : ${profile.trophies}/1000 • Savoir : ${this.db.getKnowledgePoints()} pts</div>
          </div>
          <div style="display:flex; gap:8px;">
            <button id="pd-export-sql" style="background:#1e293b; color:#facc15; border:1px solid #facc15; border-radius:8px; padding:7px 12px; cursor:pointer; font-weight:700; font-size:12px;">Exporter SQLite</button>
            <button id="pd-close-btn" style="background:#334155; color:#fff; border:none; border-radius:8px; padding:7px 14px; cursor:pointer; font-weight:700;">Fermer</button>
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

        ${this.buildCampusExplorationSectionHtml(questProgress)}

        <div style="background:#1e293b; border-radius:14px; padding:14px; border:1px solid #334155;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
            <h3 style="margin:0; font-size:14px; color:#e2e8f0;">Télémétrie Récente (${logs.length} derniers tirs)</h3>
            <div style="display:flex; gap:6px; align-items:center;">
              <input id="pd-new-pin" type="password" maxlength="4" placeholder="Nouveau PIN" style="width:105px; padding:5px 8px; border-radius:6px; border:1px solid #475569; background:#0f172a; color:#fff; font-size:12px;" />
              <button id="pd-save-pin" style="padding:5px 10px; border-radius:6px; border:none; background:#475569; color:#fff; font-size:12px; cursor:pointer;">Changer PIN</button>
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
                      <span>${l.is_hit_correct ? '✅' : '❌'} ${l.question_id} (${l.brawler_used})</span>
                      <span style="color:#94a3b8;">${(l.reaction_time_ms / 1000).toFixed(2)}s</span>
                    </div>`
                    )
                    .join('')}
                </div>`
          }
        </div>
        <pre id="pd-sql-preview" style="display:none; margin-top:12px; max-height:160px; overflow:auto; background:#020617; padding:10px; border-radius:8px; font-size:11px; color:#86efac;"></pre>
      `;

      modal.querySelector('#pd-close-btn')?.addEventListener('click', () => {
        overlay.remove();
        onClose?.();
      });

      modal.querySelector('#pd-export-sql')?.addEventListener('click', () => {
        const pre = modal.querySelector<HTMLPreElement>('#pd-sql-preview');
        if (pre) {
          pre.style.display = pre.style.display === 'none' ? 'block' : 'none';
          pre.textContent = this.db.exportSqlDump();
        }
      });

      modal.querySelector('#pd-save-pin')?.addEventListener('click', () => {
        const pinInput = modal.querySelector<HTMLInputElement>('#pd-new-pin');
        const val = pinInput?.value ?? '';
        if (/^\d{4}$/.test(val)) {
          this.db.updateParentPin(val);
          if (pinInput) pinInput.value = '';
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
