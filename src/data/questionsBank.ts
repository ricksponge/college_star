import type { IQuestion } from '../types/cctp';
import rawQuestions from './questions_200.json';

/**
 * Corpus initial des 200 premières questions (40 par pilier du Bulletin Officiel CM2 -> 6ème).
 */
export const INITIAL_QUESTIONS_200: IQuestion[] = rawQuestions as IQuestion[];
