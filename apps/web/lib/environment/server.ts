import "server-only";

import {
  parseWebServerEnvironment,
  type WebServerEnvironment,
} from "@website-audit/shared/environment/server";
import { getPublicEnvironment } from "./public";

let cachedEnvironment: WebServerEnvironment | null = null;

export function getWebServerEnvironment(): WebServerEnvironment {
  cachedEnvironment ??= parseWebServerEnvironment({
    ...process.env,
    NEXT_PUBLIC_APP_URL: getPublicEnvironment().NEXT_PUBLIC_APP_URL,
  });
  return cachedEnvironment;
}
