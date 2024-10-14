import { Hono } from "hono";
import { cors } from "hono/cors";
import type { StatusCode } from "hono/utils/http-status";

const app = new Hono();
app.use(
  "*",
  cors({
    origin: "*",
    // or, if you want to allow only specific origins
    // origin: ["https://example.com"]
  })
);

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
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as any;

  if (json.url) {
    const tunnelUrl = new URL(json.url);
    json.url = `${new URL(c.req.url).origin}/tunnel/${instance.protocol}/${
      instance.api
    }${tunnelUrl.search}`;
  }

  return c.json(json, res.status as StatusCode, {
    "X-Instance": instance.api,
  });
});

app.get("/tunnel/:protocol/:instanceHost", async (c) => {
  const url = new URL(c.req.url);
  const protocol = c.req.param("protocol");
  const instanceHost = c.req.param("instanceHost");
  const instance = await getInstances().then((instances) =>
    instances.find((i) => i.protocol === protocol && i.api === instanceHost)
  );

  if (!instance) {
    return c.json(
      {
        error: "Instance not found",
      },
      404
    );
  }

  const res = await fetch(
    `${instance.protocol}://${instance.api}/tunnel${url.search}`,
    {
      headers: {
        Accept: "*/*",
      },
    }
  );

  return c.body(res.body, res.status as StatusCode, {
    "Content-Disposition": res.headers.get("content-disposition") || "",
    "X-Instance": instance.api,
  });
});

export default app;
