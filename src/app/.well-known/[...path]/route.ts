import { getAuth } from "@/lib/auth";
import { authErrorResponse } from "@/lib/auth-access";
import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const metadataPaths = new Set([
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/mcp",
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-authorization-server/api/auth",
  "/.well-known/openid-configuration",
  "/.well-known/openid-configuration/api/auth",
]);
export async function GET(request: Request) {
  if (!metadataPaths.has(new URL(request.url).pathname))
    return new Response("Not found", { status: 404 });
  try {
    const pathname = new URL(request.url).pathname;
    if (pathname.includes("/oauth-authorization-server"))
      return await oauthProviderAuthServerMetadata(getAuth())(request);
    if (pathname.includes("/openid-configuration"))
      return await oauthProviderOpenIdConfigMetadata(getAuth())(request);
    return await getAuth().handler(request);
  } catch (error) {
    return authErrorResponse(error);
  }
}
