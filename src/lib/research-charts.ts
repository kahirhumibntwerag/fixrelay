import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getAuthPool } from "./auth";
import {
  assertResearchScope,
  requirePrincipal,
  type Principal,
} from "./auth-access";
import { toolSecuritySchemes } from "./mcp-auth";
import { oauthChallenge } from "./oauth";
import { canonicalOrigin } from "./oauth-config";

export const MAX_CHART_BYTES = 2 * 1024 * 1024;
export const MAX_CAMPAIGN_CHARTS = 30;
const uuid = z.string().uuid();
const chartFields = {
  campaign_id: uuid,
  experiment_id: uuid.optional(),
  metric_id: uuid.optional(),
  title: z.string().trim().min(1).max(200),
  caption: z.string().trim().max(6000).default(""),
  mime_type: z.enum(["image/png", "image/jpeg", "image/webp"]),
};
export const chartUploadSchema = z.object(chartFields);
export const chartMcpUploadSchema = z.object({
  ...chartFields,
  content_base64: z
    .string()
    .min(4)
    .max(Math.ceil(MAX_CHART_BYTES / 3) * 4),
  idempotency_key: z.string().min(8).max(160),
});
const chartListSchema = z.object({
  campaign_id: uuid,
  offset: z.number().int().min(0).max(1000).default(0),
  limit: z.number().int().min(1).max(30).default(30),
});
type Queryable = Pick<PoolClient, "query">;
type ChartRow = Record<string, any>;
export class ChartError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function chartErrorResponse(error: unknown) {
  if (error instanceof z.ZodError)
    return Response.json(
      {
        error: error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  const status =
    error && typeof error === "object" && "status" in error
      ? Number(error.status)
      : 500;
  return Response.json(
    {
      error:
        status < 500 && error instanceof Error
          ? error.message
          : "Unable to load or save this chart. Please retry.",
    },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

// Image signatures follow the WHATWG MIME sniffing image patterns. SVG/HTML
// are deliberately excluded because uploaded charts are rendered as images.
function assertChartDimensions(width: number, height: number) {
  if (
    !width ||
    !height ||
    width > 16384 ||
    height > 16384 ||
    width * height > 40_000_000
  )
    throw new ChartError(
      "Chart image dimensions are too large (maximum 16,384 pixels per side and 40 megapixels)",
    );
  return { width, height };
}
function jpegDimensions(bytes: Buffer) {
  // ITU-T T.81 Annex B: segments include a 2-byte length; SOF carries the
  // sample precision, height, width and component count before scan data.
  let cursor = 2;
  while (cursor < bytes.length) {
    if (bytes[cursor++] !== 0xff) break;
    while (bytes[cursor] === 0xff) cursor++;
    if (cursor >= bytes.length) break;
    const marker = bytes[cursor++];
    if (
      marker === 0xda ||
      marker === 0xd9 ||
      marker === 0xd8 ||
      marker === 0x00
    )
      break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (cursor + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(cursor);
    if (length < 2 || cursor + length > bytes.length) break;
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      if (length < 8) break;
      const components = bytes[cursor + 7];
      if (!components || length < 8 + 3 * components) break;
      return assertChartDimensions(
        bytes.readUInt16BE(cursor + 5),
        bytes.readUInt16BE(cursor + 3),
      );
    }
    cursor += length;
  }
  throw new ChartError(
    "JPEG image has a malformed or missing dimension header",
  );
}
function webpDimensions(bytes: Buffer) {
  // Google WebP container specification: validate each RIFF chunk boundary,
  // the VP8X canvas and the VP8/VP8L coded image dimensions before storage.
  let cursor = 12;
  let canvas: { width: number; height: number } | undefined;
  let image: { width: number; height: number } | undefined;
  while (cursor + 8 <= bytes.length) {
    const tag = bytes.toString("ascii", cursor, cursor + 4);
    const length = bytes.readUInt32LE(cursor + 4);
    const start = cursor + 8,
      end = start + length;
    if (end > bytes.length || end + (length % 2) > bytes.length)
      throw new ChartError("WebP image has a truncated chunk");
    if (tag === "VP8X") {
      if (cursor !== 12 || canvas || length !== 10)
        throw new ChartError("WebP image has an invalid canvas header");
      if (bytes[start] & 2)
        throw new ChartError(
          "Upload a still WebP chart rather than an animation",
        );
      canvas = assertChartDimensions(
        bytes.readUIntLE(start + 4, 3) + 1,
        bytes.readUIntLE(start + 7, 3) + 1,
      );
    } else if (tag === "VP8 ") {
      if (
        image ||
        length < 10 ||
        bytes[start] & 1 ||
        !bytes
          .subarray(start + 3, start + 6)
          .equals(Buffer.from([0x9d, 0x01, 0x2a]))
      )
        throw new ChartError("WebP image has an invalid VP8 frame header");
      image = assertChartDimensions(
        bytes.readUInt16LE(start + 6) & 0x3fff,
        bytes.readUInt16LE(start + 8) & 0x3fff,
      );
    } else if (tag === "VP8L") {
      if (image || length < 5 || bytes[start] !== 0x2f)
        throw new ChartError("WebP image has an invalid lossless frame header");
      const bits = bytes.readUInt32LE(start + 1);
      if (bits >>> 29)
        throw new ChartError("WebP image has an unsupported lossless version");
      image = assertChartDimensions(
        (bits & 0x3fff) + 1,
        ((bits >>> 14) & 0x3fff) + 1,
      );
    } else if (tag === "ANIM" || tag === "ANMF") {
      throw new ChartError(
        "Upload a still WebP chart rather than an animation",
      );
    }
    cursor = end + (length % 2);
  }
  if (
    cursor !== bytes.length ||
    !image ||
    (canvas && (canvas.width !== image.width || canvas.height !== image.height))
  )
    throw new ChartError("WebP image has malformed or missing dimensions");
  return canvas || image;
}
export function validateChartImage(bytes: Buffer, claimedType: string) {
  if (!bytes.length || bytes.length > MAX_CHART_BYTES)
    throw new ChartError("Charts must be between 1 byte and 2 MiB", 413);
  let mime: string | undefined;
  if (
    bytes.length >= 33 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.toString("ascii", 12, 16) === "IHDR" &&
    bytes.readUInt32BE(8) === 13
  ) {
    const width = bytes.readUInt32BE(16),
      height = bytes.readUInt32BE(20);
    assertChartDimensions(width, height);
    mime = "image/png";
  } else if (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  ) {
    jpegDimensions(bytes);
    mime = "image/jpeg";
  } else if (
    bytes.length >= 20 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP" &&
    bytes.toString("ascii", 12, 15) === "VP8" &&
    bytes.readUInt32LE(4) + 8 === bytes.length
  ) {
    webpDimensions(bytes);
    mime = "image/webp";
  }
  if (!mime || mime !== claimedType)
    throw new ChartError(
      "Upload a PNG, JPEG, or WebP image whose content matches its file type",
    );
  return mime;
}

async function chartAccess(
  sql: Queryable,
  campaignId: string,
  principal: Principal,
  write = false,
) {
  assertResearchScope(principal, write);
  uuid.parse(campaignId);
  if (
    principal.kind === "agent" &&
    principal.campaignId &&
    principal.campaignId !== campaignId
  )
    throw new ChartError(
      "Agent credential is scoped to a different campaign",
      403,
    );
  const { rows } = await sql.query(
    "SELECT role FROM research_campaign_members WHERE campaign_id=$1 AND user_id=$2",
    [campaignId, principal.userId],
  );
  if (!rows[0] || (write && rows[0].role === "viewer"))
    throw new ChartError("Campaign not found or access denied", 403);
  return rows[0].role as string;
}
const publicCondition =
  "c.published_at IS NOT NULL AND p.visibility='public' AND (c.experiment_id IS NULL OR e.visibility='public')";
const metadataColumns = `c.id,c.campaign_id,c.experiment_id,c.metric_id,c.title,c.caption,c.mime_type,c.byte_size,c.sha256,c.published_at,c.created_at,(${publicCondition}) AS is_public`;
function metadata(row: ChartRow): ChartRow & { url: string } {
  return { ...row, url: `/api/research/charts/${row.id}` };
}
async function chartMetadata(sql: Queryable, id: string) {
  const { rows } = await sql.query(
    `SELECT ${metadataColumns} FROM research_charts c JOIN campaigns p ON p.id=c.campaign_id LEFT JOIN experiments e ON e.id=c.experiment_id WHERE c.id=$1`,
    [id],
  );
  if (!rows[0]) throw new ChartError("Chart not found", 404);
  return metadata(rows[0]);
}
export async function listResearchCharts(
  campaignId: string,
  principal: Principal,
  offset = 0,
  limit = 30,
) {
  const p = chartListSchema.parse({ campaign_id: campaignId, offset, limit });
  await chartAccess(getAuthPool(), p.campaign_id, principal);
  return queryCharts(p.campaign_id, p.offset, p.limit, false);
}
export async function listPublicResearchCharts(
  campaignId: string,
  offset = 0,
  limit = 30,
) {
  const p = chartListSchema.parse({ campaign_id: campaignId, offset, limit });
  return queryCharts(p.campaign_id, p.offset, p.limit, true);
}
async function queryCharts(
  campaignId: string,
  offset: number,
  limit: number,
  onlyPublic: boolean,
) {
  const { rows } = await getAuthPool().query(
    `SELECT ${metadataColumns} FROM research_charts c JOIN campaigns p ON p.id=c.campaign_id LEFT JOIN experiments e ON e.id=c.experiment_id WHERE c.campaign_id=$1 ${onlyPublic ? `AND ${publicCondition}` : ""} ORDER BY c.created_at,c.id OFFSET $2 LIMIT $3`,
    [campaignId, offset, limit + 1],
  );
  return {
    charts: rows.slice(0, limit).map(metadata),
    next_offset: rows.length > limit ? offset + limit : null,
  };
}

export async function uploadResearchChart(
  input: unknown,
  bytes: Buffer,
  principal: Principal,
  idempotencyKey: string,
) {
  assertResearchScope(principal, true);
  const p = chartUploadSchema.parse(input);
  const key = z.string().min(8).max(160).parse(idempotencyKey);
  validateChartImage(bytes, p.mime_type);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(["upload_chart", p, sha256]))
    .digest("hex");
  const sql = await getAuthPool().connect();
  try {
    await sql.query("BEGIN");
    await sql.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      principal.userId + ":" + key,
    ]);
    await chartAccess(sql, p.campaign_id, principal, true);
    const previous = await sql.query(
      "SELECT fingerprint,response FROM research_mutations WHERE user_id=$1 AND idempotency_key=$2",
      [principal.userId, key],
    );
    if (previous.rows[0]) {
      if (previous.rows[0].fingerprint !== fingerprint)
        throw new ChartError(
          "Idempotency key was already used for different input",
          409,
        );
      const response = {
        chart: await chartMetadata(sql, previous.rows[0].response.chart.id),
        replayed: true,
      };
      await sql.query("COMMIT");
      return response;
    }
    const quota = await sql.query(
      `INSERT INTO write_quotas(key,window_start,count) VALUES($1,date_trunc('hour',now()),1) ON CONFLICT(key,window_start) DO UPDATE SET count=write_quotas.count+1 RETURNING count`,
      ["research:" + principal.userId],
    );
    if (quota.rows[0].count > 1500)
      throw new ChartError("Hourly research write limit reached", 429);
    await sql.query("SELECT id FROM campaigns WHERE id=$1 FOR UPDATE", [
      p.campaign_id,
    ]);
    const count = await sql.query(
      "SELECT count(*)::int AS count FROM research_charts WHERE campaign_id=$1",
      [p.campaign_id],
    );
    if (count.rows[0].count >= MAX_CAMPAIGN_CHARTS)
      throw new ChartError(
        "A campaign can contain up to 30 uploaded charts",
        409,
      );
    if (p.experiment_id) {
      const found = await sql.query(
        "SELECT id FROM experiments WHERE id=$1 AND campaign_id=$2",
        [p.experiment_id, p.campaign_id],
      );
      if (!found.rows[0])
        throw new ChartError(
          "Experiment does not belong to this campaign",
          404,
        );
    }
    if (p.metric_id) {
      const found = await sql.query(
        "SELECT id FROM research_metrics WHERE id=$1 AND campaign_id=$2",
        [p.metric_id, p.campaign_id],
      );
      if (!found.rows[0])
        throw new ChartError("Metric does not belong to this campaign", 404);
    }
    const inserted = await sql.query(
      `INSERT INTO research_charts(campaign_id,experiment_id,metric_id,title,caption,mime_type,image,byte_size,sha256,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        p.campaign_id,
        p.experiment_id || null,
        p.metric_id || null,
        p.title,
        p.caption,
        p.mime_type,
        bytes,
        bytes.length,
        sha256,
        principal.userId,
      ],
    );
    const chart = await chartMetadata(sql, inserted.rows[0].id);
    await sql.query(
      `INSERT INTO research_events(campaign_id,entity_id,event_type,actor,actor_user_id,description,payload) VALUES($1,$2,'upload_chart',$3,$4,$5,$6)`,
      [
        p.campaign_id,
        chart.id,
        principal.name,
        principal.userId,
        `Chart uploaded: ${p.title}`,
        JSON.stringify({ chart }),
      ],
    );
    await sql.query(
      "INSERT INTO research_mutations(user_id,idempotency_key,fingerprint,response) VALUES($1,$2,$3,$4)",
      [principal.userId, key, fingerprint, JSON.stringify({ chart })],
    );
    await sql.query("COMMIT");
    return { chart, replayed: false };
  } catch (error) {
    await sql.query("ROLLBACK");
    throw error;
  } finally {
    sql.release();
  }
}

export async function publishResearchCharts(
  sql: Queryable,
  campaignId: string,
  chartIds: string[],
  selectedExperimentIds: string[],
) {
  uuid.parse(campaignId);
  const ids = [...new Set(z.array(uuid).max(30).parse(chartIds))];
  if (!ids.length) return [];
  const { rows } = await sql.query(
    `SELECT c.id,c.experiment_id,e.visibility FROM research_charts c LEFT JOIN experiments e ON e.id=c.experiment_id WHERE c.campaign_id=$1 AND c.id=ANY($2::uuid[])`,
    [campaignId, ids],
  );
  if (rows.length !== ids.length)
    throw new ChartError(
      "A selected chart does not belong to this campaign",
      404,
    );
  if (
    rows.some(
      (row) =>
        row.experiment_id &&
        row.visibility !== "public" &&
        !selectedExperimentIds.includes(row.experiment_id),
    )
  )
    throw new ChartError(
      "Publish a chart's linked experiment before sharing the chart",
      400,
    );
  await sql.query(
    "UPDATE research_charts SET published_at=coalesce(published_at,now()) WHERE campaign_id=$1 AND id=ANY($2::uuid[])",
    [campaignId, ids],
  );
  return ids;
}

export async function researchChartImage(id: string, request: Request) {
  uuid.parse(id);
  const { rows } = await getAuthPool().query(
    `SELECT ${metadataColumns} FROM research_charts c JOIN campaigns p ON p.id=c.campaign_id LEFT JOIN experiments e ON e.id=c.experiment_id WHERE c.id=$1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw new ChartError("Chart not found", 404);
  if (!row.is_public)
    await chartAccess(
      getAuthPool(),
      row.campaign_id,
      await requirePrincipal(request),
    );
  const stored = await getAuthPool().query(
    "SELECT image FROM research_charts WHERE id=$1",
    [id],
  );
  if (!stored.rows[0]) throw new ChartError("Chart not found", 404);
  const extension =
    row.mime_type === "image/jpeg"
      ? "jpg"
      : row.mime_type === "image/webp"
        ? "webp"
        : "png";
  return new Response(new Uint8Array(stored.rows[0].image), {
    headers: {
      "Content-Type": row.mime_type,
      "Content-Length": String(row.byte_size),
      "Content-Disposition": `inline; filename="chart-${id}.${extension}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      Vary: "Cookie, Authorization",
    },
  });
}

function reply(value: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}
function mcpChartMetadata(chart: ChartRow, compact = false) {
  const caption = String(chart.caption || "");
  return {
    ...chart,
    url: new URL(String(chart.url), canonicalOrigin()).toString(),
    ...(compact && caption.length > 240
      ? { caption: caption.slice(0, 240) + "…", caption_truncated: true }
      : {}),
  };
}
export function registerResearchChartTools(
  server: McpServer,
  request: Request,
  verifiedPrincipal?: Principal,
) {
  const principal = () =>
    verifiedPrincipal
      ? Promise.resolve(verifiedPrincipal)
      : requirePrincipal(request);
  async function guarded(
    operation: () => Promise<Record<string, unknown>>,
    compact = false,
  ) {
    try {
      const value = await operation();
      return reply({
        ...value,
        ...(value.chart && typeof value.chart === "object"
          ? { chart: mcpChartMetadata(value.chart as ChartRow, compact) }
          : {}),
        ...(Array.isArray(value.charts)
          ? {
              charts: value.charts.map((chart: ChartRow) =>
                mcpChartMetadata(chart, compact),
              ),
            }
          : {}),
      });
    } catch (error) {
      const status =
        error instanceof z.ZodError
          ? 400
          : error && typeof error === "object" && "status" in error
            ? Number(error.status)
            : 500;
      const message =
        status < 500 && error instanceof Error
          ? error.message
          : "Unable to load or save this chart. Please retry.";
      const oauthScope =
        error && typeof error === "object" && "oauthScope" in error
          ? String(error.oauthScope)
          : "research:read";
      const challenge =
        status === 401 ||
        (status === 403 &&
          error &&
          typeof error === "object" &&
          "oauthScope" in error);
      return {
        ...reply({ error: message, status }),
        isError: true,
        ...(challenge
          ? {
              _meta: {
                "mcp/www_authenticate": [
                  oauthChallenge(
                    oauthScope,
                    status === 403 ? "insufficient_scope" : "invalid_token",
                  ),
                ],
              },
            }
          : {}),
      };
    }
  }
  server.registerTool(
    "upload_chart",
    {
      description:
        "Upload a PNG, JPEG, or WebP chart (up to 2 MiB) to a campaign. Supply standard base64 image bytes, a title and optional caption, experiment and metric links. Uploads remain private until explicitly included in publish_campaign.chart_ids. RogNet preserves the original image and SHA-256 checksum; it never executes image content.",
      inputSchema: chartMcpUploadSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { securitySchemes: toolSecuritySchemes("upload_chart") },
    },
    (input) =>
      guarded(async () => {
        const { content_base64, idempotency_key, ...fields } = input;
        if (content_base64.length % 4 !== 0)
          throw new ChartError(
            "Use standard base64 image bytes without a data URL prefix",
          );
        const bytes = Buffer.from(content_base64, "base64");
        // Canonical round-tripping rejects ignored characters, data URLs,
        // whitespace and padding errors without a recursive multi-MiB regexp.
        if (bytes.toString("base64") !== content_base64)
          throw new ChartError("Image content is not valid canonical base64");
        return uploadResearchChart(
          fields,
          bytes,
          await principal(),
          idempotency_key,
        );
      }),
  );
  server.registerTool(
    "list_charts",
    {
      description:
        "List up to 10 chart summaries visible to your account. Captions longer than 240 characters are shortened and marked caption_truncated; the dashboard shows full captions. Image URLs require the same campaign access unless the owner explicitly published the chart.",
      inputSchema: chartListSchema.extend({ limit: z.number().int().min(1).max(10).default(10) }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: { securitySchemes: toolSecuritySchemes("list_charts") },
    },
    ({ campaign_id, offset, limit }) =>
      guarded(async () =>
        listResearchCharts(campaign_id, await principal(), offset, limit),
        true,
      ),
  );
  server.registerTool(
    "list_public_charts",
    {
      description:
        "List explicitly published charts of a public campaign, without account linking. Returns up to 10 chart summaries with image URLs, optional metric/experiment links and SHA-256 checksums. Captions longer than 240 characters are shortened and marked caption_truncated. Private and unselected charts are never included.",
      inputSchema: z.object({
        campaign_id: uuid,
        offset: z.number().int().min(0).max(1000).default(0),
        limit: z.number().int().min(1).max(10).default(10),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: { securitySchemes: [{ type: "noauth" }] },
    },
    ({ campaign_id, offset, limit }) =>
      guarded(
        async () => listPublicResearchCharts(campaign_id, offset, limit),
        true,
      ),
  );
}
