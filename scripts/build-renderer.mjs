// Bundles the React renderer with esbuild. Run automatically by `npm start` and `npm run dist`.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [path.join(root, 'src', 'renderer', 'src', 'main.jsx')],
  outfile: path.join(root, 'src', 'renderer', 'bundle.js'),
  bundle: true,
  jsx: 'automatic',
  minify: true,
  sourcemap: true,
  target: ['chrome120'],
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.js': 'jsx' },
  logLevel: 'info',
});
