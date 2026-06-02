import { atom } from 'jotai';
import type { Tutor } from '../api/types';

export const tutorAtom = atom<Tutor | null>(null);
export const authLoadingAtom = atom(true);
