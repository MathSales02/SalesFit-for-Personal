import { FEATURE_INFO, hasFeature, type Feature, type PlanFeatures } from "@/lib/plan-features";
import type { BillingAccess } from "../billing/access";
import { AppError, Errors } from "../lib/errors";

/**
 * Central authorization policy. Deny by default: a permission that is not
 * listed for a role is refused. UI code may call can() to hide controls, but
 * every server action and route handler must call assertCan() itself.
 *
 * Resource-level checks (does this student belong to this workspace?) are done
 * by scoping queries to actor.membership.workspaceId and by RLS in the database.
 */

export type WorkspaceRole = "trainer" | "student";

export type Membership = {
  workspaceId: string;
  workspaceName: string;
  memberId: string;
  role: WorkspaceRole;
  /** Subscription-derived access, filled in by resolveActor. */
  access?: BillingAccess;
  /** What the workspace's plan includes (see lib/plan-features), filled in by resolveActor. */
  features?: PlanFeatures;
};

export type Actor = {
  userId: string;
  sessionId: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  isPlatformAdmin: boolean;
  /** Two-step verification is on (required for platform admins to use admin permissions). */
  mfaEnabled?: boolean;
  /** When the account was created (ISO): news from before it is not announced to this person. */
  joinedAt?: string;
  /** Active membership in the session's workspace, or null (e.g. a platform admin with no workspace). */
  membership: Membership | null;
};

const WORKSPACE_PERMISSIONS = {
  "workspace.read": ["trainer", "student"],
  "workspace.update": ["trainer"],
  "workspace.audit.read": ["trainer"],
  "subscription.read": ["trainer"],
  "subscription.manage": ["trainer"],
  "students.read": ["trainer"],
  "students.manage": ["trainer"],
  "training.manage": ["trainer"],
  "training.read_own": ["student"],
  "training.log_own": ["student"],
  "progress.manage_own": ["student"],
  "community.read": ["trainer", "student"],
  "community.post": ["trainer", "student"],
  "community.announce": ["trainer"],
  "community.moderate": ["trainer"],
  "messages.use": ["trainer", "student"],
  "gamification.configure": ["trainer"],
  "rewards.manage": ["trainer"],
  "rewards.redeem": ["student"],
  "challenges.manage": ["trainer"],
  "challenges.join": ["student"],
} as const satisfies Record<string, readonly WorkspaceRole[]>;

export type WorkspacePermission = keyof typeof WORKSPACE_PERMISSIONS;

/**
 * Platform admin permissions. Deliberately excludes health data, progress
 * photos and private messages: access to those needs an explicit, audited
 * break-glass flow, never a blanket admin role.
 */
const ADMIN_PERMISSIONS = [
  "admin.dashboard",
  "admin.workspaces.read",
  "admin.workspaces.suspend",
  "admin.users.read",
  "admin.users.suspend",
  "admin.plans.manage",
  "admin.exercises.manage",
  "admin.reports.review",
  "admin.security_events.read",
  "admin.billing.manage",
  "admin.audit.read",
  "admin.support_access",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];
export type Permission = WorkspacePermission | AdminPermission;

function isAdminPermission(p: Permission): p is AdminPermission {
  return (ADMIN_PERMISSIONS as readonly string[]).includes(p);
}

export function can(actor: Actor | null, permission: Permission): boolean {
  if (!actor) return false;
  if (isAdminPermission(permission)) return actor.isPlatformAdmin;
  const allowed: readonly WorkspaceRole[] | undefined = WORKSPACE_PERMISSIONS[permission];
  if (!allowed || !actor.membership) return false;
  return allowed.includes(actor.membership.role);
}

export function assertCan(actor: Actor | null, permission: Permission): asserts actor is Actor {
  if (!actor) throw Errors.unauthenticated();
  if (!can(actor, permission)) throw Errors.forbidden();
}

export const actorHasFeature = (actor: Actor | null, feature: Feature) => hasFeature(actor?.membership?.features, feature);

/**
 * For services: the workspace's plan must include the feature. Runs on the server for every
 * call, so hiding a button is never what keeps a feature locked.
 */
export function assertFeature(actor: Actor, feature: Feature) {
  if (actorHasFeature(actor, feature)) return;
  const info = FEATURE_INFO[feature];
  throw new AppError(
    "PLAN_LIMIT",
    actor.membership?.role === "trainer"
      ? `${info.label} faz parte do plano SalesFit ${info.plan}. Mude de plano em Assinatura para usar.`
      : `${info.label} não faz parte do plano da sua consultoria.`,
  );
}

/** Narrowing helper for code that needs the workspace after a permission check. */
export function requireMembership(actor: Actor): Membership {
  if (!actor.membership) throw Errors.forbidden();
  return actor.membership;
}

/** For actions that must not run before the email is confirmed (e.g. inviting students). */
export function assertEmailVerified(actor: Actor) {
  if (!actor.emailVerified) throw new AppError("FORBIDDEN", "Confirme seu e-mail para usar este recurso.");
}

/** Home route for an actor, used after login and for the role switch. */
export function homePathFor(actor: Actor): string {
  if (actor.membership?.role === "trainer") return "/treinador";
  if (actor.membership?.role === "student") return "/aluno";
  if (actor.isPlatformAdmin) return "/admin";
  return "/sem-acesso";
}
