import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This app is the build root (it lives in a subdir of the backend repo).
  outputFileTracingRoot: __dirname,
  // Ensure the vendored verbatim content ships in the serverless bundle.
  outputFileTracingIncludes: {
    "/about/**": ["./content/**/*"],
  },
};

export default nextConfig;
