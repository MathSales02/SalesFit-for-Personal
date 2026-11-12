"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { LOCALE_COOKIE, LOCALES } from "@/i18n/config";
import type { ActionResult } from "@/lib/action-result";
import { parseForm, runAction } from "@/server/http/action";

/** Saves the language choice. Works signed in or out; it lives in a cookie of this browser. */
export async function setLocaleAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("set_locale", async () => {
    const { locale } = parseForm(z.strictObject({ locale: z.enum(LOCALES) }), form);
    (await cookies()).set(LOCALE_COOKIE, locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
    revalidatePath("/", "layout");
    return { ok: true };
  });
}
