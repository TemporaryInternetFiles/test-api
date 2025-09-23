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
const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const INCREMENTS_PER_DAY = 400;
export const INCREMENT_INTERVAL_MS = Math.ceil(MS_PER_DAY / INCREMENTS_PER_DAY);

interface PersistedCounterState {
  total: number;
  lastIncrementTimestamp: number;
}

interface CounterState extends PersistedCounterState {
  initialized: boolean;
}

const counterState: CounterState = {
  total: 0,
  lastIncrementTimestamp: 0,
  initialized: false,
};

export function resetCounterState() {
  counterState.total = 0;
  counterState.lastIncrementTimestamp = 0;
  counterState.initialized = false;
}

function parsePersistedState(raw: string, now: number): PersistedCounterState {
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedCounterState>;
    if (
      typeof parsed?.total === "number" &&
      typeof parsed?.lastIncrementTimestamp === "number"
    ) {
      const clampedTimestamp = Math.min(parsed.lastIncrementTimestamp, now);
      return {
        total: parsed.total,
        lastIncrementTimestamp: clampedTimestamp,
      };
    }
  } catch {
    // Ignore JSON parse errors and fall back to numeric parsing
  }

  const numericValue = Number.parseInt(raw, 10);
  if (!Number.isNaN(numericValue)) {
    return {
      total: numericValue,
      lastIncrementTimestamp: now - INCREMENT_INTERVAL_MS,
    };
  }

  return {
    total: 0,
    lastIncrementTimestamp: now - INCREMENT_INTERVAL_MS,
  };
}

async function ensureCounterState(env: Env): Promise<void> {
  if (counterState.initialized) {
    return;
  }

  const now = Date.now();
  const raw = await env.COUNTER.get(COUNTER_KEY);
  if (typeof raw === "string") {
    const persisted = parsePersistedState(raw, now);
    counterState.total = persisted.total;
    counterState.lastIncrementTimestamp = persisted.lastIncrementTimestamp;
  } else {
    counterState.total = 0;
    counterState.lastIncrementTimestamp = now - INCREMENT_INTERVAL_MS;
  }

  counterState.initialized = true;
}

async function incrementCounter(env: Env): Promise<number> {
  await ensureCounterState(env);

  const now = Date.now();
  if (counterState.lastIncrementTimestamp === 0) {
    counterState.lastIncrementTimestamp = now - INCREMENT_INTERVAL_MS;
  }

  let incrementsDue = 0;
  if (now > counterState.lastIncrementTimestamp) {
    incrementsDue = Math.floor(
      (now - counterState.lastIncrementTimestamp) / INCREMENT_INTERVAL_MS,
    );
  }

  if (incrementsDue > 0) {
    counterState.total += incrementsDue;
    counterState.lastIncrementTimestamp += incrementsDue * INCREMENT_INTERVAL_MS;

    const payload: PersistedCounterState = {
      total: counterState.total,
      lastIncrementTimestamp: counterState.lastIncrementTimestamp,
    };
    await env.COUNTER.put(COUNTER_KEY, JSON.stringify(payload));
  }

  return counterState.total;
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

