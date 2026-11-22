import type { NextConfig } from "next";

// GitHub Pages serves the site from https://zibafar.github.io/getdomain/
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/getdomain";

const nextConfig: NextConfig = {
  output: "export", // static HTML/JS in ./out — no server
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true, // /getdomain/ -> /getdomain/index.html on Pages
  images: { unoptimized: true },
};

export default nextConfig;
