import { redirect } from "next/navigation";
import { homePathFor } from "@/server/authz/policy";
import { requirePageActor } from "@/server/http/next";

/** Single landing point after login: sends each role to its own area. */
export default async function HomeRedirect() {
  const actor = await requirePageActor();
  redirect(homePathFor(actor));
}
