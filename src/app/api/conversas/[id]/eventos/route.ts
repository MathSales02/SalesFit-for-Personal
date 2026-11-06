import { z } from "zod";
import { currentActor } from "@/server/http/next";
import { AppError } from "@/server/lib/errors";
import { subscribeConversation } from "@/server/messaging/realtime";
import { assertConversationAccess } from "@/server/messaging/service";
import { checkRateLimit } from "@/server/security/rate-limit";

/**
 * Server-Sent Events for one conversation: a "message" event tells the page
 * to fetch new messages through the normal poll (no content is sent here).
 * Streams end after a few minutes; the browser reconnects and is
 * re-authorized, so a revoked session stops receiving signals quickly.
 */
const MAX_STREAM_MS = 5 * 60 * 1000;
const HEARTBEAT_MS = 25_000;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return new Response(null, { status: 404 });
  const actor = await currentActor();
  if (!actor) return new Response(null, { status: 401 });
  const limited = await checkRateLimit("realtime_connect_user", actor.userId);
  if (!limited.allowed) return new Response(null, { status: 429, headers: { "Retry-After": String(limited.retryAfterSec || 30) } });
  try {
    await assertConversationAccess(actor, id.data);
  } catch (err) {
    if (err instanceof AppError) return new Response(null, { status: err.status });
    throw err;
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send("retry: 3000\n\n");
      const unsubscribe = subscribeConversation(id.data, () => send("event: message\ndata: {}\n\n"));
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      const end = setTimeout(() => cleanup(), MAX_STREAM_MS);
      let closed = false;
      cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        clearTimeout(end);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
