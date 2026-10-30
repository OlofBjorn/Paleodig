import type Phaser from 'phaser';

/** Texture key for a dig site's background image. */
export function siteTextureKey(image: string): string {
  return `site-image:${image}`;
}

/**
 * Loads images at runtime. A missing file is not an error: Phaser just doesn't create that
 * texture, so callers check scene.textures.exists(key) and fall back to something plain.
 */
export function loadTextures(
  scene: Phaser.Scene,
  entries: { key: string; url: string }[],
): Promise<void> {
  const missing = entries.filter((e) => !scene.textures.exists(e.key));
  if (missing.length === 0) return Promise.resolve();

  return new Promise((resolve) => {
    scene.load.once('complete', () => resolve()); // fires even if some files 404
    for (const { key, url } of missing) {
      scene.load.image(key, url);
    }
    scene.load.start();
  });
}