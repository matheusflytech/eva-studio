"use client";

import * as React from "react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const [showMountains, setShowMountains] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setShowMountains(true), 600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-bg-base px-4">
      <div
        className="pointer-events-none absolute inset-0 transition-opacity ease-out"
        style={{ opacity: showMountains ? 1 : 0, transitionDuration: "2200ms" }}
      >
        <svg
          className="animate-mtn-drift-back absolute bottom-0 left-0 h-[70%] w-full"
          viewBox="0 0 1200 500"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="mtn-back-fade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(210,225,255,0.16)" />
              <stop offset="100%" stopColor="rgba(210,225,255,0)" />
            </linearGradient>
          </defs>
          <polygon points="0,500 160,220 340,380 560,120 780,360 980,200 1200,500" fill="url(#mtn-back-fade)" />
          <polygon points="560,120 610,190 510,190" fill="rgba(255,255,255,0.14)" />
          <polygon points="980,200 1020,250 940,250" fill="rgba(255,255,255,0.14)" />
        </svg>
        <svg
          className="animate-mtn-drift-front absolute bottom-0 left-0 h-[55%] w-full"
          viewBox="0 0 1200 400"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="mtn-front-fade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(225,235,255,0.22)" />
              <stop offset="100%" stopColor="rgba(225,235,255,0)" />
            </linearGradient>
          </defs>
          <polygon points="0,400 220,260 420,340 620,180 820,330 1020,250 1200,400" fill="url(#mtn-front-fade)" />
          <polygon points="620,180 655,225 585,225" fill="rgba(255,255,255,0.2)" />
        </svg>
      </div>

      <div className="relative z-10 mb-8 flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/eva-mark.png" alt="" width={28} height={28} />
        <span className="font-display text-[15px] font-bold uppercase tracking-wide text-text-primary">
          Eva
        </span>
      </div>
      <div className="relative z-10 w-full max-w-[400px]">{children}</div>
    </div>
  );
}
