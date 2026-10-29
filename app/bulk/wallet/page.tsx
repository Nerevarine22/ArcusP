import type { Metadata } from "next";
import BulkWallet from "@/components/bulk-wallet";
import "../bulk.css";
import "./wallet.css";
export const metadata: Metadata = {title:"BULK · Wallet Analytics",description:"Analyze BULK trading volume, maker and taker fees, holding times and manually recorded weekly AURA.",icons:{icon:"/brand/bulk/symbol.svg"}};
export default function BulkWalletPage(){return <BulkWallet />;}
