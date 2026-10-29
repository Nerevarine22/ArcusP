import { NextRequest, NextResponse } from "next/server";
import { parse } from "lossless-json";
import { isBulkAddress, collectBulkHistory, normalizeBulkFill, normalizeBulkFunding, normalizeBulkAccount, buildBulkReport } from "@/lib/bulk-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control":"no-store" };
export async function POST(request: NextRequest) {
  let address: string;
  try { const body = await request.json(); address = typeof body?.address === "string" ? body.address.trim() : ""; if (!isBulkAddress(address)) throw new Error(); }
  catch { return NextResponse.json({error:"Enter a valid Solana wallet or BULK account address."},{status:400,headers}); }
  const signal = AbortSignal.any([request.signal,AbortSignal.timeout(45000)]);
  async function read(type:string,cursor?:string|null) {
    const response = await fetch("https://mainnet-api1.bulk.trade/api/v1/account",{method:"POST",cache:"no-store",signal,headers:{"Content-Type":"application/json"},body:JSON.stringify({type,user:address,...(type === "fullAccount" ? {} : {limit:5000,...(cursor?{cursor}:{})})})});
    if (!response.ok) throw new Error(response.status === 429 ? "BULK rate limit reached. Try again shortly." : response.status === 404 ? "No BULK account history was found for this address." : "BULK account data is temporarily unavailable.");
    return parse(await response.text(),null,{parseNumber:value=>value});
  }
  const [fills,funding,account] = await Promise.all([
    collectBulkHistory(cursor=>read("fills",cursor),value=>normalizeBulkFill(value,address)),
    collectBulkHistory(cursor=>read("fundingHistory",cursor),value=>normalizeBulkFunding(value,address)),
    read("fullAccount").then(value=>normalizeBulkAccount(value,address)).catch(()=>null),
  ]);
  if (fills.status === "unavailable" && funding.status === "unavailable" && !account) return NextResponse.json({error:fills.warnings[0]??"BULK activity could not be loaded."},{status:502,headers});
  try { return NextResponse.json(buildBulkReport(address,Date.now(),fills,funding,account),{headers}); }
  catch { return NextResponse.json({error:"The returned BULK records could not be reconciled. Try again shortly."},{status:502,headers}); }
}
