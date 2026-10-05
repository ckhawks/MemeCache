/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native or optional server-side modules the bundler should leave to Node. All are on
  // Next's built-in list already; named here so the intent survives a list change. This
  // replaced a webpack externals hook, which Turbopack (the default since Next 16) ignores.
  serverExternalPackages: [
    'bcrypt',
    'pg',
    'sharp',
  ],
};

export default nextConfig;
