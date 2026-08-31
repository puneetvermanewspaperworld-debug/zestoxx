import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Load Prisma via native require in Route Handlers instead of bundling it — its
  // engine does dynamic filesystem access that otherwise drags the whole project
  // into the server trace. (@prisma/client is on Next's default externals list; this
  // is here to be explicit.)
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
