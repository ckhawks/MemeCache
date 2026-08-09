/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Both are native/optional server-side modules webpack should not try to bundle.
    // pg only requires pg-native if you explicitly use pg.native, which this app does
    // not, but webpack resolves the require statically and warns when it is absent.
    config.externals = [...config.externals, 'bcrypt', 'pg-native'];
    return config;
  },
};

export default nextConfig;
