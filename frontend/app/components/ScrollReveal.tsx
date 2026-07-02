"use client";

import { useEffect, useRef, useMemo } from "react";
import "./ScrollReveal.css";

interface ScrollRevealProps {
  children: string;
  className?: string;
  baseOpacity?: number;
  enableBlur?: boolean;
  blurStrength?: number;
  staggerMs?: number;
  threshold?: number;
}

export default function ScrollReveal({
  children,
  className = "",
  baseOpacity = 0,
  enableBlur = true,
  blurStrength = 6,
  staggerMs = 40,
  threshold = 0.1,
}: ScrollRevealProps) {
  const containerRef = useRef<HTMLParagraphElement>(null);

  // Split into words, preserving whitespace
  const words = useMemo(() => {
    return children.split(/(\s+)/).filter((w) => w.length > 0);
  }, [children]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const spans = el.querySelectorAll<HTMLSpanElement>(".sr-word");

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          spans.forEach((span) => span.classList.add("sr-word--visible"));
          observer.unobserve(el);
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <p ref={containerRef} className={`scroll-reveal-p ${className}`}>
      {words.map((word, i) => {
        if (/^\s+$/.test(word)) return " ";
        return (
          <span
            key={i}
            className="sr-word"
            style={{
              opacity: baseOpacity,
              filter: enableBlur ? `blur(${blurStrength}px)` : "none",
              transitionDelay: `${i * staggerMs}ms`,
            }}
          >
            {word}
          </span>
        );
      })}
    </p>
  );
}
