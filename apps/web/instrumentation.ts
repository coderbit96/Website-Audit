export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getWebServerEnvironment } = await import("./lib/environment/server");
  getWebServerEnvironment();
}
