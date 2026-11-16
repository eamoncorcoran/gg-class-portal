// A short burst of confetti on a canvas over the card when an answer is right. Sixty pieces, one
// second, then gone. Drawn by hand so there is nothing to load.
import { useEffect, useRef } from "react";

const COLOURS = ["#47C25A", "#FFC800", "#1CB0F6", "#FF9600", "#CE82FF", "#FF4B4B"];

export const Confetti = ({ fire }: { fire: number }) => {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        if (!fire) return;
        const c = ref.current;
        const g = c?.getContext("2d");
        if (!c || !g) return;
        const W = (c.width = c.offsetWidth * devicePixelRatio), H = (c.height = c.offsetHeight * devicePixelRatio);
        const ps = Array.from({ length: 70 }, () => ({
            x: W / 2 + (Math.random() - 0.5) * W * 0.2,
            y: H * 0.78,
            vx: (Math.random() - 0.5) * 18 * devicePixelRatio,
            vy: (-9 - Math.random() * 9) * devicePixelRatio,
            r: (4 + Math.random() * 5) * devicePixelRatio,
            a: Math.random() * Math.PI,
            va: (Math.random() - 0.5) * 0.3,
            col: COLOURS[Math.floor(Math.random() * COLOURS.length)],
            life: 1,
        }));
        let raf = 0;
        const t0 = performance.now();
        const step = (t: number) => {
            const k = (t - t0) / 1100;
            g.clearRect(0, 0, W, H);
            for (const p of ps) {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.55 * devicePixelRatio;
                p.vx *= 0.99;
                p.a += p.va;
                p.life = 1 - k;
                g.save();
                g.globalAlpha = Math.max(0, p.life);
                g.translate(p.x, p.y);
                g.rotate(p.a);
                g.fillStyle = p.col;
                g.fillRect(-p.r / 2, -p.r / 3, p.r, p.r / 1.5);
                g.restore();
            }
            if (k < 1) raf = requestAnimationFrame(step);
            else g.clearRect(0, 0, W, H);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [fire]);
    return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" />;
};
