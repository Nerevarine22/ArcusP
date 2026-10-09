"use client";

import { useEffect, useState, type RefObject } from "react";

const storageKey = "arcus-input-guide-complete";
type GuideField = "name" | "points" | null;

function rememberGuide() {
  try { localStorage.setItem(storageKey, "1"); } catch { /* Storage may be disabled. */ }
}

export function useInputGuide(nameRef: RefObject<HTMLInputElement | null>, pointsRef: RefObject<HTMLInputElement | null>) {
  const [guideField, setGuideField] = useState<GuideField>(null);
  const [dismissed, setDismissed] = useState(false);

  function dismissGuide() {
    setGuideField(null);
    setDismissed(true);
    rememberGuide();
  }

  useEffect(() => {
    if (dismissed) return;
    try { if (localStorage.getItem(storageKey)) return; } catch { /* Show once for this page if storage is disabled. */ }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function finish() {
      observer?.disconnect();
      clearTimeout(timer);
      setGuideField(null);
      rememberGuide();
    }

    function highlightWhenVisible(field: "name" | "points", element: HTMLInputElement | null) {
      if (!element) { finish(); return; }
      observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5)) return;
        observer?.disconnect();
        setGuideField(field);
        timer = setTimeout(() => {
          setGuideField(null);
          if (field === "name") highlightWhenVisible("points", pointsRef.current);
          else finish();
        }, 3_000);
      }, { threshold: 0.5 });
      observer.observe(element);
    }

    function motionChanged() { if (reducedMotion.matches) finish(); }
    if (reducedMotion.matches) finish();
    else highlightWhenVisible("name", nameRef.current);
    reducedMotion.addEventListener("change", motionChanged);
    return () => {
      observer?.disconnect();
      clearTimeout(timer);
      reducedMotion.removeEventListener("change", motionChanged);
    };
  }, [dismissed, nameRef, pointsRef]);

  return { guideField, dismissGuide };
}
