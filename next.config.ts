import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only Node driver (native crypto, file reads): load with require, don't bundle.
  serverExternalPackages: ["snowflake-sdk"],
};

export default nextConfig;
