"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// Main tabs in nav order; swiping left goes to the next tab, right to the previous.
const TAB_ORDER = ["/", "/wedstrijden", "/statistieken", "/instellingen"];

const MIN_DISTANCE = 70; // px
const MAX_DURATION = 600; // ms

function startsInsideHorizontalScroller(target: EventTarget | null): boolean {
  let el = target instanceof HTMLElement ? target : null;
  while (el && el !== document.body) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      return true; // don't fight text selection / native controls
    }
    if (el.scrollWidth > el.clientWidth + 8) {
      const overflowX = getComputedStyle(el).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") return true;
    }
    el = el.parentElement;
  }
  return false;
}

export function SwipeNav() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Only on the top-level tab pages, so detail pages never jump unexpectedly.
    const currentIndex = TAB_ORDER.indexOf(pathname);
    if (currentIndex === -1) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let tracking = false;

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1 || startsInsideHorizontalScroller(e.target)) {
        tracking = false;
        return;
      }
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
      tracking = true;
    }

    function onTouchEnd(e: TouchEvent) {
      if (!tracking) return;
      tracking = false;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Date.now() - startTime > MAX_DURATION) return;
      if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dy) > Math.abs(dx) * 0.6) return;

      const nextIndex = dx < 0 ? currentIndex + 1 : currentIndex - 1;
      if (nextIndex < 0 || nextIndex >= TAB_ORDER.length) return;
      router.push(TAB_ORDER[nextIndex]);
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [pathname, router]);

  return null;
}
