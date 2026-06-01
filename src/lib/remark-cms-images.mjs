/**
 * Rewrites CMS-uploaded image paths in Markdown/MDX bodies from the
 * "/src/assets/…" form (what Sveltia writes — its public_folder must start with
 * "/") to a path relative to the content file, so Astro's built-in Markdown
 * image optimizer resolves and optimizes them instead of emitting a broken
 * /src URL.
 *
 * Every content file lives at src/content/<collection>/<slug>.md(x), so the
 * path from a content file to src/assets is always ../../assets/.
 */
export default function remarkCmsImages() {
  const rewrite = (node) => {
    if (
      node.type === 'image' &&
      typeof node.url === 'string' &&
      node.url.startsWith('/src/assets/')
    ) {
      node.url = node.url.replace(/^\/src\/assets\//, '../../assets/');
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) rewrite(child);
    }
  };
  return (tree) => rewrite(tree);
}
