"use client";

import { useState } from "react";

export default function NumberTransition({ value, animate }: { value: string; animate: boolean }) {
  const [display, setDisplay] = useState<{ value: string; previous: string | null }>({ value, previous: null });
  // Retain the outgoing text for the crossfade without delaying the new value.
  if (display.value !== value) setDisplay({ value, previous: animate ? display.value : null });

  if (!animate || display.previous === null) return <span>{value}</span>;
  return <span className="number-transition">
    <span key={`out-${display.value}`} className="number-outgoing" aria-hidden="true">{display.previous}</span>
    <span key={display.value} className="number-incoming">{display.value}</span>
  </span>;
}
