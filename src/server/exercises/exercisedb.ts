import "server-only";

/**
 * Client for the free ExerciseDB catalogue (https://oss.exercisedb.dev), the source of the animated
 * demonstrations. No key is involved. Only two fixed hosts are ever contacted, and the app stores
 * the media address, not the file: the animation is loaded by the browser from the source.
 */
const API = "https://oss.exercisedb.dev/api/v1/exercises";
const MEDIA = /^https:\/\/static\.exercisedb\.dev\/media\/[A-Za-z0-9_-]{1,40}\.gif$/;
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const TIMEOUT_MS = 8000;

export type CatalogExercise = { id: string; name: string; gifUrl: string };

export interface DemoSource {
  /** The catalogue entry, or null when the id does not exist. Throws when the source cannot be reached. */
  fetchExercise(id: string): Promise<CatalogExercise | null>;
  /** Whether the animation file answers. Throws when the source cannot be reached. */
  mediaAvailable(url: string): Promise<boolean>;
}

export const isDemoUrl = (url: string) => MEDIA.test(url);
export const isCatalogId = (id: string) => ID.test(id);

export const exerciseDb: DemoSource = {
  async fetchExercise(id) {
    if (!isCatalogId(id)) return null;
    const res = await fetch(`${API}/${id}`, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`exercisedb answered ${res.status}`);
    const body = (await res.json()) as { data?: { exerciseId?: unknown; name?: unknown; gifUrl?: unknown } };
    const d = body.data;
    if (!d || typeof d.exerciseId !== "string" || typeof d.name !== "string" || typeof d.gifUrl !== "string") return null;
    // An address outside the known media host is never stored.
    if (!isDemoUrl(d.gifUrl)) return null;
    return { id: d.exerciseId, name: d.name, gifUrl: d.gifUrl };
  },

  async mediaAvailable(url) {
    if (!isDemoUrl(url)) return false;
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 404 || res.status === 410) return false;
    if (!res.ok) throw new Error(`exercisedb media answered ${res.status}`);
    return true;
  },
};
