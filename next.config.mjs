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
  // Lets a phone on the home network or the tailnet load the dev server's scripts. Without
  // it Next blocks them as cross-origin and pages never hydrate (feeds stay in the
  // server-rendered three columns). Development only; production ignores it.
  allowedDevOrigins: [
    '192.168.1.*',
    '100.*.*.*',
  ],
};

export default nextConfig;
