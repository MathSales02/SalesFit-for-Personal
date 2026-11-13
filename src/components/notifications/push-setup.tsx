"use client";

import { useCallback, useEffect, useState } from "react";
import { pushStatusAction, removePushAction, savePushAction, testPushAction } from "@/app/_messaging/actions";
import { buttonClass } from "@/components/ui/button-styles";
import { useT } from "@/i18n/client";

/**
 * Turning on notifications on this phone or computer (Web Push). The browser asks for
 * permission only when the person taps the button, never on its own.
 */

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

const DISMISSED = "salesfit-push-prompt-dismissed";

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const supported = () => "serviceWorker" in navigator && typeof PushManager !== "undefined" && typeof Notification !== "undefined";

function keyBytes(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array) {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

async function readState(): Promise<State> {
  if (!supported()) return isIos() && !isStandalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const sub = Notification.permission === "granted" ? await currentSubscription() : null;
  if (!sub) return "off";
  const r = await pushStatusAction({ endpoint: sub.endpoint });
  return r.ok && r.data?.active ? "on" : "off";
}

function usePush(publicKey: string) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    readState().then(
      (s) => alive && setState(s),
      () => alive && setState("unsupported"),
    );
    return () => {
      alive = false;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      // First thing in the tap: iPhones only allow the permission question during a tap.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      const key = keyBytes(publicKey);
      let sub = await reg.pushManager.getSubscription();
      // A device subscribed with another server key cannot be reused.
      if (sub && !sameKey(sub.options.applicationServerKey, key)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const r = await savePushAction({ subscription: sub.toJSON() });
      if (!r.ok) {
        setNote(r.message);
        return;
      }
      setState("on");
    } catch {
      setNote("error");
    } finally {
      setBusy(false);
    }
  }, [publicKey]);

  const disable = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      const sub = await currentSubscription();
      if (sub) {
        await removePushAction({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }, []);

  const test = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await testPushAction();
      setNote(r.ok ? "sent" : r.message);
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, note, enable, disable, test };
}

/** Full control, on the notifications screen. */
export function PushSetup({ publicKey, role }: { publicKey: string; role: "trainer" | "student" }) {
  const t = useT();
  const { state, busy, note, enable, disable, test } = usePush(publicKey);
  if (state === "loading") return null;

  const noteText = note === "sent" ? t("Enviamos uma notificação de teste. Ela deve aparecer em alguns segundos.") : note === "error" ? t("Não foi possível ativar as notificações neste aparelho. Tente de novo.") : note;

  return (
    <section aria-labelledby="push-title" className="rounded-[var(--radius-panel)] border border-line bg-paper p-4">
      <h2 id="push-title" className="font-semibold">
        {t("Notificações no celular")}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {role === "trainer"
          ? t("Receba um aviso no celular quando chegar mensagem e quando um aluno ficar muitos dias sem treinar.")
          : t("Receba um aviso no celular quando chegar mensagem, quando houver treino novo e um lembrete se você ficar muitos dias sem treinar.")}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {state === "off" && (
          <button type="button" className={buttonClass("primary")} onClick={enable} disabled={busy} aria-busy={busy}>
            {t("Ativar neste aparelho")}
          </button>
        )}
        {state === "on" && (
          <>
            <p className="mr-auto text-sm font-semibold text-turf">{t("Ativadas neste aparelho")}</p>
            <button type="button" className={buttonClass("secondary")} onClick={test} disabled={busy}>
              {t("Enviar teste")}
            </button>
            <button type="button" className={buttonClass("ghost")} onClick={disable} disabled={busy}>
              {t("Desativar")}
            </button>
          </>
        )}
        {state === "ios-install" && (
          <p className="text-sm">{t("No iPhone, as notificações funcionam com o app instalado: toque em Compartilhar, depois em Adicionar à Tela de Início, e abra o SalesFit por lá.")}</p>
        )}
        {state === "denied" && (
          <p className="text-sm">{t("As notificações estão bloqueadas para o SalesFit. Libere nas configurações do navegador ou do celular e volte aqui.")}</p>
        )}
        {state === "unsupported" && <p className="text-sm">{t("Este navegador não recebe notificações. Tente pelo Chrome, Edge, Firefox ou Safari atualizados.")}</p>}
      </div>
      {noteText && (
        <p role="status" className="mt-2 text-sm text-muted">
          {noteText}
        </p>
      )}
    </section>
  );
}

/** A short invitation on the home screen, only while this device can still turn them on. Can be dismissed. */
export function PushPrompt({ publicKey }: { publicKey: string }) {
  const t = useT();
  const { state, busy, enable } = usePush(publicKey);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    let alive = true;
    // Read after mounting: the server does not know what this browser stored.
    queueMicrotask(() => alive && setDismissed(localStorage.getItem(DISMISSED) === "1"));
    return () => {
      alive = false;
    };
  }, []);
  if (state !== "off" || dismissed) return null;
  const dismiss = () => {
    localStorage.setItem(DISMISSED, "1");
    setDismissed(true);
  };
  return (
    <aside aria-label={t("Notificações no celular")} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-panel)] border border-line bg-paper px-4 py-3">
      <p className="min-w-0 flex-1 text-sm">{t("Ative as notificações para saber na hora quando chegar mensagem ou treino novo.")}</p>
      <div className="flex gap-2">
        <button type="button" className={buttonClass("primary")} onClick={enable} disabled={busy} aria-busy={busy}>
          {t("Ativar")}
        </button>
        <button type="button" className={buttonClass("ghost")} onClick={dismiss}>
          {t("Agora não")}
        </button>
      </div>
    </aside>
  );
}
