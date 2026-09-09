"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";

export default function RootPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();

  React.useEffect(() => {
    if (isLoading) return;
    router.replace(session ? "/inicio" : "/login");
  }, [isLoading, session, router]);

  return <div className="min-h-screen bg-bg-base" />;
}
