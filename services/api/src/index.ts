import { loadLocalEnv } from "./env.js";
import { createApp } from "./server.js";

loadLocalEnv();

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";

const app = await createApp();
await app.listen({ host, port });

app.log.info(`Correction Notebook API listening on http://${host}:${port}`);
