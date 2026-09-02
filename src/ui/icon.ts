// 浮标:长条状侧标签,贴视口 left:0 bottom:0
// 内容:图标 + M A R K 四个字母垂直堆叠(不占位置)
import { h, on, svgIcon } from './dom';

const ICON_PATH =
  'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z';

export function createIcon(): HTMLElement {
  return h('div', { id: 'bm-icon' }, [
    h('div', { class: 'bm-icon-circle' }, [svgIcon(ICON_PATH)]),
    ...['M', 'A', 'R', 'K'].map((c) => h('span', { class: 'bm-icon-letter' }, c)),
  ]);
}

/** 切换面板展开/收起,返回新状态(true=已开) */
export function togglePanel(root: HTMLElement): boolean {
  const willOpen = !root.classList.contains('bm-open');
  root.classList.toggle('bm-open', willOpen);
  return willOpen;
}

export function bindIcon(root: HTMLElement, icon: HTMLElement): void {
  on(icon, 'click', (e) => {
    e.stopPropagation();
    togglePanel(root);
  });
}
