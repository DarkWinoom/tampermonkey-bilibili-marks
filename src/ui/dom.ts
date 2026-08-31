// DOM 工具:createElement 包装 + 事件 + 沙箱 document
// 关键:沙箱模式下 document 是 Proxy,appendChild 不可见,必须走 unsafeWindow.document
export type Attrs = Record<string, string | number | boolean | null | undefined>;
export type Children = (Node | string | null | undefined | false)[];

export function getDoc(): Document {
  return typeof unsafeWindow !== 'undefined' ? unsafeWindow.document : document;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs,
  children?: Children | string,
): HTMLElementTagNameMap[K] {
  const el = getDoc().createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class' || k === 'className') el.className = String(v);
      else if (k === 'style' && typeof v === 'string') el.setAttribute('style', v);
      else if (k.startsWith('on') && typeof v === 'string') continue; // 不挂字符串函数
      else if (k === 'html') el.innerHTML = String(v);
      else el.setAttribute(k, String(v));
    }
  }
  if (children !== undefined) {
    if (typeof children === 'string') el.textContent = children;
    else {
      const doc = getDoc();
      for (const c of children) {
        if (c === null || c === undefined || c === false) continue;
        el.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
      }
    }
  }
  return el;
}

export function svgIcon(d: string, viewBox = '0 0 24 24'): SVGSVGElement {
  const doc = getDoc();
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('xmlns', ns);
  const path = doc.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  return svg;
}

export function showToast(root: HTMLElement, message: string, durationMs = 2000): void {
  const toast = root.querySelector<HTMLElement>('#bm-toast');
  if (!toast) return;
  toast.textContent = message;
  root.classList.add('bm-toast');
  setTimeout(() => root.classList.remove('bm-toast'), durationMs);
}

export function on<K extends keyof HTMLElementEventMap>(
  el: HTMLElement | Window | Document,
  event: K,
  handler: (e: HTMLElementEventMap[K]) => void,
): () => void {
  el.addEventListener(event, handler as EventListener);
  return () => el.removeEventListener(event, handler as EventListener);
}
