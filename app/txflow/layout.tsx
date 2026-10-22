import { redirect } from "next/navigation";
import { featureFlags } from "@/lib/features";

export default function TxflowLayout({ children }: { children: React.ReactNode }) {
  if (!featureFlags.multiExchange) redirect("/arcus");
  return children;
}
