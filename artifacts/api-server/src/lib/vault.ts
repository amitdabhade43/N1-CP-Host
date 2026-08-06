import crypto from "crypto";
import fs from "fs";
import path from "path";
import { DATA_DIR } from "./paths.js";

const SALT_FILE = path.join(DATA_DIR, "vault.salt");
const VAULT_FILE = path.join(DATA_DIR, "vault.enc.json");
const ADMIN_FILE = path.join(DATA_DIR, "admin-users.json");

export interface Instance {
  id: string;
  name: string;
  apiBase: string;
  authUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  createdAt: string;
}

export interface MaskedInstance {
  id: string;
  name: string;
  apiBase: string;
  authUrl: string;
  clientIdMasked: string;
  scope: string;
  createdAt: string;
}

interface VaultData {
  instances: Record<string, Instance>;
}

interface EncryptedBlob {
  iv: string;
  authTag: string;
  ciphertext: string;
}

interface AdminUser {
  username: string;
  passwordHash: string;
}

interface AdminStore {
  users: AdminUser[];
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadSalt(): Buffer {
  ensureDataDir();
  if (fs.existsSync(SALT_FILE)) {
    return Buffer.from(fs.readFileSync(SALT_FILE, "utf8").trim(), "hex");
  }
  const salt = crypto.randomBytes(32);
  fs.writeFileSync(SALT_FILE, salt.toString("hex"), { encoding: "utf8", mode: 0o600 });
  return salt;
}

async function deriveKey(masterKey: string, salt: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(masterKey, salt, 32, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

function encrypt(plaintext: string, key: Buffer): EncryptedBlob {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
    ciphertext: ct.toString("hex"),
  };
}

function decrypt(blob: EncryptedBlob, key: Buffer): string {
  const iv = Buffer.from(blob.iv, "hex");
  const authTag = Buffer.from(blob.authTag, "hex");
  const ct = Buffer.from(blob.ciphertext, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

function maskClientId(clientId: string): string {
  if (clientId.length <= 6) return "***";
  return clientId.slice(0, 3) + "*".repeat(clientId.length - 6) + clientId.slice(-3);
}

export function toMasked(instance: Instance): MaskedInstance {
  return {
    id: instance.id,
    name: instance.name,
    apiBase: instance.apiBase,
    authUrl: instance.authUrl,
    clientIdMasked: maskClientId(instance.clientId),
    scope: instance.scope,
    createdAt: instance.createdAt,
  };
}

// --- Vault operations ---

let _cachedKey: Buffer | null = null;

async function getKey(): Promise<Buffer> {
  if (_cachedKey) return _cachedKey;
  const masterKey = process.env["MASTER_KEY"];
  if (!masterKey) throw new Error("MASTER_KEY is not set");
  const salt = loadSalt();
  _cachedKey = await deriveKey(masterKey, salt);
  return _cachedKey;
}

async function loadVault(): Promise<VaultData> {
  ensureDataDir();
  if (!fs.existsSync(VAULT_FILE)) {
    return { instances: {} };
  }
  const key = await getKey();
  const blob = JSON.parse(fs.readFileSync(VAULT_FILE, "utf8")) as EncryptedBlob;
  const plaintext = decrypt(blob, key);
  return JSON.parse(plaintext) as VaultData;
}

async function saveVault(data: VaultData): Promise<void> {
  ensureDataDir();
  const key = await getKey();
  const blob = encrypt(JSON.stringify(data), key);
  fs.writeFileSync(VAULT_FILE, JSON.stringify(blob), { encoding: "utf8", mode: 0o600 });
}

export async function listInstances(): Promise<Instance[]> {
  const vault = await loadVault();
  return Object.values(vault.instances);
}

export async function getInstance(id: string): Promise<Instance | null> {
  const vault = await loadVault();
  return vault.instances[id] ?? null;
}

export async function addInstance(data: Omit<Instance, "id" | "createdAt">): Promise<Instance> {
  const vault = await loadVault();
  const id = crypto.randomUUID();
  const instance: Instance = { ...data, id, createdAt: new Date().toISOString() };
  vault.instances[id] = instance;
  await saveVault(vault);
  return instance;
}

export async function updateInstance(
  id: string,
  fields: Partial<Omit<Instance, "id" | "createdAt">>,
): Promise<Instance | null> {
  const vault = await loadVault();
  const existing = vault.instances[id];
  if (!existing) return null;
  const updated = { ...existing, ...fields };
  vault.instances[id] = updated;
  await saveVault(vault);
  return updated;
}

export async function deleteInstance(id: string): Promise<boolean> {
  const vault = await loadVault();
  if (!vault.instances[id]) return false;
  delete vault.instances[id];
  await saveVault(vault);
  return true;
}

// --- Admin user operations ---

export function loadAdminUsers(): AdminStore {
  ensureDataDir();
  if (!fs.existsSync(ADMIN_FILE)) return { users: [] };
  return JSON.parse(fs.readFileSync(ADMIN_FILE, "utf8")) as AdminStore;
}

export function saveAdminUsers(store: AdminStore): void {
  ensureDataDir();
  fs.writeFileSync(ADMIN_FILE, JSON.stringify(store, null, 2), { encoding: "utf8", mode: 0o600 });
}

export function findAdminUser(username: string): AdminUser | null {
  const store = loadAdminUsers();
  return store.users.find((u) => u.username === username) ?? null;
}
