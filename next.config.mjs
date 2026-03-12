/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['openai'],
  },
  images: {
    domains: ['fsoffugdhqvgrimzqydo.supabase.co'],
  },
}

export default nextConfig
