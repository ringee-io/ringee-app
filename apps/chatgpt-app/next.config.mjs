/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The agent layer ships TypeScript source using NodeNext ".js" specifiers.
  transpilePackages: ["@ringee-io/agent"],
  eslint: { ignoreDuringBuilds: true },
  // Matches apps/frontend: don't fail the (optional) gallery build on the
  // monorepo's @types/react version skew. `pnpm typecheck` remains the gate.
  typescript: { ignoreBuildErrors: true },
  webpack: (config) => {
    // Resolve the agent layer's ".js" import specifiers to their ".ts" source.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
  async headers() {
    // Allow the component routes to be embedded in the ChatGPT iframe.
    return [
      {
        source: "/render/:path*",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://chatgpt.com https://*.openai.com",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
