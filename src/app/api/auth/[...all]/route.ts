import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";
import { authErrorResponse, readAuthJson } from "@/lib/auth-access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try { return await toNextJsHandler(getAuth()).GET(request); }
  catch (error) { return authErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = await readAuthJson(request);
    const bounded = new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body) });
    return await toNextJsHandler(getAuth()).POST(bounded);
  } catch (error) { return authErrorResponse(error); }
}
