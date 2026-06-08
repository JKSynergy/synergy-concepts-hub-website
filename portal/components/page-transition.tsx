"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { SCHLoader } from "./sch-loader";

/* ─────────────────────────────────────────────────────────────
   Portal Page Transition Provider
   - Fade current content out on route change
   - Show SCH branded loading indicator if loading exceeds 300ms
   - Animate new page content into view
   - Prevents white flashes or abrupt transitions
   ───────────────────────────────────────────────────────────── */

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [showLoader, setShowLoader] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Hide loader on every pathname change, then start a 300ms timer
    setShowLoader(false);
    timerRef.current = setTimeout(() => setShowLoader(true), 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pathname]);

  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 10, scale: 0.995 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.995, filter: "blur(4px)" }}
          transition={{
            duration: 0.35,
            ease: [0.16, 1, 0.3, 1],
          }}
          onAnimationComplete={() => setShowLoader(false)}
          style={{ willChange: "transform, opacity" }}
        >
          {children}
        </motion.div>
      </AnimatePresence>

      {/* SCH Branded loader overlay for slow transitions */}
      <AnimatePresence>
        {showLoader && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="sch-page-loader"
          >
            <SCHLoader size={96} label="Loading Workspace..." autoCompleteMs={0} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default PageTransition;
