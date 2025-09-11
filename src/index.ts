const ENABLE_TRACKING_LOG = false;
const ENABLE_USER_AGENT_LOG = false;

const trackingLog: Array<{
  ts: string;
  ip: string;
  method: string;
  uri: string;
  trackingId: string | null;
}> = [];
const userAgents = new Set<string>();

interface Env {
  COUNTER: KVNamespace;
}

const COUNTER_KEY = "counter";

function getClientIp(request: Request): string {
  const headers = request.headers;
  const candidates = ["CF-Connecting-IP", "X-Forwarded-For", "X-Real-IP"];
  for (const name of candidates) {
    const val = headers.get(name);
    if (val) {
      if (name === "X-Forwarded-For") {
        return val.split(",")[0].trim();
      }
      return val;
    }
  }
  return "unknown";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestHeaders: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      requestHeaders[key] = value;
    });

    const responseTestHeaders: Record<string, string> = {};
    for (const [name, value] of Object.entries(requestHeaders)) {
      if (name.toLowerCase().startsWith("x-responsetest")) {
        responseTestHeaders[name] = value;
      }
    }

    const trackingId = request.headers.get("X-Api-Monitor-TrackingId");
    if (ENABLE_TRACKING_LOG) {
      const url = new URL(request.url);
      trackingLog.push({
        ts: new Date().toISOString(),
        ip: getClientIp(request),
        method: request.method,
        uri: url.pathname + url.search,
        trackingId,
      });
    }

    const userAgent = request.headers.get("User-Agent");
    if (ENABLE_USER_AGENT_LOG && userAgent) {
      userAgents.add(userAgent);
    }

    // Use a cacheTtl of 0 to avoid stale reads from the edge cache.
    // Without this, KV can return an outdated value for up to 60 seconds,
    // causing the counter to unexpectedly reset.
    let counter = parseInt(
      (await env.COUNTER.get(COUNTER_KEY, { cacheTtl: 0 })) ?? "0",
      10,
    );
    counter++;
    await env.COUNTER.put(COUNTER_KEY, counter.toString());

    const valuezero = 0;
    const valuerandompercent = Math.floor(Math.random() * 101);
    const valueincrement = counter;
    const valueboolswitch = counter % 2;
    const valuestringtext =
      counter % 5 === 0
        ? "Warning OVERFLOW"
        : valuerandompercent % 2 === 0
        ? "Percentage is Even"
        : "Percentage is Odd";
    const valuestringtext2 =
      counter % 5 === 0 ? null : valueboolswitch === 0 ? false : true;

    const headers = new Headers();
    headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    headers.set("Expires", "0");
    headers.set("Content-Type", "application/json");
    headers.set("Test", valuezero.toString());
    headers.set("Test-RandPerc", valuerandompercent.toString());
    headers.set("Test-RandPercText", valuestringtext);
    headers.set("Test-Increment", valueincrement.toString());
    headers.set("Test-Bool", valueboolswitch.toString());
    headers.set(
      "Test-BoolText",
      valuestringtext2 === null
        ? ""
        : valuestringtext2
        ? "true"
        : "false",
    );
    headers.set("valuepair", "0;1");
    headers.set("valuepair1", "0; 1");
    headers.set("valuepair2", "42; 230; 77; 45;");
    headers.set("valuepairspace", "23 421");

    request.headers.forEach((value, name) => {
      if (name.toLowerCase().startsWith("x-test")) {
        headers.set(name, value);
      }
    });

    const data = {
      status: "success",
      message: "This is a sample response",
      received_headers: requestHeaders,
      response_test_headers: responseTestHeaders,
      trackingId,
      clientIp: getClientIp(request),
      timestamp: new Date().toISOString(),
      valuezero,
      valuerandompercent,
      valuerandompercentstring: valuestringtext,
      valueincrement,
      valueboolswitch,
      valueboolswitchtext: valuestringtext2,
      valueempty: "",
      valuearray: [1, 2, 43],
      dummyuser: [
        { jmeno: "jarda", vek: 45 },
        { jmeno: "honza", vek: 40 },
      ],
      longvalue:
        "Lorem ipsum dolor sit amet, consectetur adipisici elit, sed eiusmod tempor incidunt ut labore et dolore magna aliqua...",
      example: { key1: "value1", key2: "value2" },
    };

    return new Response(JSON.stringify(data, null, 2), { headers });
  },
} satisfies ExportedHandler<Env>;

