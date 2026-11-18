import type { NextConfig } from 'next';
const config: NextConfig = { serverExternalPackages: ['@prisma/client', 'exceljs', 'bwip-js'], poweredByHeader: false, experimental: { cpus: 1, turbopackFileSystemCacheForBuild: false } };
export default config;
