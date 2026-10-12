import "server-only";

import {
  parseWebServerEnvironment,
  type WebServerEnvironment,
} from "@website-audit/shared/environment/server";

let cachedEnvironment: WebServerEnvironment | null = null;

export function getWebServerEnvironment(): WebServerEnvironment {
  cachedEnvironment ??= parseWebServerEnvironment(process.env);
  return cachedEnvironment;
}
