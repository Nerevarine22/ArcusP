"use client";

import { useEffect } from "react";
import Lenis from "lenis";

export default function SmoothScroll() {
  useEffect(() => {
    const scroll = new Lenis({
      autoRaf: true,
      lerp: 0.12,
      smoothWheel: true,
      syncTouch: false,
      anchors: true,
      respectReducedMotion: true,
      stopInertiaOnNavigate: true,
    });
    return () => scroll.destroy();
  }, []);

  return null;
}
