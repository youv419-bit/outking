export { default, alt, size, contentType } from './opengraph-image';

// Declared here rather than re-exported: Next cannot statically read a
// segment config option that comes from another module.
export const runtime = 'nodejs';
