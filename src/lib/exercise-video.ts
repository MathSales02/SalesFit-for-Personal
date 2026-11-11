/**
 * External demonstration videos. Only YouTube is accepted: links are stored in one canonical
 * form and played through the privacy-enhanced embed, loaded after the person presses play.
 */
const ID = /^[A-Za-z0-9_-]{11}$/;

/** The video id of a YouTube link (watch, youtu.be, shorts or embed), or null. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^(www|m)\./, "");
  let id: string | null | undefined = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const [, first, second] = u.pathname.split("/");
    if (first === "watch") id = u.searchParams.get("v");
    else if (first === "shorts" || first === "embed" || first === "live") id = second;
  }
  return id && ID.test(id) ? id : null;
}

export const canonicalVideoUrl = (url: string) => {
  const id = youtubeId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
};

export const youtubeThumbnail = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const youtubeEmbed = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`;
