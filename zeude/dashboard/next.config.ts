import type { NextConfig } from "next";

const isGitHubActions = process.env.GITHUB_ACTIONS === 'true'
const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? ''
const basePath = isGitHubActions && repositoryName ? `/${repositoryName}` : ''

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  basePath,
  assetPrefix: basePath,
  pageExtensions: ['demo.tsx', 'demo.ts', 'demo.jsx', 'demo.js'],
};

export default nextConfig;
