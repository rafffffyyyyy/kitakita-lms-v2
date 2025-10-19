"use client";

import { useEffect, useState } from "react";

export default function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Render nothing on the server and until mounted on the client -> no SSR/CSR diff
  if (!mounted) return null;
  return <>{children}</>;
}
