/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  experimental: {
    useTypeScriptCli: false,
    serverActions: {
      bodySizeLimit: "10mb"
    }
  }
};

export default nextConfig;
