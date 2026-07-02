"use client";

import { useEffect, useRef, useState } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&";

interface TextScrambleProps {
  text: string;
  /** ms delay before scramble starts */
  delay?: number;
  /** How fast characters resolve (ms per character step) */
  speed?: number;
  className?: string;
}

function randomChar() {
  return CHARS[Math.floor(Math.random() * CHARS.length)];
}

export default function TextScramble({
  text,
  delay = 0,
  speed = 30,
  className = "",
}: TextScrambleProps) {
  const [display, setDisplay] = useState<string>(() => text.replace(/\S/g, randomChar));
  const frameRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolvedRef = useRef(0);
  const startedRef = useRef(false);

  useEffect(() => {
    resolvedRef.current = 0;
    startedRef.current = false;
    setDisplay(text.replace(/\S/g, randomChar));

    const delayTimer = setTimeout(() => {
      startedRef.current = true;
      frameRef.current = setInterval(() => {
        resolvedRef.current += 1;
        const next = text
          .split("")
          .map((ch, i) => {
            if (ch === " ") return " ";
            if (i < resolvedRef.current) return ch;
            return randomChar();
          })
          .join("");
        setDisplay(next);
        if (resolvedRef.current >= text.length) {
          if (frameRef.current) clearInterval(frameRef.current);
          setDisplay(text);
        }
      }, speed);
    }, delay);

    return () => {
      clearTimeout(delayTimer);
      if (frameRef.current) clearInterval(frameRef.current);
    };
  }, [text, delay, speed]);

  return <span className={className}>{display}</span>;
}
