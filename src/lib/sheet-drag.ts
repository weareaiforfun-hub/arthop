import { useRef } from "react";

export type SheetSize = "peek" | "half" | "full";
const ORDER: SheetSize[] = ["peek", "half", "full"];

/**
 * Lets a phone sheet follow your finger: drag its grip and the sheet grows or shrinks with you, then settles on the
 * nearest of three heights (small, half, full). A quick tap, or Enter on the keyboard, steps to the next height.
 * With `canClose`, dragging well below the small height closes it (onSize(null)).
 */
export function useSheetDrag(opts: {
  sheet: () => HTMLElement | null;
  heights: () => Record<SheetSize, number>;
  size: SheetSize;
  onSize: (s: SheetSize | null) => void;
  canClose?: boolean;
}) {
  const o = useRef(opts);
  o.current = opts;
  const drag = useRef<{ y: number; h: number; moved: boolean } | null>(null);
  const next = () => ORDER[(ORDER.indexOf(o.current.size) + 1) % ORDER.length];

  /** Hand the height back to CSS once React has applied the new size, so the sheet glides there from your finger. */
  const settle = (el: HTMLElement, size: SheetSize | null) => {
    el.style.transition = "";
    o.current.onSize(size);
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.height = ""; }));
  };

  return {
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      const el = o.current.sheet();
      if (!el) return;
      drag.current = { y: e.clientY, h: el.getBoundingClientRect().height, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      const d = drag.current, el = o.current.sheet();
      if (!d || !el) return;
      const dy = d.y - e.clientY;
      if (!d.moved && Math.abs(dy) < 6) return;
      d.moved = true;
      const hs = o.current.heights(), low = o.current.canClose ? hs.peek * 0.4 : hs.peek;
      el.style.transition = "none";
      el.style.height = Math.max(low, Math.min(hs.full, d.h + dy)) + "px";
    },
    onPointerUp(e: React.PointerEvent<HTMLElement>) {
      const d = drag.current, el = o.current.sheet();
      drag.current = null;
      if (!d || !el) return;
      if (!d.moved) { settle(el, next()); return; }
      const h = el.getBoundingClientRect().height, hs = o.current.heights(), dy = d.y - e.clientY;
      if (o.current.canClose && h < hs.peek - 50) { settle(el, null); return; }
      let best = ORDER.reduce((a, b) => (Math.abs(hs[b] - h) < Math.abs(hs[a] - h) ? b : a));
      // A clear swipe always moves at least one step that way, even if it ended nearer the old height.
      const i = ORDER.indexOf(o.current.size);
      if (best === o.current.size && Math.abs(dy) > 40) best = ORDER[Math.max(0, Math.min(2, i + (dy > 0 ? 1 : -1)))];
      settle(el, best);
    },
    onPointerCancel() {
      const el = o.current.sheet();
      drag.current = null;
      if (el) { el.style.transition = ""; el.style.height = ""; }
    },
    onClick(e: React.MouseEvent<HTMLElement>) {
      if (e.detail === 0) o.current.onSize(next()); // keyboard (Enter or Space); pointer taps are handled above
    },
  };
}
