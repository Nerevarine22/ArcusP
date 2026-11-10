export type Project = {
  id: string;
  name: string;
  status: "available" | "coming-soon";
  description: string;
  tools: string[];
  href: string | null;
  website: string;
  walletHref?: string;
};

export const EXTENDED_REFERRAL_CODE = "ATOMS";
export const EXTENDED_REFERRAL_URL = `https://app.extended.exchange/join/${EXTENDED_REFERRAL_CODE}`;

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
    id: "risex",
    name: "RISEx",
    status: "available",
    description: "Estimate RISEx point value and analyze wallet trades, fees, funding and positions.",
    tools: ["Points calculator", "Wallet analytics"],
    href: "/risex",
    website: "https://www.rise.trade/",
  },
  {
    id: "variational",
    name: "Variational",
    status: "available",
    description: "Estimate point value using FDV scenarios and Polymarket probabilities.",
    tools: ["Points calculator"],
    href: "/variational",
    website: "https://omni.variational.io/?ref=OMNIATOMS",
  },
  {
    id: "entropy",
    name: "Entropy",
    status: "available",
    description: "Analyze io: trading volume, execution fees, funding and holding times using public Hyperliquid data.",
    tools: ["Wallet analytics"],
    href: "/entropy",
    walletHref: "/entropy",
    website: "https://pro.entropy.io/?r=quasartitan452",
  },
  {
    id: "bulk",
    name: "BULK",
    status: "available",
    description: "Estimate AURA value across FDV and total points scenarios using a manual community allocation.",
    tools: ["Points calculator", "Wallet analytics"],
    href: "/bulk",
    website: "https://app.bulk.trade/",
  },
  {
    id: "extended",
    name: "Extended",
    status: "available",
    description: "Explore the value of your Xpoints across XTEN valuations and a fixed 30% community allocation.",
    tools: ["Points calculator"],
    href: "/extended",
    website: EXTENDED_REFERRAL_URL,
  },
  {
    id: "jumper",
    name: "Jumper",
    status: "available",
    description: "Check wallet XP and compare estimated allocations across FDV and eligibility scenarios.",
    tools: ["Points calculator"],
    href: "/jumper",
    website: "https://jumper.xyz/",
  },
];
