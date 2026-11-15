import {
  getMoodWeatherHistory,
  MOOD_WEATHER_OPTIONS,
  type IMoodWeatherEntry,
  type MoodWeatherId,
} from './CalmCornerModal';

export type WellbeingAlertLevel = 'SERENE' | 'WATCHFUL' | 'SUPPORT_SUGGESTED';

export interface IPreventionTopicStat {
  themeCode: string;
  label: string;
  attempts: number;
}

export interface IParentWellbeingSummary {
  recentMoods: IMoodWeatherEntry[];
  totalCheckins: number;
  heavyMoodCountLast7: number;
  alertLevel: WellbeingAlertLevel;
  dialoguePrompt: string;
  preventionTopicsCovered: IPreventionTopicStat[];
}

const TOPICS_STORAGE_KEY = 'brawl_college_prevention_topics_v1';

const TOPIC_LABELS: Record<string, string> = {
  PREV_HARCELEMENT: 'Harcèlement & Cyberharcèlement',
  PREV_INTIMITE: 'Respect du corps & Limites',
  PREV_ECOUTE: 'Santé mentale & Écoute',
  PREV_NEURO_HANDICAP: 'Inclusion & Neurodiversité',
};

export function recordPreventionTopicEncounter(themeCode: string): void {
  if (typeof localStorage === 'undefined' || !themeCode) return;
  try {
    const raw = localStorage.getItem(TOPICS_STORAGE_KEY);
    const counts = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    counts[themeCode] = (counts[themeCode] ?? 0) + 1;
    localStorage.setItem(TOPICS_STORAGE_KEY, JSON.stringify(counts));
  } catch {
    // Stockage local indisponible
  }
}

export function getPreventionTopicsCovered(): IPreventionTopicStat[] {
  let counts: Record<string, number> = {};
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(TOPICS_STORAGE_KEY);
      if (raw) counts = JSON.parse(raw) as Record<string, number>;
    } catch {
      counts = {};
    }
  }

  return Object.entries(TOPIC_LABELS).map(([themeCode, label]) => ({
    themeCode,
    label,
    attempts: typeof counts[themeCode] === 'number' ? counts[themeCode] : 0,
  }));
}

function isHeavyMood(mood: MoodWeatherId): boolean {
  return mood === 'PLUIE' || mood === 'ORAGE';
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Onglet « Bien-être & Écoute » pour le Dashboard Parent PIN (Agent 19 - M8).
 * Présente l'historique de la météo des émotions et les thèmes de prévention
 * avec des repères d'écoute bienveillants (sans jamais alarmer inutilement).
 */
export class ParentWellbeingAlert {
  public buildSummary(entriesInput?: IMoodWeatherEntry[]): IParentWellbeingSummary {
    const history = entriesInput ?? getMoodWeatherHistory();
    const recentMoods = history.slice(-7).reverse();
    const heavyMoodCountLast7 = recentMoods.filter((m) => isHeavyMood(m.mood)).length;

    let alertLevel: WellbeingAlertLevel = 'SERENE';
    let dialoguePrompt =
      'La météo émotionnelle récente est globalement sereine. Continuez vos petits moments d’échange tranquille le soir.';

    if (heavyMoodCountLast7 >= 3) {
      alertLevel = 'SUPPORT_SUGGESTED';
      dialoguePrompt =
        'Plusieurs météos « Pluie » ou « Orage » ont été enregistrées récemment. Proposez un moment calme sans pression (« Comment s’est passée ta récré ? ») et rappelez les adultes relais (CPE, infirmière, 3018/3114).';
    } else if (heavyMoodCountLast7 >= 1) {
      alertLevel = 'WATCHFUL';
      dialoguePrompt =
        'Une émotion plus sensible a été notée. Demandez avec douceur s’il y a eu un petit tracas au collège aujourd’hui.';
    }

    return {
      recentMoods,
      totalCheckins: history.length,
      heavyMoodCountLast7,
      alertLevel,
      dialoguePrompt,
      preventionTopicsCovered: getPreventionTopicsCovered(),
    };
  }

  public renderWellbeingTabHtml(entriesInput?: IMoodWeatherEntry[]): string {
    const summary = this.buildSummary(entriesInput);
    const badgeColor =
      summary.alertLevel === 'SUPPORT_SUGGESTED'
        ? '#f59e0b'
        : summary.alertLevel === 'WATCHFUL'
          ? '#60a5fa'
          : '#4ade80';
    const badgeLabel =
      summary.alertLevel === 'SUPPORT_SUGGESTED'
        ? 'Écoute attentive conseillée'
        : summary.alertLevel === 'WATCHFUL'
          ? 'Petite attention douce'
          : 'Climat serein';

    const moodsListHtml =
      summary.recentMoods.length === 0
        ? '<div style="font-size:12px;color:#94a3b8;">Aucune météo intérieure enregistrée pour le moment.</div>'
        : summary.recentMoods
            .map((entry) => {
              const meta =
                MOOD_WEATHER_OPTIONS.find((m) => m.id === entry.mood) ??
                MOOD_WEATHER_OPTIONS[1];
              const dateText = entry.timestamp.slice(0, 10);
              return `
                <div style="display:flex;align-items:center;justify-content:space-between;
                            padding:7px 10px;border-radius:10px;background:rgba(30,41,59,0.75);">
                  <span style="font-size:13px;font-weight:800;color:${meta.accentColor};">
                    ${meta.icon} ${escapeHtml(meta.label)}
                  </span>
                  <span style="font-size:11px;color:#94a3b8;">${escapeHtml(dateText)}</span>
                </div>
              `;
            })
            .join('');

    const topicsHtml = summary.preventionTopicsCovered
      .map(
        (t) => `
        <div style="display:flex;justify-content:space-between;padding:6px 10px;border-radius:8px;
                    background:rgba(15,23,42,0.7);font-size:12px;">
          <span>${escapeHtml(t.label)}</span>
          <strong style="color:#93c5fd;">${t.attempts} scénario${t.attempts > 1 ? 's' : ''}</strong>
        </div>
      `
      )
      .join('');

    return `
      <section data-parent-wellbeing-tab="true" style="
        background:rgba(15,23,42,0.92);border:2px solid ${badgeColor};
        border-radius:18px;padding:16px;color:#f8fafc;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
          <div style="font-size:16px;font-weight:900;color:#93c5fd;">💙 Bien-être & Écoute</div>
          <span style="padding:4px 10px;border-radius:999px;background:${badgeColor};color:#0f172a;
                       font-size:11px;font-weight:900;">${badgeLabel}</span>
        </div>

        <p style="font-size:12px;line-height:1.5;color:#e2e8f0;margin:0 0 12px 0;">
          ${escapeHtml(summary.dialoguePrompt)}
        </p>

        <div style="font-size:12px;font-weight:900;color:#fde047;margin-bottom:6px;">
          Historique Météo des Émotions (${summary.totalCheckins} enregistrement${summary.totalCheckins > 1 ? 's' : ''})
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">
          ${moodsListHtml}
        </div>

        <div style="font-size:12px;font-weight:900;color:#4ade80;margin-bottom:6px;">
          Thèmes de Prévention & Inclusion abordés
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${topicsHtml}
        </div>
      </section>
    `;
  }
}
