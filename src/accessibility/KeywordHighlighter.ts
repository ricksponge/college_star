export type SemanticTokenKind = 'NORMAL' | 'NUMBER' | 'NEGATION' | 'VERB_OR_BLANK';

export interface IKeywordToken {
  text: string;
  kind: SemanticTokenKind;
}

export interface IHighlightedPromptResult {
  tokens: IKeywordToken[];
  html: string;
  plainText: string;
  counts: {
    numbers: number;
    negations: number;
    verbsOrBlanks: number;
  };
}

const NEGATION_WORDS = new Set<string>([
  'ne',
  'n',
  'pas',
  'jamais',
  'plus',
  'aucun',
  'aucune',
  'sans',
  'ni',
  'faux',
  'fausse',
  'intrus',
  'impossible',
  'sauf',
  'contraire',
  'erreur',
  'not',
  'never',
]);

const VERB_AND_AGREEMENT_WORDS = new Set<string>([
  'accorde',
  'accorder',
  'conjugue',
  'conjuguer',
  'participe',
  'infinitif',
  'verbe',
  'sujet',
  'pluriel',
  'singulier',
  'feminin',
  'féminin',
  'masculin',
  'sont',
  'est',
  'ont',
  'etait',
  'était',
  'etaient',
  'étaient',
  'etre',
  'être',
  'avoir',
  'fait',
  'font',
  'va',
  'vont',
  'peut',
  'peuvent',
  'doit',
  'doivent',
  'fini',
  'finir',
  'manger',
  'mangé',
  'joue',
  'jouent',
  'joué',
  'jouer',
]);

const TOKEN_COLORS: Record<Exclude<SemanticTokenKind, 'NORMAL'>, { color: string; bg: string }> = {
  NEGATION: { color: '#ff4d6d', bg: 'rgba(255, 77, 109, 0.18)' },
  NUMBER: { color: '#facc15', bg: 'rgba(250, 204, 21, 0.16)' },
  VERB_OR_BLANK: { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.16)' },
};

const COMBINED_SEGMENT_REGEX =
  /(_{2,}|\.{3,}|«[^»]+»|"[^"]+"|[0-9]+(?:[.,/][0-9]+)?(?:\s?(?:%|€|km|cm²|m²|cm|mm|kg|g|ml|cl|l|h|min|s|°c))?|[×÷+=]|[\p{L}']+|\s+|[^\s\p{L}0-9]+)/giu;

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function classifySegment(segment: string): SemanticTokenKind {
  if (!segment || /^\s+$/.test(segment)) {
    return 'NORMAL';
  }

  if (/^(_{2,}|\.{3,}|«[^»]+»|"[^"]+")$/.test(segment)) {
    return 'VERB_OR_BLANK';
  }

  if (/^([0-9]|×|÷|\+|=)/.test(segment)) {
    return 'NUMBER';
  }

  const normalized = segment.toLowerCase();
  const baseWord = normalized.includes("'") ? normalized.split("'")[0] : normalized;

  if (NEGATION_WORDS.has(baseWord) || NEGATION_WORDS.has(normalized)) {
    return 'NEGATION';
  }

  if (
    VERB_AND_AGREEMENT_WORDS.has(normalized) ||
    /[\p{L}]{2,}(?:aient|eront|erez|ions|iez)$/u.test(normalized)
  ) {
    return 'VERB_OR_BLANK';
  }

  return 'NORMAL';
}

/**
 * Surligneur sémantique des consignes scolaires (Agent 16 - Neuro-Ergonomie).
 * Met en évidence sans effort de lecture les mots de négation (« NE... PAS »),
 * les nombres/opérations et les verbes à accorder ou zones à compléter.
 */
export class KeywordHighlighter {
  public analyze(prompt: string): IHighlightedPromptResult {
    const safePrompt = prompt ?? '';
    const matches = safePrompt.match(COMBINED_SEGMENT_REGEX) ?? (safePrompt ? [safePrompt] : []);

    const tokens: IKeywordToken[] = [];
    let numbers = 0;
    let negations = 0;
    let verbsOrBlanks = 0;

    const htmlParts: string[] = [];

    for (const part of matches) {
      // Gestion spéciale des formes élidées type "n'est" / "n'a"
      if (/^[nN]['’][\p{L}]+$/u.test(part)) {
        const prefix = part.slice(0, 2);
        const rest = part.slice(2);
        tokens.push({ text: prefix, kind: 'NEGATION' });
        negations += 1;
        htmlParts.push(this.renderSpan(prefix, 'NEGATION'));

        const restKind = classifySegment(rest);
        tokens.push({ text: rest, kind: restKind });
        if (restKind === 'VERB_OR_BLANK') verbsOrBlanks += 1;
        htmlParts.push(restKind === 'NORMAL' ? escapeHtml(rest) : this.renderSpan(rest, restKind));
        continue;
      }

      const kind = classifySegment(part);
      tokens.push({ text: part, kind });

      if (kind === 'NUMBER') numbers += 1;
      else if (kind === 'NEGATION') negations += 1;
      else if (kind === 'VERB_OR_BLANK') verbsOrBlanks += 1;

      htmlParts.push(kind === 'NORMAL' ? escapeHtml(part) : this.renderSpan(part, kind));
    }

    return {
      tokens,
      html: htmlParts.join(''),
      plainText: safePrompt,
      counts: {
        numbers,
        negations,
        verbsOrBlanks,
      },
    };
  }

  public formatToHtml(prompt: string): string {
    return this.analyze(prompt).html;
  }

  public renderIntoElement(element: HTMLElement, prompt: string): IHighlightedPromptResult {
    const result = this.analyze(prompt);
    element.innerHTML = result.html;
    return result;
  }

  private renderSpan(text: string, kind: Exclude<SemanticTokenKind, 'NORMAL'>): string {
    const palette = TOKEN_COLORS[kind];
    const underline = kind === 'NEGATION' ? 'text-decoration:underline;text-underline-offset:3px;' : '';
    return `<span class="bc-kw bc-kw-${kind.toLowerCase()}" style="color:${palette.color};background:${palette.bg};padding:1px 5px;border-radius:6px;font-weight:900;${underline}">${escapeHtml(text)}</span>`;
  }
}

export function highlightQuestionPrompt(prompt: string): IHighlightedPromptResult {
  return new KeywordHighlighter().analyze(prompt);
}
