"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { NavLink as Link } from "@/components/nav-link";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { motion, useInView } from "framer-motion";

export function Sparkline({
  data,
  stroke = "#4cc9f0",
  id,
}: {
  data: number[];
  stroke?: string;
  id: string;
}) {
  const w = 120;
  const h = 38;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((d, i) => {
    const x = i * step;
    const y = h - ((d - min) / range) * (h - 6) - 3;
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;

  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#spark-${id})`} />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* Count-up hook */
function useCountUp(target: number, duration = 1200) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!isInView || hasAnimated.current) return;
    hasAnimated.current = true;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setCount(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [isInView, target, duration]);

  return { count, ref };
}

export interface KPICardProps {
  title: string;
  value: number;
  icon: ReactNode;
  href?: string;
  trend?: { label: string; dir: "up" | "down" | "flat" };
  sparkData?: number[];
  sparkColor?: string;
  sparkId: string;
  /** Accent color for icon background and glow */
  accent?: "cyan" | "teal" | "amber" | "coral";
}

const ACCENT_MAP = {
  cyan: { color: "#22d3ee", bg: "rgba(34, 211, 238, 0.12)", border: "rgba(34, 211, 238, 0.22)", glow: "rgba(34, 211, 238, 0.18)" },
  teal: { color: "#2dd4bf", bg: "rgba(45, 212, 191, 0.12)", border: "rgba(45, 212, 191, 0.22)", glow: "rgba(45, 212, 191, 0.18)" },
  amber: { color: "#fbbf24", bg: "rgba(251, 191, 36, 0.12)", border: "rgba(251, 191, 36, 0.22)", glow: "rgba(251, 191, 36, 0.18)" },
  coral: { color: "#fb7185", bg: "rgba(251, 113, 133, 0.12)", border: "rgba(251, 113, 133, 0.22)", glow: "rgba(251, 113, 133, 0.18)" },
};

export function KPICard({
  title,
  value,
  icon,
  href,
  trend,
  sparkData,
  sparkColor = "#4cc9f0",
  sparkId,
  accent = "cyan",
}: KPICardProps) {
  const TrendIcon =
    trend?.dir === "up" ? TrendingUp : trend?.dir === "down" ? TrendingDown : Minus;
  const { count, ref } = useCountUp(typeof value === "number" ? value : 0);
  const colors = ACCENT_MAP[accent];

  const inner = (
    <motion.div
      className="kpi-card h-full"
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4, scale: 1.015 }}
    >
      <div className="relative z-10 flex items-start justify-between">
        <div
          className="kpi-icon"
          style={{
            color: colors.color,
            background: colors.bg,
            borderColor: colors.border,
            boxShadow: `0 0 20px ${colors.glow}`,
          }}
        >
          {icon}
        </div>
        {trend && (
          <span className={`kpi-trend kpi-trend--${trend.dir}`}>
            <TrendIcon size={12} strokeWidth={2.2} />
            {trend.label}
          </span>
        )}
      </div>
      <div className="relative z-10 mt-4">
        <div className="kpi-value">{count}</div>
        <div className="mt-1.5 text-sm" style={{ color: "var(--p-muted)" }}>
          {title}
        </div>
      </div>
      {sparkData && sparkData.length > 1 && (
        <motion.div
          className="relative z-10 mt-3"
          initial={{ opacity: 0, scaleX: 0.8 }}
          whileInView={{ opacity: 1, scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <Sparkline data={sparkData} stroke={sparkColor} id={sparkId} />
        </motion.div>
      )}
    </motion.div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}

export default KPICard;
