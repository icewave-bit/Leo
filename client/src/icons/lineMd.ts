import { addCollection } from '@iconify/react';
import lineMd from './lineMdSubset.json';

/** Semantic names → line-md icon ids used in this app. */
export const LINE_MD_ICONS = {
  calendar: 'calendar',
  account: 'account',
  accountAdd: 'account-add',
  alert: 'alert',
  alertCircle: 'alert-circle',
  arrowsHorizontal: 'arrows-horizontal',
  clipboard: 'clipboard',
  clipboardList: 'clipboard-list',
  cog: 'cog',
  confirm: 'confirm',
  documentReport: 'document-report',
  folder: 'folder',
  grid3: 'grid-3',
  lightDark: 'light-dark',
  lightbulb: 'lightbulb',
  list3: 'list-3',
  menu: 'menu',
  moon: 'moon',
  paintDrop: 'paint-drop',
  play: 'play',
  sunny: 'sunny',
  textBox: 'text-box',
  watch: 'watch',
} as const;

export type LineMdIconName = (typeof LINE_MD_ICONS)[keyof typeof LINE_MD_ICONS];

let registered = false;

export function registerLineMdIcons() {
  if (registered) return;
  registered = true;
  addCollection(lineMd);
}

export function lineMdIcon(name: LineMdIconName): string {
  return `line-md:${name}`;
}
