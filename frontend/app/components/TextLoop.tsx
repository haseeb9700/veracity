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

  useEffect(() => {
    // Use local vars — NOT timerRef — so cleanup can clear all three
    // without any of them racing against an index-triggered re-run
    let cycleTimer: ReturnType<typeof setInterval>;
    let swapTimer: ReturnType<typeof setTimeout>;
    let restoreTimer: ReturnType<typeof setTimeout>;

    cycleTimer = setInterval(() => {
      // 1. fade out
      setPhase("exit");

      // 2. swap word + set to enter position
      swapTimer = setTimeout(() => {
        setIndex((i) => (i + 1) % items.length);
        setPhase("enter");

        // 3. one frame later → fade in
        restoreTimer = setTimeout(() => {
          setPhase("visible");
        }, 60);
      }, 380);
    }, interval);

    return () => {
      clearInterval(cycleTimer);
      clearTimeout(swapTimer);
      clearTimeout(restoreTimer);
    };
  }, [interval, items.length]); // index intentionally NOT in deps

  return (
    <span
      className={`text-loop ${phase} ${className}`}
      aria-live="polite"
    >
      {items[index]}
    </span>
  );
}
