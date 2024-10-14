import { Hono } from "hono";

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

export default app;
