import { redirect } from "next/navigation";
import { featureFlags } from "@/lib/features";

export default function TxflowLayout({ children }: { children: React.ReactNode }) {
  if (!featureFlags.multiExchange && !featureFlags.txflow) redirect("/arcus");
  return children;
}
