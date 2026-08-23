/**
 * Pure image-vs-identicon decision shared by both UserAvatar platform variants
 * (FR-3.3 / EC-6). Lives in its own react-native-free module so the swap logic
 * is unit-testable under the package's node test environment (which ships no
 * React renderer and cannot parse react-native's Flow source) — the same
 * pure-seam pattern the Phase 2 hooks use.
 *
 * The image is shown only when there is a URL and it has not errored. On an
 * image load error the caller sets `failed` true, which flips this to false and
 * the identicon takes over.
 */
export function shouldShowImage(failed: boolean, imageUrl?: string | null): boolean {
  return Boolean(imageUrl && !failed);
}
