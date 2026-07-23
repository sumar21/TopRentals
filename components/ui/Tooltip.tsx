import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type TipState = { text: string; x: number; y: number; placement: 'top' | 'bottom' } | null;
const OPEN_DELAY = 100; // ms
const PAD = 8;          // padding de borde del viewport

// Mueve un `title` nativo a `data-tooltip` y lo saca para que el browser nunca muestre el suyo.
const convert = (el: Element) => {
  const title = el.getAttribute('title');
  if (title == null) return;
  if (!el.getAttribute('data-tooltip')) el.setAttribute('data-tooltip', title);
  if (!el.getAttribute('aria-label') && !(el.textContent || '').trim()) el.setAttribute('aria-label', title);
  el.removeAttribute('title');
};

export const TooltipHost: React.FC = () => {
  const [tip, setTip] = useState<TipState>(null);
  const timer = useRef<number | null>(null);
  const activeEl = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  // 1) Sacar todo `title` nativo (presente + futuro) vía MutationObserver.
  useEffect(() => {
    const sweep = (root: ParentNode) => {
      if (root instanceof Element && root.hasAttribute('title')) convert(root);
      (root as Element).querySelectorAll?.('[title]').forEach(convert);
    };
    sweep(document.body);
    const observer = new MutationObserver(muts => {
      for (const mu of muts) {
        if (mu.type === 'attributes' && mu.target instanceof Element) convert(mu.target);
        else if (mu.type === 'childList') mu.addedNodes.forEach(n => { if (n instanceof Element) sweep(n); });
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
    return () => observer.disconnect();
  }, []);

  // 2) Hover / focus → mostrar el pill.
  useEffect(() => {
    const clearTimer = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };
    const hide = () => { clearTimer(); activeEl.current = null; setTip(null); };
    const resolve = (target: HTMLElement | null) => {
      const el = target?.closest('[data-tooltip]') as HTMLElement | null;
      const text = el?.getAttribute('data-tooltip');
      return el && text ? { el, text } : null;
    };
    const show = (el: HTMLElement, text: string) => {
      activeEl.current = el; clearTimer();
      timer.current = window.setTimeout(() => {
        if (activeEl.current !== el || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        const above = r.top > 44;
        setTip({ text, x: r.left + r.width / 2, y: above ? r.top - PAD : r.bottom + PAD, placement: above ? 'top' : 'bottom' });
      }, OPEN_DELAY);
    };
    const onOver = (e: MouseEvent) => {
      const hit = resolve(e.target as HTMLElement | null);
      if (!hit) { if (activeEl.current) hide(); return; }
      if (hit.el === activeEl.current) return;
      show(hit.el, hit.text);
    };
    const onFocusIn = (e: FocusEvent) => {
      const hit = resolve(e.target as HTMLElement | null);
      if (hit) show(hit.el, hit.text); else if (activeEl.current) hide();
    };
    document.addEventListener('mouseover', onOver);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', hide);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('wheel', hide, { passive: true });
    window.addEventListener('blur', hide);
    document.addEventListener('keydown', hide, true);
    return () => {
      clearTimer();
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', hide);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('wheel', hide);
      window.removeEventListener('blur', hide);
      document.removeEventListener('keydown', hide, true);
    };
  }, []);

  // Clampear el pill dentro del viewport (antes del paint).
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!el || !tip) return;
    const base = tip.placement === 'top' ? 'translate(-50%, -100%)' : 'translateX(-50%)';
    el.style.transform = base;
    const r = el.getBoundingClientRect();
    let dx = 0, dy = 0;
    if (r.left < PAD) dx = PAD - r.left;
    else if (r.right > window.innerWidth - PAD) dx = (window.innerWidth - PAD) - r.right;
    if (r.top < PAD) dy = PAD - r.top;
    else if (r.bottom > window.innerHeight - PAD) dy = (window.innerHeight - PAD) - r.bottom;
    if (dx || dy) el.style.transform = `${base} translate(${dx}px, ${dy}px)`;
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div ref={tipRef} role="tooltip"
      className="kaut-tooltip pointer-events-none fixed z-[100000] max-w-xs rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium leading-snug text-white shadow-lg"
      style={{ left: tip.x, top: tip.y, transform: tip.placement === 'top' ? 'translate(-50%, -100%)' : 'translateX(-50%)' }}>
      {tip.text}
    </div>, document.body);
};
