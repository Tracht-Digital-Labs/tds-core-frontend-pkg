/** Longest edge of a stored avatar. */
export const AVATAR_PX = 256;

/** Mirrors AvatarService::MAX_BYTES in tds-auth-api. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/**
 * Downscale in the browser before uploading.
 *
 * The production host has no guaranteed `ext-gd`, so the server validates and
 * stores rather than transforms. Doing it here means a 4 MB phone photo becomes
 * a ~30 KB square instead of a 413 the user has to solve with an image editor.
 * Falls back to the original file if anything about canvas/WebP is unavailable —
 * the server still enforces the real limit.
 */
export async function downscaleAvatar(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_PX;
    canvas.height = AVATAR_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // Centre-crop to a square first, so a portrait is not squashed into the
    // circle the avatar renders as.
    const x = (bitmap.width - side) / 2;
    const y = (bitmap.height - side) / 2;
    ctx.drawImage(bitmap, x, y, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
    return blob ?? file;
  } catch {
    return file;
  }
}
