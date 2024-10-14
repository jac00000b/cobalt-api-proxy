import { Hono } from "hono";
import type { StatusCode } from "hono/utils/http-status";

const app = new Hono();

type Instance = {
  trust: string;
  api_online: boolean;
  cors: number;
  frontend_online: boolean;
  commit: string;
  services: Record<string, boolean>;
  version: string;
  branch: string;
  score: number;
  protocol: string;
  turnstile: boolean;
  name: string;
  startTime: number;
  api: string;
  frontEnd: string;
};

async function getInstances() {
  const data = await fetch("https://instances.hyper.lol/instances.json", {
    headers: {
      "User-Agent":
        "Cobalt API Proxy (https://github.com/jac00000b/cobalt-api-proxy)",
    },
    cf: {
      cacheTtl: 60 * 30,
      cacheEverything: true,
    },
  });

  return ((await data.json()) as Instance[]).filter(
    (instance) =>
      instance.api_online &&
      !instance.turnstile &&
      instance.version.startsWith("10")
  );
}

function extractDomain(urlString: string): string {
  const url = new URL(urlString);
  const hostname = url.hostname;

  const parts = hostname.split(".");

  parts.pop();

  if (parts.length > 2) {
    parts.shift();
  }

  const domain = parts.join(".");

  return domain;
}

function randomInstance(instances: Instance[]) {
  return instances[Math.floor(Math.random() * instances.length)];
}

app.get("/", async (c) => {
  const instances = await getInstances();
  const latestInstance = instances.reduce((latest, instance) => {
    return instance.version > latest.version ? instance : latest;
  }, instances[0]);

  return c.json({
    cobalt: {
      version: latestInstance.version,
      url: new URL(c.req.url).origin,
      startTime: new Date().getTime(),
      durationLimit: 10800,
      services: [
        ...new Set(
          instances.flatMap((instance) =>
            Object.keys(instance.services).filter(
              (service) => instance.services[service]
            )
          )
        ),
      ],
    },
    git: {
      branch: "main",
      commit: "unknown",
      remote: "jac00000b/cobalt-api-proxy",
    },
  });
});

app.post("/", async (c) => {
  const body = await c.req.json();
  const instances = await getInstances();
  let instance = randomInstance(instances);

  try {
    const service = extractDomain(body.url);
    const suitableInstances = instances.filter(
      (instance) => instance.services[service]
    );

    if (suitableInstances.length > 0)
      instance = randomInstance(suitableInstances);
  } catch (e) {
    console.warn("Failed to find suitable instance, using random", e);
  }

  const res = await fetch(`${instance.protocol}://${instance.api}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return c.body(res.body, res.status as StatusCode, {
    "Content-Type": "application/json",
    "X-Instance": instance.api,
  });
});

export default app;
