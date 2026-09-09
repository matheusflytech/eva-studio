// Mock, localStorage-only auth for the frontend-first prototype phase.
// Not secure — passwords are stored as plain text in the browser's localStorage.
// This is the explicit seam to swap in real auth (hashed passwords, server sessions) later.

import { generateId } from "@/lib/utils";
import { readStorage, writeStorage, clearStorageKey } from "@/lib/data/storage";
import type { Session } from "@/lib/data/types";

interface Account {
  userId: string;
  name: string;
  email: string;
  password: string;
  orgName: string;
  orgLogoUrl?: string;
}

const ACCOUNTS_KEY = "accounts";
const SESSION_KEY = "session";

function getAccounts(): Account[] {
  return readStorage<Account[]>(ACCOUNTS_KEY, []);
}

export async function signUp(input: {
  name: string;
  email: string;
  password: string;
  orgName: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const accounts = getAccounts();
  if (accounts.some((a) => a.email.toLowerCase() === input.email.toLowerCase())) {
    return { ok: false, error: "Já existe uma conta com esse e-mail." };
  }
  const account: Account = {
    userId: generateId(),
    name: input.name,
    email: input.email,
    password: input.password,
    orgName: input.orgName,
  };
  writeStorage(ACCOUNTS_KEY, [...accounts, account]);
  writeStorage<Session>(SESSION_KEY, {
    userId: account.userId,
    name: account.name,
    email: account.email,
    orgName: account.orgName,
    orgLogoUrl: account.orgLogoUrl,
  });
  return { ok: true };
}

export async function logIn(input: {
  email: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const accounts = getAccounts();
  const account = accounts.find((a) => a.email.toLowerCase() === input.email.toLowerCase());
  if (!account || account.password !== input.password) {
    return { ok: false, error: "E-mail ou senha incorretos." };
  }
  writeStorage<Session>(SESSION_KEY, {
    userId: account.userId,
    name: account.name,
    email: account.email,
    orgName: account.orgName,
    orgLogoUrl: account.orgLogoUrl,
  });
  return { ok: true };
}

export function logOut(): void {
  clearStorageKey(SESSION_KEY);
}

export function getSession(): Session | null {
  return readStorage<Session | null>(SESSION_KEY, null);
}

export function updateOrgLogo(dataUrl: string): Session | null {
  const session = getSession();
  if (!session) return null;

  const accounts = getAccounts();
  const updatedAccounts = accounts.map((a) =>
    a.userId === session.userId ? { ...a, orgLogoUrl: dataUrl } : a
  );
  writeStorage(ACCOUNTS_KEY, updatedAccounts);

  const updatedSession: Session = { ...session, orgLogoUrl: dataUrl };
  writeStorage<Session>(SESSION_KEY, updatedSession);
  return updatedSession;
}

export function updateOrgName(orgName: string): Session | null {
  const session = getSession();
  if (!session) return null;

  const accounts = getAccounts();
  const updatedAccounts = accounts.map((a) => (a.userId === session.userId ? { ...a, orgName } : a));
  writeStorage(ACCOUNTS_KEY, updatedAccounts);

  const updatedSession: Session = { ...session, orgName };
  writeStorage<Session>(SESSION_KEY, updatedSession);
  return updatedSession;
}

export function updateUserName(name: string): Session | null {
  const session = getSession();
  if (!session) return null;

  const accounts = getAccounts();
  const updatedAccounts = accounts.map((a) => (a.userId === session.userId ? { ...a, name } : a));
  writeStorage(ACCOUNTS_KEY, updatedAccounts);

  const updatedSession: Session = { ...session, name };
  writeStorage<Session>(SESSION_KEY, updatedSession);
  return updatedSession;
}
