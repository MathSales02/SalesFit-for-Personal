import type { Metadata } from "next";
import { LandingPage, landingMetadata } from "@/components/landing/landing-page";

/** English address of the landing. The proxy fixes the language of this path (see src/proxy.ts). */
export async function generateMetadata(): Promise<Metadata> {
  return landingMetadata("en");
}

export default LandingPage;
