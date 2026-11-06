import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/ui/page-heading";
import { currentActor } from "@/server/http/next";
import { RegisterForm } from "../forms";

export const metadata: Metadata = { title: "Criar conta" };

export default async function RegisterPage() {
  if (await currentActor()) redirect("/inicio");
  return (
    <>
      <AuthHeading title="Crie sua consultoria">14 dias grátis, sem cartão. Seus alunos entram por convite.</AuthHeading>
      <RegisterForm />
      <p className="mt-8 border-t border-line pt-6 text-sm text-muted">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-semibold text-turf underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </>
  );
}
