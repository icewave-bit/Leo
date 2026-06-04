import { atom } from 'jotai';
import type { ViewStudent } from '../utils/schedule';

export const archivedStudentsAtom = atom<ViewStudent[]>([]);
export const archivedStudentsLoadingAtom = atom(false);
