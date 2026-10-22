import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "lenis/dist/lenis.css";
import "./globals.css";
import { getTheme } from "@/lib/theme";
import SmoothScroll from "@/components/smooth-scroll";

export const metadata: Metadata = {
  title: "Perp tools · Choose your exchange",
  description: "Explore points checkers and trading analytics for Arcus, TxFlow, and more perpetual exchanges.",
  icons: { icon: "/brand/perp-tools-symbol.svg" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const theme = await getTheme();
  return <html lang="en" data-theme={theme}><body><SmoothScroll />{children}<Analytics /></body></html>;
}
