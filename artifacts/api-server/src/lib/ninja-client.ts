import type { Instance } from "./vault.js";

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

interface NinjaDevice {
  id: number;
  systemName: string;
  os?: unknown;
  [key: string]: unknown;
}

interface NinjaEndUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  accessibleDeviceIds: number[];
  [key: string]: unknown;
}

interface NinjaRole {
  id: number;
  name: string;
  type: "END_USER" | "TECHNICIAN" | string;
}

interface NinjaTokenResponse {
  access_token?: string;
  expires_in?: number;
}

export interface DeviceUserRow {
  deviceId: number | string;
  hostname: string;
  os: string;
  userId: number;
  firstName: string;
  lastName: string;
  userEmail: string;
}

export interface CreateUserBody {
  firstName: string;
  lastName: string;
  email: string;
}

const tokenCache = new Map<string, TokenCache>();

async function getAccessToken(instance: Instance): Promise<string> {
  const cached = tokenCache.get(instance.id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }

  const tokenUrl = `${instance.authUrl}/ws/oauth/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: instance.clientId,
    client_secret: instance.clientSecret,
    scope: instance.scope,
  });

  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (err) {
    throw new Error(`NinjaOne auth request failed: ${String(err)}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`NinjaOne auth failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as NinjaTokenResponse;
  if (!data.access_token) {
    throw new Error("NinjaOne auth response missing access_token");
  }

  const expiresIn = data.expires_in ?? 3600;
  tokenCache.set(instance.id, {
    accessToken: data.access_token,
    expiresAt: Date.now() + (expiresIn - 30) * 1000,
  });

  return data.access_token;
}

export function invalidateToken(instanceId: string): void {
  tokenCache.delete(instanceId);
}

async function ninjaFetch<T>(
  instance: Instance,
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<T> {
  const token = await getAccessToken(instance);
  const url = `${instance.apiBase}${urlPath}`;

  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };

  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url, opts);
  } catch (err) {
    throw new Error(`NinjaOne request to ${urlPath} failed: ${String(err)}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`NinjaOne API error (${response.status}) at ${method} ${urlPath}: ${text}`);
  }

  // 204 No Content
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

export async function testAuth(instance: Instance): Promise<{ ok: boolean; message: string }> {
  try {
    // Force a fresh token fetch
    tokenCache.delete(instance.id);
    await getAccessToken(instance);
    return { ok: true, message: "Authentication successful" };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}

export async function listAllDevices(instance: Instance): Promise<NinjaDevice[]> {
  const pageSize = 1000;
  const devices: NinjaDevice[] = [];
  let after = 0;

  while (true) {
    const page = await ninjaFetch<NinjaDevice[]>(
      instance,
      "GET",
      `/v2/devices?pageSize=${pageSize}&after=${after}`,
    );
    if (!Array.isArray(page) || page.length === 0) break;
    devices.push(...page);
    if (page.length < pageSize) break;
    after = page[page.length - 1]!.id;
  }

  return devices;
}

export async function findDeviceByName(
  instance: Instance,
  name: string,
): Promise<NinjaDevice[]> {
  const all = await listAllDevices(instance);
  const lower = name.toLowerCase();

  // Exact match first
  const exact = all.filter((d) => d.systemName.toLowerCase() === lower);
  if (exact.length > 0) return exact;

  // Substring fallback
  return all.filter((d) => d.systemName.toLowerCase().includes(lower));
}

export async function listEndUsers(instance: Instance): Promise<NinjaEndUser[]> {
  return ninjaFetch<NinjaEndUser[]>(instance, "GET", "/v2/user/end-users");
}

export async function searchEndUsersByEmail(
  instance: Instance,
  email: string,
): Promise<NinjaEndUser[]> {
  const all = await listEndUsers(instance);
  const lower = email.toLowerCase();
  return all.filter((u) => u.email.toLowerCase().includes(lower));
}

export async function createEndUser(
  instance: Instance,
  body: CreateUserBody,
): Promise<NinjaEndUser> {
  return ninjaFetch<NinjaEndUser>(
    instance,
    "POST",
    "/v2/user/end-users?sendInvitation=false",
    body,
  );
}

export async function createTechnician(
  instance: Instance,
  body: CreateUserBody,
): Promise<NinjaEndUser> {
  return ninjaFetch<NinjaEndUser>(
    instance,
    "POST",
    "/v2/user/technicians?sendInvitation=false",
    body,
  );
}

export async function listRoles(instance: Instance): Promise<NinjaRole[]> {
  return ninjaFetch<NinjaRole[]>(instance, "GET", "/v2/user/roles");
}

export async function assignRole(
  instance: Instance,
  roleId: number,
  userId: number,
): Promise<unknown> {
  return ninjaFetch<unknown>(instance, "PATCH", `/v2/user/role/${roleId}/add-members`, [userId]);
}

export async function buildDeviceUserMapping(instance: Instance): Promise<DeviceUserRow[]> {
  const [devices, users] = await Promise.all([listAllDevices(instance), listEndUsers(instance)]);

  const deviceMap = new Map<number, NinjaDevice>();
  for (const d of devices) {
    deviceMap.set(d.id, d);
  }

  const rows: DeviceUserRow[] = [];
  for (const user of users) {
    const deviceIds = user.accessibleDeviceIds ?? [];
    if (deviceIds.length === 0) {
      // User with no devices — still include a row
      rows.push({
        deviceId: "",
        hostname: "(no devices)",
        os: "",
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        userEmail: user.email,
      });
      continue;
    }
    for (const dId of deviceIds) {
      const device = deviceMap.get(dId);
      rows.push({
        deviceId: dId,
        hostname: device ? device.systemName : "(device not found)",
        os: device ? String(device.os ?? "") : "",
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        userEmail: user.email,
      });
    }
  }
  return rows;
}
