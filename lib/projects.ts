export type Project = {
  id: string;
  name: string;
  status: "available" | "coming-soon";
  description: string;
  tools: string[];
  href: string | null;
  website: string;
};

export const projects: Project[] = [
  {
    id: "arcus",
    name: "Arcus",
    status: "available",
    description: "Check your points, explore airdrop scenarios, and understand your weekly trading activity.",
    tools: ["Points estimator", "Wallet analytics"],
    href: "/arcus",
    website: "https://app.arcus.xyz/ref/ATOMS",
  },
  {
    id: "txflow",
    name: "TxFlow",
    status: "available",
    description: "Explore your points potential and analyze trading volume, fees, funding, and positions by wallet.",
    tools: ["Points estimator", "Wallet analytics"],
    href: "/txflow",
    website: "https://app.txflow.com/r/TXATOMS",
  },
  {
    id: "extended",
    name: "Extended",
    status: "available",
    description: "Explore the value of your Xpoints across XTEN valuations and a fixed 30% community allocation.",
    tools: ["Points calculator"],
    href: "/extended",
    website: "https://app.extended.exchange/",
  },
];
