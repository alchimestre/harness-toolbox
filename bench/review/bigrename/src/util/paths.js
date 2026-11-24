import { join, normalize, sep } from 'node:path';

export function resolveInside(root, relative) {
  const target = normalize(join(root, relative));
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error('path escapes root');
  }
  return target;
}

export function trimTrailingSlash(path) {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}
