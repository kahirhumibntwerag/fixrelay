import { requirePrincipal } from "@/lib/auth-access";
import { errorResponse, researchEvents } from "@/lib/research";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const principal = await requirePrincipal(request);
    const url = new URL(request.url),
      campaignId = url.searchParams.get("campaign_id") || "";
    let cursor = Math.max(
      0,
      Math.min(
        Number.MAX_SAFE_INTEGER,
        Number(
          request.headers.get("last-event-id") ||
            url.searchParams.get("after") ||
            0,
        ) || 0,
      ),
    );
    let pending = await researchEvents(campaignId, principal, cursor);
    const encoder = new TextEncoder();
    let cancelled = false;
    request.signal.addEventListener(
      "abort",
      () => {
        cancelled = true;
      },
      { once: true },
    );
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const end = Date.now() + 25000;
        try {
          controller.enqueue(encoder.encode("retry: 1500\n\n"));
          while (!cancelled && Date.now() < end) {
            for (const event of pending) {
              controller.enqueue(
                encoder.encode(
                  `id: ${event.id}\nevent: research\ndata: ${JSON.stringify(event)}\n\n`,
                ),
              );
              cursor = event.id;
            }
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
            await new Promise((resolve) => setTimeout(resolve, 2000));
            if (cancelled) break;
            // Recheck current credentials on each poll: revoked keys/sessions cannot keep a stream open.
            pending = await researchEvents(
              campaignId,
              await requirePrincipal(request),
              cursor,
            );
          }
        } catch {
          if (!cancelled)
            controller.enqueue(
              encoder.encode('event: disconnected\ndata: {"retry":true}\n\n'),
            );
        } finally {
          if (!cancelled) controller.close();
        }
      },
      cancel() {
        cancelled = true;
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "private, no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
