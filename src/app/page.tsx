import type { Metadata } from "next";
import { LandingPage, landingMetadata } from "@/components/landing/landing-page";

/** Portuguese address of the landing; visitors whose browser asks for another language see theirs. */
export async function generateMetadata(): Promise<Metadata> {
  return landingMetadata("pt-BR");
}

export default LandingPage;
