export interface IEmergencyHelpline {
  number: '3018' | '119' | '3114';
  title: string;
  purpose: string;
  availability: string;
  confidentialityNote: string;
  accentColor: string;
  icon: string;
}

export interface ICollegeTrustedAdult {
  role: string;
  whereToFind: string;
  howTheyHelp: string;
  icon: string;
}

export const OFFICIAL_EMERGENCY_HELPLINES: readonly IEmergencyHelpline[] = [
  {
    number: '3018',
    title: 'Stop Harcèlement & Cyberharcèlement',
    purpose:
      'Pour signaler des moqueries répétées, des rumeurs ou des messages blessants en ligne et faire supprimer des contenus.',
    availability: 'Gratuit • 7j/7 (9h-23h) • Téléphone & Appli 3018',
    confidentialityNote: 'Anonyme et bienveillant — ouvert aux élèves, témoins et parents.',
    accentColor: '#38bdf8',
    icon: '🛡️',
  },
  {
    number: '119',
    title: 'Allô Enfance en Danger',
    purpose:
      'En cas de violence, d’agression, de peur ou de situation grave à l’école comme à la maison.',
    availability: 'Gratuit • 24h/24 et 7j/7',
    confidentialityNote: 'N’apparaît sur aucune facture téléphonique.',
    accentColor: '#60a5fa',
    icon: '💙',
  },
  {
    number: '3114',
    title: 'Écoute Détresse & Soutien Psychologique',
    purpose:
      'Quand la tristesse ou l’angoisse devient trop lourde à porter seul, ou pour aider un ami qui va très mal.',
    availability: 'Gratuit • 24h/24 et 7j/7',
    confidentialityNote: 'Des professionnels bienveillants répondent à tout âge sans jugement.',
    accentColor: '#4ade80',
    icon: '🌱',
  },
];

export const COLLEGE_TRUSTED_ADULTS: readonly ICollegeTrustedAdult[] = [
  {
    role: 'CPE (Conseiller Principal d’Éducation)',
    whereToFind: 'Bureau de la Vie Scolaire',
    howTheyHelp: 'Protège les élèves, stoppe les conflits et intervient discrètement face au harcèlement.',
    icon: '🏫',
  },
  {
    role: 'Infirmière scolaire',
    whereToFind: 'Infirmerie du collège',
    howTheyHelp: 'Écoute confidentielle, soins physiques, pause au calme en cas de stress ou de mal-être.',
    icon: '🩺',
  },
  {
    role: 'Psy EN (Psychologue de l’Éducation Nationale)',
    whereToFind: 'Permanence au collège / CIO',
    howTheyHelp: 'Accompagne les émotions difficiles, la confiance en soi et l’adaptation en 6ème.',
    icon: '💬',
  },
  {
    role: 'Professeur Principal',
    whereToFind: 'En classe ou sur rendez-vous',
    howTheyHelp: 'Relais de proximité pour alerter vite et aménager le quotidien de la classe.',
    icon: '📘',
  },
];

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Carte Interactive des Numéros d'Urgence (3018, 119, 3114) et Adultes Relais (Agent 19 - M8).
 */
export class EmergencyHelpCard {
  public getHelplines(): readonly IEmergencyHelpline[] {
    return OFFICIAL_EMERGENCY_HELPLINES;
  }

  public getTrustedAdults(): readonly ICollegeTrustedAdult[] {
    return COLLEGE_TRUSTED_ADULTS;
  }

  public renderCardHtml(selectedNumber?: IEmergencyHelpline['number']): string {
    const helplinesHtml = OFFICIAL_EMERGENCY_HELPLINES.map((line) => {
      const isSelected = selectedNumber === line.number;
      return `
        <div data-helpline-card="${line.number}" style="
          padding:12px 14px;border-radius:16px;
          background:${isSelected ? 'rgba(30,58,138,0.88)' : 'rgba(15,23,42,0.88)'};
          border:2px solid ${line.accentColor};display:flex;flex-direction:column;gap:6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <div style="font-size:16px;font-weight:900;color:${line.accentColor};">
              ${line.icon} ${line.number} — ${escapeHtml(line.title)}
            </div>
            <button type="button" data-select-helpline="${line.number}" style="
              padding:5px 10px;border:none;border-radius:999px;cursor:pointer;
              background:${line.accentColor};color:#0f172a;font-weight:900;font-size:11px;">
              Voir infos
            </button>
          </div>
          <div style="font-size:12px;color:#e2e8f0;line-height:1.45;">${escapeHtml(line.purpose)}</div>
          <div style="font-size:11px;color:#93c5fd;font-weight:700;">${escapeHtml(line.availability)}</div>
          <div style="font-size:11px;color:#cbd5e1;">🔒 ${escapeHtml(line.confidentialityNote)}</div>
        </div>
      `;
    }).join('');

    const adultsHtml = COLLEGE_TRUSTED_ADULTS.map(
      (adult) => `
      <div style="padding:10px;border-radius:12px;background:rgba(30,41,59,0.75);
                  border:1px solid rgba(148,163,184,0.28);">
        <div style="font-size:13px;font-weight:900;color:#f8fafc;">${adult.icon} ${escapeHtml(adult.role)}</div>
        <div style="font-size:11px;color:#93c5fd;margin:2px 0;">📍 ${escapeHtml(adult.whereToFind)}</div>
        <div style="font-size:11px;color:#cbd5e1;">${escapeHtml(adult.howTheyHelp)}</div>
      </div>
    `
    ).join('');

    return `
      <section style="background:linear-gradient(160deg,#0f172a,#1e293b);
                      border:2px solid rgba(96,165,250,0.5);border-radius:20px;
                      padding:16px;color:#f8fafc;">
        <div style="font-size:17px;font-weight:900;color:#93c5fd;margin-bottom:4px;">
          📞 Tu n’es jamais seul : Adultes Relais & Numéros Gratuits
        </div>
        <div style="font-size:12px;color:#cbd5e1;margin-bottom:12px;">
          Demander de l’aide est toujours une preuve de courage. Ces numéros sont gratuits et confidentiels.
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px;">
          ${helplinesHtml}
        </div>
        <div style="font-size:13px;font-weight:900;color:#fde047;margin-bottom:8px;">
          🏫 Au collège, tu peux te confier à :
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;">
          ${adultsHtml}
        </div>
      </section>
    `;
  }

  public mountInteractiveCard(
    container: HTMLElement,
    onSelectHelpline?: (helpline: IEmergencyHelpline) => void
  ): void {
    let selected: IEmergencyHelpline['number'] | undefined;
    const render = (): void => {
      container.innerHTML = this.renderCardHtml(selected);
      container.querySelectorAll<HTMLButtonElement>('[data-select-helpline]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const num = btn.dataset.selectHelpline as IEmergencyHelpline['number'];
          const found = OFFICIAL_EMERGENCY_HELPLINES.find((h) => h.number === num);
          selected = num;
          render();
          if (found) {
            onSelectHelpline?.(found);
          }
        });
      });
    };
    render();
  }
}
