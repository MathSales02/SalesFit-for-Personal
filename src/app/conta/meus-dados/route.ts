import { currentActor } from "@/server/http/next";
import { requestMetaFrom } from "@/server/http/request-meta";
import { AppError } from "@/server/lib/errors";
import { errorFields, log } from "@/server/lib/logger";
import { exportMyData } from "@/server/privacy/service";

/** LGPD access/portability: downloads everything the platform holds about the signed-in user as JSON. */
export async function GET(request: Request) {
  const actor = await currentActor();
  if (!actor) return new Response("Faça login para continuar.", { status: 401, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  try {
    const data = await exportMyData(actor, requestMetaFrom(request.headers));
    const day = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="salesfit-meus-dados-${day}.json"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof AppError) return new Response(err.publicMessage, { status: err.status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    log.error("data export failed", errorFields(err));
    return new Response("Não foi possível gerar o arquivo agora. Tente novamente em instantes.", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
