import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['three'],
  // ffmpeg-static resolves a path to a native binary. Bundling it rewrites that
  // path into the build output, where no binary exists.
  serverExternalPackages: ['ffmpeg-static'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
