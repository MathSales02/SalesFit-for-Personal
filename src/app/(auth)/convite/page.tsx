import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/ui/notice";
import { AuthHeading } from "@/components/ui/page-heading";
import { currentActor, requestMeta } from "@/server/http/next";
import { AppError } from "@/server/lib/errors";
import { previewInvitation } from "@/server/students/invitations";
import { AcceptAsCurrentUserForm, NewAccountForm } from "./forms";

export const metadata: Metadata = { title: "Convite" };

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export default async function InvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (typeof token !== "string" || !TOKEN.test(token)) return <Invalid />;

  let preview;
  try {
    preview = await previewInvitation(token, await requestMeta());
  } catch (err) {
    if (err instanceof AppError && err.code === "RATE_LIMITED") {
      return <Notice tone="error">Muitas tentativas. Aguarde alguns minutos e abra o link de novo.</Notice>;
    }
    throw err;
  }
  if (!preview) return <Invalid />;

  const actor = await currentActor();
  const heading = <AuthHeading title={preview.workspaceName}>convidou você para treinar na Cadência.</AuthHeading>;

  if (!preview.accountExists) {
    return (
      <>
        {heading}
        {actor && (
          <div className="mb-6">
            <Notice tone="info">Você está conectado com outra conta. Ao continuar, criará uma nova conta para {preview.email}.</Notice>
          </div>
        )}
        <NewAccountForm token={token} email={preview.email} />
      </>
    );
  }

  if (actor && actor.email.toLowerCase() === preview.email.toLowerCase()) {
    return (
      <>
        {heading}
        <p className="mb-6 text-muted">Você vai entrar como aluno com a conta {preview.email}.</p>
        <AcceptAsCurrentUserForm token={token} />
      </>
    );
  }

  return (
    <>
      {heading}
      <Notice tone="info">
        Já existe uma conta para {preview.email}.{" "}
        <Link href="/entrar" className="font-semibold underline">
          Entre com ela
        </Link>{" "}
        e depois abra este link de novo para aceitar o convite.
      </Notice>
    </>
  );
}

function Invalid() {
  return (
    <>
      <AuthHeading title="Convite indisponível">Este convite é inválido, expirou ou já foi usado.</AuthHeading>
      <p className="text-muted">Peça ao seu treinador para enviar um novo convite.</p>
    </>
  );
}
