"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { THEME_COOKIE, THEMES } from "@/lib/theme";
import { parseForm, runAction } from "@/server/http/action";

/** Saves the appearance preference. Works signed in or out; nothing is stored on the server. */
export async function setThemeAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("set_theme", async () => {
    const { theme } = parseForm(z.strictObject({ theme: z.enum(THEMES) }), form);
    (await cookies()).set(THEME_COOKIE, theme, {
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
