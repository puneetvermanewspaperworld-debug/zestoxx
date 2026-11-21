"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isPhoneNow } from "@/lib/useScreenMode";

/** /app: a phone opens on its Watchlist (the home screen), a tablet or desktop on the Dashboard. */
export default function AppIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace(isPhoneNow() ? "/app/watchlist" : "/app/dashboard");
  }, [router]);
  return null;
}
