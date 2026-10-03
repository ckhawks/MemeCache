import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

// `next lint` was removed in Next 16; this is the flat-config equivalent of the old
// .eslintrc.json ({ "extends": "next/core-web-vitals" }).
const config = [
  ...nextCoreWebVitals,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'db/seed/**',
    ],
  },
];

export default config;
