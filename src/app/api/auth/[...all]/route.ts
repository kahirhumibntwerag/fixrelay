import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";
import { authErrorResponse } from "@/lib/auth-access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    return await toNextJsHandler(getAuth()).GET(request);
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    // OAuth token exchanges are form-encoded, while sign-in and consent are
    // JSON. Bound the original bytes and let Better Auth parse the media type.
    const reader = request.body?.getReader();
    if (!reader)
      return Response.json({ error: "Request body required" }, { status: 400 });
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 100000) {
        await reader.cancel();
        return Response.json({ error: "Request too large" }, { status: 413 });
      }
      chunks.push(value);
    }
    const bounded = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: Buffer.concat(chunks),
    });
    return await toNextJsHandler(getAuth()).POST(bounded);
  } catch (error) {
    return authErrorResponse(error);
  }
}
