import { Router } from "express";
import type { IRouter } from "express";
import {
  listInstances,
  getInstance,
  addInstance,
  updateInstance,
  deleteInstance,
  toMasked,
} from "../lib/vault.js";
import { testAuth, invalidateToken } from "../lib/ninja-client.js";
import { auditLog } from "../lib/audit.js";
import { requireAuth } from "../middlewares/auth.js";
import { requireCsrf } from "../middlewares/csrf.js";

const router: IRouter = Router();

// All instance routes require auth
router.use(requireAuth);

// GET /api/instances
router.get("/", async (_req, res) => {
  const instances = await listInstances();
  res.json(instances.map(toMasked));
});

// POST /api/instances
router.post("/", requireCsrf, async (req, res) => {
  const { name, apiBase, authUrl, clientId, clientSecret, scope } = req.body as {
    name?: string;
    apiBase?: string;
    authUrl?: string;
    clientId?: string;
    clientSecret?: string;
    scope?: string;
  };

  if (!name || !apiBase || !authUrl || !clientId || !clientSecret) {
    res.status(400).json({ error: "name, apiBase, authUrl, clientId, clientSecret are required" });
    return;
  }

  const instance = await addInstance({
    name,
    apiBase: apiBase.replace(/\/$/, ""),
    authUrl: authUrl.replace(/\/$/, ""),
    clientId,
    clientSecret,
    scope: scope ?? "management control monitoring",
  });

  auditLog({
    action: "instance_added",
    username: req.session!.username!,
    details: { instanceId: instance.id, name },
  });

  res.status(201).json(toMasked(instance));
});

// PATCH /api/instances/:id
router.patch("/:id", requireCsrf, async (req, res) => {
  const { id } = req.params as { id: string };
  const fields = req.body as Partial<{
    name: string;
    apiBase: string;
    authUrl: string;
    clientId: string;
    clientSecret: string;
    scope: string;
  }>;

  // Strip trailing slashes from URL fields
  if (fields.apiBase) fields.apiBase = fields.apiBase.replace(/\/$/, "");
  if (fields.authUrl) fields.authUrl = fields.authUrl.replace(/\/$/, "");

  const updated = await updateInstance(id, fields);
  if (!updated) {
    res.status(404).json({ error: "Instance not found" });
    return;
  }

  // Invalidate cached token since credentials may have changed
  invalidateToken(id);

  auditLog({
    action: "instance_updated",
    username: req.session!.username!,
    details: { instanceId: id },
  });

  res.json(toMasked(updated));
});

// DELETE /api/instances/:id
router.delete("/:id", requireCsrf, async (req, res) => {
  const { id } = req.params as { id: string };
  const ok = await deleteInstance(id);
  if (!ok) {
    res.status(404).json({ error: "Instance not found" });
    return;
  }

  invalidateToken(id);

  auditLog({
    action: "instance_deleted",
    username: req.session!.username!,
    details: { instanceId: id },
  });

  res.json({ ok: true });
});

// POST /api/instances/:id/test
router.post("/:id/test", requireCsrf, async (req, res) => {
  const { id } = req.params as { id: string };
  const instance = await getInstance(id);
  if (!instance) {
    res.status(404).json({ error: "Instance not found" });
    return;
  }

  const result = await testAuth(instance);

  auditLog({
    action: "instance_tested",
    username: req.session!.username!,
    details: { instanceId: id, ok: result.ok },
  });

  res.json(result);
});

export default router;
