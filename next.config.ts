import type { NextConfig } from "next";

// Keep the development cache separate from the production build output.
const nextConfig: NextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};
export default nextConfig;
