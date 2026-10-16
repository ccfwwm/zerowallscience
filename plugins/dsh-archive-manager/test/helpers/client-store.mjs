import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
export async function loadClientStore() {
  const current = require.resolve("@deepseek-ai/dsh-client-store");
  return { id: "@deepseek-ai/dsh-client-store", exports: await import(pathToFileURL(current).href) };
}
