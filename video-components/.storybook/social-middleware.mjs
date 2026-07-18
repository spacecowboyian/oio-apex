/**
 * Wires the social-draft inbox/outbox (see ../scripts/social-core.mjs)
 * directly into Storybook's own dev server — same relationship
 * render-middleware.mjs has to the batch-render tool. Nothing separate to
 * start; the "Load from inbox" / "Save for posting" actions in
 * SocialPostGenerator just hit these same-origin routes.
 */
import {
  deleteInboxBatch,
  listInbox,
  listOutbox,
  readAccounts,
  readInboxFile,
  writeOutboxBatch,
} from "../scripts/social-core.mjs";

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });

const sendJson = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
};

export const socialMiddlewarePlugin = () => ({
  name: "social-draft-middleware",
  configureServer(server) {
    const projectRoot = process.cwd();

    server.middlewares.use("/social/accounts", async (req, res) => {
      try {
        sendJson(res, 200, await readAccounts(projectRoot));
      } catch (err) {
        sendJson(res, 500, { error: String(err?.message ?? err) });
      }
    });

    server.middlewares.use("/social/inbox", async (req, res, next) => {
      if (req.method === "GET" && (req.url === "/" || req.url === "" || req.url === undefined)) {
        try {
          sendJson(res, 200, await listInbox(projectRoot));
        } catch (err) {
          sendJson(res, 500, { error: String(err?.message ?? err) });
        }
        return;
      }
      if (req.method === "DELETE") {
        const batchId = new URLSearchParams(req.url.replace(/^\//, "")).get("batch");
        if (!batchId) return sendJson(res, 400, { error: "?batch= is required" });
        try {
          await deleteInboxBatch(projectRoot, batchId);
          sendJson(res, 200, { ok: true });
        } catch (err) {
          sendJson(res, 500, { error: String(err?.message ?? err) });
        }
        return;
      }
      next();
    });

    server.middlewares.use("/social/inbox-file", async (req, res) => {
      const params = new URLSearchParams(req.url.replace(/^\//, ""));
      const batch = params.get("batch");
      const file = params.get("file");
      if (!batch || !file) return sendJson(res, 400, { error: "?batch= and ?file= are required" });
      try {
        const { data, mime } = await readInboxFile(projectRoot, batch, file);
        res.statusCode = 200;
        res.setHeader("Content-Type", mime);
        res.end(data);
      } catch (err) {
        sendJson(res, 404, { error: String(err?.message ?? err) });
      }
    });

    server.middlewares.use("/social/outbox", async (req, res, next) => {
      if (req.method === "GET") {
        try {
          sendJson(res, 200, await listOutbox(projectRoot));
        } catch (err) {
          sendJson(res, 500, { error: String(err?.message ?? err) });
        }
        return;
      }
      if (req.method === "POST") {
        try {
          const body = await readJsonBody(req);
          const manifest = await writeOutboxBatch({ projectRoot, now: new Date(), ...body });
          sendJson(res, 200, manifest);
        } catch (err) {
          sendJson(res, 400, { error: String(err?.message ?? err) });
        }
        return;
      }
      next();
    });
  },
});
