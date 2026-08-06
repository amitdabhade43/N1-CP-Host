import { Router } from "express";
import type { IRouter } from "express";
import { getInstance } from "../lib/vault.js";
import {
  searchEndUsersByEmail,
  createEndUser,
  createTechnician,
  listRoles,
  assignRole,
  findDeviceByName,
  buildDeviceUserMapping,
} from "../lib/ninja-client.js";
import type { DeviceUserRow } from "../lib/ninja-client.js";
import { auditLog } from "../lib/audit.js";
import { requireAuth } from "../middlewares/auth.js";
import { requireCsrf } from "../middlewares/csrf.js";

const router: IRouter = Router({ mergeParams: true });

// All action routes require auth
router.use(requireAuth);

async function resolveInstance(instanceId: string, res: import("express").Response) {
  const instance = await getInstance(instanceId);
  if (!instance) {
    res.status(404).json({ error: "Instance not found" });
    return null;
  }
  return instance;
}

// GET /api/actions/:instanceId/end-users/search?email=...
router.get("/end-users/search", async (req, res) => {
  const { instanceId } = req.params as { instanceId: string };
  const email = (req.query["email"] as string) ?? "";
  if (!email) {
    res.status(400).json({ error: "email query param is required" });
    return;
  }
  const instance = await resolveInstance(instanceId, res);
  if (!instance) return;

  try {
    const results = await searchEndUsersByEmail(instance, email);
    auditLog({
      action: "end_user_search",
      username: req.session!.username!,
      details: { instanceId, email },
    });
    res.json(results);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// POST /api/actions/:instanceId/end-users
router.post("/end-users", requireCsrf, async (req, res) => {
  const { instanceId } = req.params as { instanceId: string };
  const { firstName, lastName, email, roleName } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
    roleName?: string;
  };

  if (!firstName || !lastName || !email) {
    res.status(400).json({ error: "firstName, lastName, email are required" });
    return;
  }

  const instance = await resolveInstance(instanceId, res);
  if (!instance) return;

  try {
    const user = await createEndUser(instance, { firstName, lastName, email });
    let roleAssigned: boolean | null = null;
    let roleError: string | null = null;

    if (roleName) {
      try {
        const roles = await listRoles(instance);
        const role = roles.find(
          (r) => r.type === "END_USER" && r.name.toLowerCase() === roleName.toLowerCase(),
        );
        if (role) {
          await assignRole(instance, role.id, user.id);
          roleAssigned = true;
        } else {
          roleError = `Role "${roleName}" not found among END_USER roles`;
        }
      } catch (err) {
        roleError = String(err);
      }
    }

    auditLog({
      action: "end_user_created",
      username: req.session!.username!,
      details: { instanceId, email, userId: user.id },
    });

    res.status(201).json({ user, roleAssigned, roleError });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// POST /api/actions/:instanceId/technicians
router.post("/technicians", requireCsrf, async (req, res) => {
  const { instanceId } = req.params as { instanceId: string };
  const { firstName, lastName, email, roleName } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
    roleName?: string;
  };

  if (!firstName || !lastName || !email) {
    res.status(400).json({ error: "firstName, lastName, email are required" });
    return;
  }

  const instance = await resolveInstance(instanceId, res);
  if (!instance) return;

  try {
    const user = await createTechnician(instance, { firstName, lastName, email });
    let roleAssigned: boolean | null = null;
    let roleError: string | null = null;

    if (roleName) {
      try {
        const roles = await listRoles(instance);
        const role = roles.find(
          (r) => r.type === "TECHNICIAN" && r.name.toLowerCase() === roleName.toLowerCase(),
        );
        if (role) {
          await assignRole(instance, role.id, user.id);
          roleAssigned = true;
        } else {
          roleError = `Role "${roleName}" not found among TECHNICIAN roles`;
        }
      } catch (err) {
        roleError = String(err);
      }
    }

    auditLog({
      action: "technician_created",
      username: req.session!.username!,
      details: { instanceId, email, userId: user.id },
    });

    res.status(201).json({ user, roleAssigned, roleError });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// GET /api/actions/:instanceId/roles
router.get("/roles", async (req, res) => {
  const { instanceId } = req.params as { instanceId: string };
  const instance = await resolveInstance(instanceId, res);
  if (!instance) return;

  try {
    const roles = await listRoles(instance);
    res.json(roles);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// GET /api/actions/:instanceId/devices/search?name=...
router.get("/devices/search", async (req, res) => {
  const { instanceId } = req.params as { instanceId: string };
  const name = (req.query["name"] as string) ?? "";
  if (!name) {
    res.status(400).json({ error: "name query param is required" });
    return;
  }
  const instance = await resolveInstance(instanceId, res);
  if (!instance) return;

  try {
    const devices = await findDeviceByName(instance, name);
    auditLog({
      action: "device_search",
      username: req.session!.username!,
      details: { instanceId, name },
    });
    res.json(devices);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// GET /api/actions/:instanceId/device-user-mapping
router.get("/device-user-mapping", async (req, res) => {
  const { instanceId } = req.params as { instanceId: string };
  const format = (req.query["format"] as string) ?? "json";
  const instance = await resolveInstance(instanceId, res);
  if (!instance) return;

  try {
    const rows = await buildDeviceUserMapping(instance);
    auditLog({
      action: "device_user_mapping",
      username: req.session!.username!,
      details: { instanceId, format, rowCount: rows.length },
    });

    if (format === "csv") {
      const csvEscape = (val: string | number) => {
        const s = String(val);
        if (s.includes(",") || s.includes('"') || s.includes("\n")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      const header = "DeviceId,Hostname,OS,UserId,FirstName,LastName,UserEmail\n";
      const body = rows
        .map((r: DeviceUserRow) =>
          [
            csvEscape(r.deviceId),
            csvEscape(r.hostname),
            csvEscape(r.os),
            csvEscape(r.userId),
            csvEscape(r.firstName),
            csvEscape(r.lastName),
            csvEscape(r.userEmail),
          ].join(","),
        )
        .join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="device-user-mapping.csv"`,
      );
      res.send(header + body);
    } else {
      res.json(rows);
    }
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

export default router;
