import { cookies } from "next/headers";

export async function getTheme(): Promise<"light" | "dark"> {
  const preference = (await cookies()).get("arcus-theme")?.value;
  return preference === "light" ? "light" : "dark";
}
