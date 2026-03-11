/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['openai'],
  },
  images: {
    domains: ['fsoffugdhqvgrimzqydo.supabase.co'],
  },
}

export default nextConfig
