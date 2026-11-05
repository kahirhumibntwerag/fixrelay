// A project-specific URL can override a provider-managed DATABASE_URL without
// changing another integration's credentials or breaking rollback.
export function databaseUrl() {
  return process.env.ROGNET_DATABASE_URL || process.env.DATABASE_URL;
}
