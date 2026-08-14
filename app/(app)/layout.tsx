"use client";

import { AppProvider } from "./app-state";
import { AppShell } from "./shell";

export default function AppLayout({ children }: { children: React.ReactNode }) { return <AppProvider><AppShell>{children}</AppShell></AppProvider>; }
