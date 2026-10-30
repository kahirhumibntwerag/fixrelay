import { z } from "zod";
import { getAuth, getAuthPool } from "@/lib/auth";
import {
  requireHuman,
  assertSameOrigin,
  readAuthJson,
  authErrorResponse,
} from "@/lib/auth-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
type Consent = {
  id: string;
  clientId: string;
  scopes: string[];
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export async function GET(request: Request) {
  try {
    await requireHuman(request);
    const auth = getAuth(),
      consents = (await auth.api.getOAuthConsents({
        headers: request.headers,
      })) as Consent[] | null;
    const connections = await Promise.all(
      (consents || []).map(async (consent) => {
        let name = "Application",
          uri: string | null = null;
        try {
          const client = await auth.api.getOAuthClientPublic({
            query: { client_id: consent.clientId },
            headers: request.headers,
          });
          name = client.client_name || name;
          uri = client.client_uri || null;
        } catch {
          /* Revoked or disabled clients still need to be removable. */
        }
        return {
          id: consent.id,
          client_id: consent.clientId,
          name,
          client_uri: uri,
          scopes: consent.scopes,
          created_at: consent.createdAt,
          updated_at: consent.updatedAt,
        };
      }),
    );
    return Response.json({ connections }, { headers });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const human = await requireHuman(request);
    assertSameOrigin(request);
    const input = z
      .object({ id: z.string().min(1).max(200) })
      .parse(await readAuthJson(request));
    const consent = (await getAuth().api.getOAuthConsent({
      query: { id: input.id },
      headers: request.headers,
    })) as Consent;
    const sql = await getAuthPool().connect();
    try {
      await sql.query("BEGIN");
      // The provider's delete-consent operation only deletes the consent row.
      // Apply that deletion and revoke its user's token family atomically so
      // reconnecting the client cannot revive an old refresh token.
      const removed = await sql.query(
        'DELETE FROM "oauthConsent" WHERE id=$1 AND "userId"=$2 AND "clientId"=$3 RETURNING id',
        [input.id, human.userId, consent.clientId],
      );
      if (!removed.rowCount)
        throw Object.assign(new Error("Connection is no longer available."), {
          status: 404,
        });
      await sql.query(
        'UPDATE "oauthRefreshToken" SET revoked=now() WHERE "userId"=$1 AND "clientId"=$2 AND revoked IS NULL',
        [human.userId, consent.clientId],
      );
      await sql.query(
        'DELETE FROM "oauthAccessToken" WHERE "userId"=$1 AND "clientId"=$2',
        [human.userId, consent.clientId],
      );
      await sql.query("COMMIT");
    } catch (error) {
      await sql.query("ROLLBACK");
      throw error;
    } finally {
      sql.release();
    }
    return Response.json({ revoked: true }, { headers });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Invalid connection identifier" },
        { status: 400, headers },
      );
    return authErrorResponse(error);
  }
}
