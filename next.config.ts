import type { NextConfig } from "next";
const config: NextConfig = {
  // Allow the local browser-testing container to load development assets.
  allowedDevOrigins: ["host.docker.internal"],
};
export default config;
