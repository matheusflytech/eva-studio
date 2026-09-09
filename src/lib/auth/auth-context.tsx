"use client";

import * as React from "react";
import * as mockAuth from "@/lib/auth/mock-auth";
import type { Session } from "@/lib/data/types";

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  signUp: typeof mockAuth.signUp;
  logIn: typeof mockAuth.logIn;
  logOut: () => void;
  updateOrgLogo: (dataUrl: string) => void;
  updateOrgName: (orgName: string) => void;
  updateUserName: (name: string) => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    setSession(mockAuth.getSession());
    setIsLoading(false);
  }, []);

  const signUp: typeof mockAuth.signUp = async (input) => {
    const result = await mockAuth.signUp(input);
    if (result.ok) setSession(mockAuth.getSession());
    return result;
  };

  const logIn: typeof mockAuth.logIn = async (input) => {
    const result = await mockAuth.logIn(input);
    if (result.ok) setSession(mockAuth.getSession());
    return result;
  };

  const logOut = () => {
    mockAuth.logOut();
    setSession(null);
  };

  const updateOrgLogo = (dataUrl: string) => {
    const updated = mockAuth.updateOrgLogo(dataUrl);
    if (updated) setSession(updated);
  };

  const updateOrgName = (orgName: string) => {
    const updated = mockAuth.updateOrgName(orgName);
    if (updated) setSession(updated);
  };

  const updateUserName = (name: string) => {
    const updated = mockAuth.updateUserName(name);
    if (updated) setSession(updated);
  };

  return (
    <AuthContext.Provider
      value={{ session, isLoading, signUp, logIn, logOut, updateOrgLogo, updateOrgName, updateUserName }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
