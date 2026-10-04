import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only Node driver (native crypto, file reads): load with require, don't bundle.
  serverExternalPackages: ["snowflake-sdk"],
  // This folder is the project root. Without it Turbopack weighs a stray lockfile in the
  // user's home folder (C:\Users\<name>\package-lock.json) and prints a warning.
  turbopack: { root: __dirname },
};

export default nextConfig;
