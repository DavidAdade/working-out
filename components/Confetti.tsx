"use client";

// A short burst of confetti on one canvas, no library. Skipped entirely for people who prefer reduced motion.

import { useEffect, useRef } from "react";

const FALLBACK = ["255 99 71", "52 168 83", "66 133 244", "251 188 5", "171 71 188"];

export default function Confetti({ big = false, onDone }: { big?: boolean; onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      doneRef.current();
      return;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    // The app's own colours where it has them
    const css = getComputedStyle(document.documentElement);
    const theme = ["--accent", "--good", "--warn"].map((v) => css.getPropertyValue(v).trim()).filter(Boolean);
    const colors = [...theme, ...FALLBACK];
    const count = big ? 220 : 140;
    // About 2 s on screen for the small one: it pops up, then drifts down slowly against the air
    const life = big ? 4200 : 2300;
    const gravity = big ? 0.25 : 0.16;
    const drag = big ? 0.99 : 0.965;
    const parts = Array.from({ length: count }, (_, i) => {
      // Big: two cannons from the bottom corners; small: one burst up and out from near the top middle
      const left = i % 2 === 0;
      const angle = big ? (left ? -Math.PI / 3 : (-2 * Math.PI) / 3) + (Math.random() - 0.5) * 0.7 : -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const speed = big ? 9 + Math.random() * 9 : 5 + Math.random() * 9;
      return {
        x: big ? (left ? 0 : w) : w / 2,
        y: big ? h : h * 0.3,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 5 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        sway: Math.random() * Math.PI * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
      };
    });
    const t0 = performance.now();
    let prev = t0;
    let raf = 0;
    const frame = (t: number) => {
      const age = t - t0;
      // Steps in 60 fps frames, so a 120 Hz iPhone doesn't play it at double speed
      const dt = Math.min(3, (t - prev) / (1000 / 60));
      prev = t;
      ctx.clearRect(0, 0, w, h);
      const fade = Math.min(1, Math.max(0, (life - age) / 600));
      for (const p of parts) {
        p.vy += gravity * dt;
        p.vx *= drag ** dt;
        if (!big) p.vy *= drag ** dt;
        p.x += (p.vx + (big ? 0 : Math.sin(age / 250 + p.sway) * 0.6)) * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = `rgb(${p.color} / ${fade})`;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (age < life) raf = requestAnimationFrame(frame);
      else doneRef.current();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [big]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[60] h-full w-full" />;
}
