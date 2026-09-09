"use client";

import * as React from "react";
import { motion } from "framer-motion";

const RAYS = 28;
const DOTS_PER_RAY = 6;
const CENTER = 140;
const START_RADIUS = 18;
const RADIUS_STEP = 15;

function buildDots() {
  const dots: { x: number; y: number; size: number; delay: number; opacity: number }[] = [];
  for (let r = 0; r < RAYS; r++) {
    const angle = (r / RAYS) * Math.PI * 2;
    for (let d = 0; d < DOTS_PER_RAY; d++) {
      const radius = START_RADIUS + d * RADIUS_STEP;
      const x = CENTER + Math.cos(angle) * radius;
      const y = CENTER + Math.sin(angle) * radius;
      const size = 5.5 - d * 0.55;
      const opacity = 1 - d * 0.14;
      dots.push({ x, y, size, delay: (r % 7) * 0.08 + d * 0.03, opacity });
    }
  }
  return dots;
}

const DOTS = buildDots();

export function Starburst({ className }: { className?: string }) {
  return (
    <motion.svg
      viewBox="0 0 280 280"
      className={className}
      animate={{ rotate: 360 }}
      transition={{ duration: 90, repeat: Infinity, ease: "linear" }}
    >
      {DOTS.map((dot, i) => (
        <motion.circle
          key={i}
          cx={dot.x}
          cy={dot.y}
          r={dot.size}
          fill="white"
          initial={{ opacity: dot.opacity * 0.35 }}
          animate={{ opacity: [dot.opacity * 0.35, dot.opacity, dot.opacity * 0.35] }}
          transition={{
            duration: 3.2,
            repeat: Infinity,
            delay: dot.delay,
            ease: "easeInOut",
          }}
        />
      ))}
    </motion.svg>
  );
}
