"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { Sidebar } from "@/components/layout/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { session, isLoading } = useAuth();

  React.useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/login");
    }
  }, [isLoading, session, router]);

  if (isLoading || !session) {
    return <div className="min-h-screen bg-bg-base" />;
  }

  return (
    <div className="app-backdrop flex h-screen gap-3 overflow-hidden p-3">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-y-auto rounded-3xl">{children}</main>
    </div>
  );
}
