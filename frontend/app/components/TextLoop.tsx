"use client";

import { useEffect, useRef, useState } from "react";
import "./TextLoop.css";

interface TextLoopProps {
  items: string[];
  interval?: number; // ms between transitions
  className?: string;
}

export default function TextLoop({
  items,
  interval = 2500,
  className = "",
}: TextLoopProps) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"visible" | "exit" | "enter">("visible");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const cycle = () => {
      // fade out
      setPhase("exit");
      timerRef.current = setTimeout(() => {
        // swap text
        setIndex((i) => (i + 1) % items.length);
        setPhase("enter");
        timerRef.current = setTimeout(() => {
          setPhase("visible");
        }, 50);
      }, 350);
    };

    timerRef.current = setTimeout(cycle, interval);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, interval]);

  return (
    <span
      className={`text-loop ${phase} ${className}`}
      aria-live="polite"
    >
      {items[index]}
    </span>
  );
}
