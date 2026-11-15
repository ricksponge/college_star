export {
  SpeechReader,
  type ISpeechReaderOptions,
  type ISpeechReaderState,
} from './SpeechReader';

export {
  KeywordHighlighter,
  highlightQuestionPrompt,
  type IHighlightedPromptResult,
  type IKeywordToken,
  type SemanticTokenKind,
} from './KeywordHighlighter';

export {
  ANTI_TILT_ERROR_THRESHOLD,
  AntiTiltGuard,
  type IAntiTiltSnapshot,
  type IConfidenceQuestionPick,
} from './AntiTiltGuard';
