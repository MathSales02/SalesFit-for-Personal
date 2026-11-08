"use client";

import { useEffect, useSyncExternalStore } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

// The browser fires its install offer once, early; keep it here for any button that mounts later.
let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Registers the service worker and keeps the browser's install offer. Mounted once, in the root layout. */
export function PwaSetup() {
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred = e as InstallPrompt;
      notify();
    };
    const onInstalled = () => {
      deferred = null;
      notify();
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}

type InstallState = "prompt" | "ios" | "none";

function readState(): InstallState {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "none";
  if (deferred) return "prompt";
  // iPhone/iPad Safari has no install offer: the visitor adds it from the share menu.
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "none";
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** How this browser can install the app: its own prompt, Safari's share menu, or not at all. */
export function useInstallApp() {
  const state = useSyncExternalStore(subscribe, readState, () => "none" as const);
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    notify();
  };
  return { state, install };
}
