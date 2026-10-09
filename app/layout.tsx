import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "lenis/dist/lenis.css";
import "./globals.css";
import { getTheme } from "@/lib/theme";
import SmoothScroll from "@/components/smooth-scroll";

export const metadata: Metadata = {
  title: "Arcus · Points Estimator",
  description: "Find your Arcus points and compare FDV and airdrop allocation scenarios.",
  icons: { icon: "/brand/arcus-symbol.svg" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const theme = await getTheme();
  return <html lang="en" data-theme={theme}><body><SmoothScroll />{children}<Analytics /></body></html>;
}
