"use client";

import { motion } from "framer-motion";
import {
  FolderKanban,
  Users,
  CalendarDays,
  Receipt,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

interface TodayOverviewProps {
  stats: {
    activeProjects: number;
    newClientsThisMonth: number;
    pendingBookings: number;
    revenueThisMonth: number;
    recentActivityCount: number;
  };
}

const items = [
  {
    key: "activeProjects" as const,
    label: "Active Projects",
    icon: <FolderKanban size={14} strokeWidth={2} />,
    color: "#22d3ee",
    trend: { dir: "up" as const },
  },
  {
    key: "newClientsThisMonth" as const,
    label: "New Clients",
    icon: <Users size={14} strokeWidth={2} />,
    color: "#2dd4bf",
    trend: { dir: "up" as const },
  },
  {
    key: "pendingBookings" as const,
    label: "Pending Bookings",
    icon: <CalendarDays size={14} strokeWidth={2} />,
    color: "#fbbf24",
    trend: { dir: "flat" as const },
  },
  {
    key: "revenueThisMonth" as const,
    label: "Revenue This Month",
    icon: <Receipt size={14} strokeWidth={2} />,
    color: "#fb7185",
    trend: { dir: "up" as const },
    format: (v: number) => `$${v.toLocaleString()}`,
  },
  {
    key: "recentActivityCount" as const,
    label: "Recent Activity",
    icon: <Activity size={14} strokeWidth={2} />,
    color: "#a78bfa",
    trend: { dir: "up" as const },
  },
];

function TrendIcon({ dir }: { dir: "up" | "down" | "flat" }) {
  if (dir === "up") return <TrendingUp size={10} strokeWidth={2.5} />;
  if (dir === "down") return <TrendingDown size={10} strokeWidth={2.5} />;
  return <Minus size={10} strokeWidth={2.5} />;
}

export function TodayOverview({ stats }: TodayOverviewProps) {
  return (
    <motion.div
      className="today-overview"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      {items.map((item, i) => {
        const value = stats[item.key];
        const displayValue = item.format ? item.format(value) : value;
        const isLast = i === items.length - 1;

        return (
          <div key={item.key} className="today-overview__item">
            <span
              className="today-overview__icon"
              style={{
                color: item.color,
                background: `${item.color}12`,
                borderColor: `${item.color}22`,
                boxShadow: `0 0 12px ${item.color}15`,
              }}
            >
              {item.icon}
            </span>
            <div className="today-overview__meta">
              <span className="today-overview__value">{displayValue}</span>
              <span className="today-overview__label">{item.label}</span>
            </div>
            <span
              className={`today-overview__trend today-overview__trend--${item.trend.dir}`}
            >
              <TrendIcon dir={item.trend.dir} />
            </span>
            {!isLast && <div className="today-overview__divider" />}
          </div>
        );
      })}
    </motion.div>
  );
}

export default TodayOverview;
