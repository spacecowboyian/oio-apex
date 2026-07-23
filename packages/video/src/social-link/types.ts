import { SocialPlatform } from "./glyphs";

/**
 * Data contract for the social-link corner label (spacecowboyian/oio-apex #1).
 * A preset over the shared corner-label engine: an icon-knockout box on the
 * outer (left) edge, the handle/URL as the plain word, entering from the left.
 * Style is `[icon box] / HANDLE` for a platform handle, `[icon box] HANDLE`
 * (no slash) for a plain website URL.
 */
export type SocialLinkProps = {
  /** which brand mark fills the box, and whether the slash separator shows
   * (platforms yes, `website` no). */
  platform: SocialPlatform;
  /** the handle or URL, plain word to the right of the box. All-caps per house
   * style — `OIORACING`, `@OIORACING`, `OIORACING.COM`. */
  handle: string;
  /** photo tone behind the label — drives the box/plain contrast. Default
   * "dark" (white box), the house style. */
  surface?: "dark" | "light";
  /** seconds the label holds fully on screen before exiting. Default 3. */
  holdSeconds?: number;
  /** which frame edge the lockup sits on. Default "bottom" (broadcast). */
  placement?: "top" | "bottom";
  /** px to inset from the placement edge to clear a social app's UI chrome.
   * Default 0. */
  safeInsetPx?: number;
  /** draw the scrim gradient behind the label. Default true (broadcast); set
   * false for short-form, which relies on a surface picked from the footage. */
  scrim?: boolean;
};

export type { SocialPlatform } from "./glyphs";
