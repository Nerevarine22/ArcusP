import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { getTheme } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Arcus · Points Estimator",
  description: "Find your Arcus points and compare FDV and airdrop allocation scenarios.",
  icons: { icon: "/brand/arcus-symbol.svg" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const theme = await getTheme();
  return <html lang="en" data-theme={theme}><body>{children}<Analytics /></body></html>;
}
