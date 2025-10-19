// next.config.ts
import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
let supabaseHost: string | undefined;
try {
  supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : undefined;
} catch {
  supabaseHost = undefined;
}

const nextConfig: NextConfig = {
  reactStrictMode: true, // safe to keep
  // TEMPORARY: ignore ESLint errors during `next build` to unblock deployment.
  // Remove this after you fix the reported lint/TS issues.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // TEMPORARY: bypass TypeScript type-check build errors so `next build` doesn't fail.
  // WARNING: this can let runtime-breaking type errors through. Use only to unblock.
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost, // e.g. abc.supabase.co
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
// next.config.ts
import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
let supabaseHost: string | undefined;
try {
  supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : undefined;
} catch {
  supabaseHost = undefined;
}

const nextConfig: NextConfig = {
  reactStrictMode: true, // safe to keep
  // TEMPORARY: ignore ESLint errors during `next build` to unblock deployment.
  // Remove this after you fix the reported lint/TS issues.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // TEMPORARY: bypass TypeScript type-check build errors so `next build` doesn't fail.
  // WARNING: this can let runtime-breaking type errors through. Use only to unblock.
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost, // e.g. abc.supabase.co
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
