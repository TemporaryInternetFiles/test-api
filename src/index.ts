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
export const COUNTER_CACHE_TTL = 3600; // 1 hour to reduce KV reads
export const MIN_WRITE_INTERVAL_MS = 60000; // batch writes roughly once per minute
export const BATCH_SIZE = 10;
export const MAX_WRITES_PER_DAY = 1000;

interface CounterState {
  baseValue: number;
  pending: number;
  lastPersist: number;
  writesToday: number;
  currentDay: string;
  initialized: boolean;
}

const counterState: CounterState = {
  baseValue: 0,
  pending: 0,
  lastPersist: 0,
  writesToday: 0,
  currentDay: "",
  initialized: false,
};

export function resetCounterState() {
  counterState.baseValue = 0;
  counterState.pending = 0;
  counterState.lastPersist = 0;
  counterState.writesToday = 0;
  counterState.currentDay = "";
  counterState.initialized = false;
}

async function incrementCounter(env: Env): Promise<number> {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);

  if (!counterState.initialized || counterState.currentDay !== today) {
    if (
      counterState.initialized &&
      counterState.pending > 0 &&
      counterState.writesToday < MAX_WRITES_PER_DAY
    ) {
      counterState.baseValue += counterState.pending;
      await env.COUNTER.put(COUNTER_KEY, counterState.baseValue.toString());
      counterState.pending = 0;
      counterState.writesToday += 1;
    }

    const current = parseInt(
      (await env.COUNTER.get(COUNTER_KEY, { cacheTtl: COUNTER_CACHE_TTL })) ??
        "0",
      10,
    );
    counterState.baseValue = current;
    counterState.pending = 0;
    counterState.writesToday = 0;
    counterState.currentDay = today;
    counterState.lastPersist = now;
    counterState.initialized = true;
  }

  counterState.pending += 1;

  if (
    (now - counterState.lastPersist >= MIN_WRITE_INTERVAL_MS ||
      counterState.pending >= BATCH_SIZE) &&
    counterState.writesToday < MAX_WRITES_PER_DAY
  ) {
    counterState.baseValue += counterState.pending;
    await env.COUNTER.put(COUNTER_KEY, counterState.baseValue.toString());
    counterState.pending = 0;
    counterState.lastPersist = now;
    counterState.writesToday += 1;
  }

  return counterState.baseValue + counterState.pending;
}

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

    const valuezero = 0;
    const valuerandompercent = Math.floor(Math.random() * 101);
    const valueincrement = await incrementCounter(env);
    const valueboolswitch = valueincrement % 2;
    const valuestringtext =
      valueincrement % 5 === 0
        ? "Warning OVERFLOW"
        : valuerandompercent % 2 === 0
        ? "Percentage is Even"
        : "Percentage is Odd";
    const valuestringtext2 =
      valueincrement % 5 === 0 ? null : valueboolswitch === 0 ? false : true;

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

