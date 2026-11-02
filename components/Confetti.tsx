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
    const count = big ? 220 : 90;
    const life = big ? 4200 : 2600;
    const parts = Array.from({ length: count }, (_, i) => {
      // Big: two cannons from the bottom corners; small: one burst from the top middle
      const left = i % 2 === 0;
      const angle = big ? (left ? -Math.PI / 3 : (-2 * Math.PI) / 3) + (Math.random() - 0.5) * 0.7 : Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const speed = big ? 9 + Math.random() * 9 : 3 + Math.random() * 6;
      return {
        x: big ? (left ? 0 : w) : w / 2,
        y: big ? h : h * 0.25,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 5 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        color: colors[Math.floor(Math.random() * colors.length)],
      };
    });
    const t0 = performance.now();
    let raf = 0;
    const frame = (t: number) => {
      const age = t - t0;
      ctx.clearRect(0, 0, w, h);
      const fade = Math.min(1, Math.max(0, (life - age) / 600));
      for (const p of parts) {
        p.vy += 0.25;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.spin;
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
