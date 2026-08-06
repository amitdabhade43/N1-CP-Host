import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// All source files are bundled into dist/index.mjs, so import.meta.url always
// resolves to that bundle. ../data from dist/ = artifacts/api-server/data/
const _dir = dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = resolve(_dir, "../data");
export const PUBLIC_DIR = resolve(_dir, "../public");
