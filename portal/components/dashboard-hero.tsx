"use client";

import { FolderKanban, Users, Receipt, BarChart3, ArrowUpRight, Briefcase, Activity, Zap } from "lucide-react";
import { NavLink as Link } from "@/components/nav-link";
import { motion } from "framer-motion";

interface DashboardHeroProps {
  name: string;
  role: string;
  stats: {
    activeProjects: number;
    pendingBookings: number;
    outstandingInvoices: number;
  };
  isAdmin: boolean;
}

export function DashboardHero({ role, stats }: DashboardHeroProps) {
  const actions = [
    {
      label: "New Project",
      href: "/admin/projects",
      icon: <FolderKanban size={16} strokeWidth={2} />,
      primary: true,
    },
    {
      label: "Add Client",
      href: "/admin/clients",
      icon: <Users size={16} strokeWidth={2} />,
      primary: false,
    },
    {
      label: "Create Invoice",
      href: "/admin/invoices",
      icon: <Receipt size={16} strokeWidth={2} />,
      primary: false,
    },
    {
      label: "View Reports",
      href: "/admin/reports",
      icon: <BarChart3 size={16} strokeWidth={2} />,
      primary: false,
    },
  ];

  // Floating glass widget data
  const recentActivity = [
    { label: "New client registered", time: "2h ago", icon: <Users size={14} />, color: "#2dd4bf" },
    { label: "Invoice #1042 sent", time: "4h ago", icon: <Receipt size={14} />, color: "#fb7185" },
    { label: "Project 'Matsen Brand' started", time: "6h ago", icon: <Briefcase size={14} />, color: "#22d3ee" },
  ];

  const systemStatus = {
    label: "All Systems Operational",
    uptime: "99.9%",
    healthy: true,
  };

  return (
    <div className="dashboard-hero">
      {/* Ambient glow orbs */}
      <div className="dashboard-hero__orb dashboard-hero__orb--1" aria-hidden="true" />
      <div className="dashboard-hero__orb dashboard-hero__orb--2" aria-hidden="true" />
      <div className="dashboard-hero__orb dashboard-hero__orb--3" aria-hidden="true" />

      {/* Floating particles */}
      <div className="dashboard-hero__particles" aria-hidden="true">
        <div className="dashboard-hero__particle" style={{ top: "18%", left: "12%", animationDelay: "0s" }} />
        <div className="dashboard-hero__particle" style={{ top: "35%", left: "28%", animationDelay: "1.5s" }} />
        <div className="dashboard-hero__particle" style={{ top: "12%", left: "55%", animationDelay: "3s" }} />
        <div className="dashboard-hero__particle" style={{ top: "60%", left: "8%", animationDelay: "2s" }} />
        <div className="dashboard-hero__particle" style={{ top: "75%", left: "42%", animationDelay: "4s" }} />
        <div className="dashboard-hero__particle" style={{ top: "45%", left: "70%", animationDelay: "0.8s" }} />
      </div>

      {/* Animated accent line graph */}
      <svg className="dashboard-hero__line" viewBox="0 0 140 40" fill="none" aria-hidden="true">
        <path
          d="M0 32 Q20 28, 35 20 T70 16 T105 22 T140 8"
          stroke="url(#lineGrad)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.5"
        >
          <animate attributeName="d" dur="6s" repeatCount="indefinite"
            values="M0 32 Q20 28, 35 20 T70 16 T105 22 T140 8;M0 30 Q20 22, 35 18 T70 24 T105 14 T140 18;M0 32 Q20 28, 35 20 T70 16 T105 22 T140 8"
          />
        </path>
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(29,161,242,0)" />
            <stop offset="50%" stopColor="rgba(29,161,242,0.6)" />
            <stop offset="100%" stopColor="rgba(76,201,240,0)" />
          </linearGradient>
        </defs>
      </svg>

      {/* Content */}
      <div className="relative z-10">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-8">
          {/* Left column: greeting + actions */}
          <div className="flex-1 min-w-0">
            <motion.div
              className="dashboard-hero__eyebrow"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              {role === "Administrator" ? "Admin Control Center" : "Staff Control Center"}
            </motion.div>
            <motion.h1
              className="dashboard-hero__title"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            >
              Welcome Back
            </motion.h1>
            <motion.p
              className="dashboard-hero__subtitle"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              Manage projects, clients, bookings, invoices, and academy operations from a single command center.
            </motion.p>

            <motion.div
              className="dashboard-hero__actions"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.24, ease: [0.16, 1, 0.3, 1] }}
            >
              {actions.map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className={`dashboard-hero__action ${action.primary ? "dashboard-hero__action--primary" : ""}`}
                >
                  {action.icon}
                  <span>{action.label}</span>
                  <ArrowUpRight size={13} strokeWidth={2.2} className="opacity-60" />
                </Link>
              ))}
            </motion.div>

          </div>

          {/* Right column: floating glass widget area */}
          <motion.div
            className="dashboard-hero__widgets"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* System Status Widget */}
            <div className="hero-widget hero-widget--status">
              <div className="hero-widget__header">
                <Zap size={14} strokeWidth={2} />
                <span>System Status</span>
              </div>
              <div className="hero-widget__body">
                <div className="flex items-center gap-2">
                  <span className={`status-dot ${systemStatus.healthy ? "status-dot--live" : ""}`} />
                  <span className="text-sm font-medium" style={{ color: "var(--p-text-strong)" }}>
                    {systemStatus.label}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs" style={{ color: "var(--p-muted)" }}>
                  <span>Uptime {systemStatus.uptime}</span>
                  <span className="opacity-30">|</span>
                  <span>{stats.activeProjects} active projects</span>
                </div>
              </div>
            </div>

            {/* Recent Activity Widget */}
            <div className="hero-widget hero-widget--activity">
              <div className="hero-widget__header">
                <Activity size={14} strokeWidth={2} />
                <span>Recent Activity</span>
              </div>
              <div className="hero-widget__body">
                {recentActivity.map((item, i) => (
                  <div key={i} className="hero-activity-item">
                    <span
                      className="hero-activity-item__icon"
                      style={{ color: item.color, background: `${item.color}15`, borderColor: `${item.color}25` }}
                    >
                      {item.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm truncate" style={{ color: "var(--p-text-strong)" }}>
                        {item.label}
                      </p>
                      <p className="text-xs" style={{ color: "var(--p-muted)" }}>
                        {item.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default DashboardHero;
