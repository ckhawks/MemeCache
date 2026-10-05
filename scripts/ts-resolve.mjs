// Module hooks that let a plain `node` script import the app's TypeScript: the
// `@/` alias goes to src/, and imports without an extension find their .ts or .tsx file.
// Node strips the types itself (22.18 and later). Registered by the scripts that need it:
//
//   import { register } from 'node:module';
//   register('./ts-resolve.mjs', import.meta.url);
//   const { something } = await import('../src/somewhere.ts');

import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

const EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '/index.ts',
];

function findFile(base) {
  for (const extension of EXTENSIONS) {
    const file = base + extension;
    if (existsSync(file) && statSync(file).isFile()) {
      return pathToFileURL(file).href;
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  let base = null;
  if (specifier.startsWith('@/')) {
    base = join(src, specifier.slice(2));
  } else if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    context.parentURL?.startsWith('file:') &&
    /\.tsx?$/.test(context.parentURL)
  ) {
    base = join(dirname(fileURLToPath(context.parentURL)), specifier);
  }
  const file = base && findFile(base);
  return nextResolve(file ?? specifier, context);
}

// The app's modules are ES modules. Saying so up front saves Node from guessing, which it
// warns about on every run.
export async function load(url, context, nextLoad) {
  if (url.startsWith(pathToFileURL(src).href) && /\.tsx?$/.test(url)) {
    return nextLoad(url, { ...context, format: 'module-typescript' });
  }
  return nextLoad(url, context);
}
