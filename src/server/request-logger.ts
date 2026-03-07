import { logger } from "./logger";

type RouteHandler = (req: Request) => Response | Promise<Response>;

function serverErrorResponse() {
  return new Response(JSON.stringify({ error: "Server error" }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}

export function withRequestLogging(
  name: string,
  handler: RouteHandler,
): RouteHandler {
  return async (req: Request) => {
    const reqId =
      req.headers.get("x-request-id") ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

    const start = performance.now();
    const requestLogger = logger.child({
      reqId,
      route: name,
      req: {
        method: req.method,
        url: req.url,
        headers: {
          authorization: req.headers.get("authorization"),
          cookie: req.headers.get("cookie"),
          "set-cookie": req.headers.get("set-cookie"),
        },
      },
    });

    requestLogger.info("request.start");

    try {
      const response = await handler(req);
      requestLogger.info(
        {
          statusCode: response.status,
          durationMs: Math.round((performance.now() - start) * 100) / 100,
        },
        "request.end",
      );
      return response;
    } catch (error) {
      requestLogger.error(
        {
          err: error,
          durationMs: Math.round((performance.now() - start) * 100) / 100,
        },
        "request.error",
      );
      return serverErrorResponse();
    }
  };
}
