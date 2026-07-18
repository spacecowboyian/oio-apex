import React from "react";
import { BrandCircle } from "../foundations/BrandCircle";
import { CornerLabel } from "../foundations/CornerLabel";
import type { Aspect } from "./aspects";

export type SocialFrameFields = {
  fact: string;
  name: string;
  anchor: "left" | "right";
  surface: "dark" | "light";
};

export type SocialFrameProps = SocialFrameFields & {
  aspect: Aspect;
  imageUrl: string | null;
  /** true pixel size (aspect.width/height); scaled visually by the caller for preview */
  scale?: number;
};

/**
 * Single exportable social-post frame — brand guide section 06 "Social
 * Posts": full-bleed photo, OIO badge top-left, bottom vignette, corner
 * label bottom-right on the outer edge. Sized in real px at export
 * resolution (badge/label numbers below are guide px ÷ 1080 width — both
 * export sizes share that 1080 width, so cqw keeps them the same real size
 * across aspects, unlike the guide's on-page cqh mockup which only shares a
 * row height as a side-by-side display coincidence).
 *
 * The DOM this renders is exactly what html-to-image captures, so preview
 * and export can never drift.
 */
export const SocialFrame = React.forwardRef<HTMLDivElement, SocialFrameProps>(
  ({ aspect, imageUrl, fact, name, anchor, surface, scale = 1 }, ref) => {
    return (
      <div
        style={{
          width: aspect.width * scale,
          height: aspect.height * scale,
          overflow: "hidden",
        }}
      >
        <div
          ref={ref}
          style={{
            width: aspect.width,
            height: aspect.height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            position: "relative",
            background: "#000",
            containerType: "size",
            overflow: "hidden",
          }}
        >
          {imageUrl && (
            <img
              src={imageUrl}
              alt={[fact, name].filter(Boolean).join(" — ") || "Uploaded photo"}
              crossOrigin="anonymous"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                zIndex: 0,
              }}
            />
          )}

          {/* bottom vignette — consistent dark backdrop for the corner label regardless of the photo */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "24cqh",
              background:
                "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.8) 100%)",
              zIndex: 1,
              pointerEvents: "none",
            }}
          />

          {/* OIO badge, top-left — identifies the channel */}
          <div style={{ position: "absolute", top: "2.22cqw", left: "2.22cqw", zIndex: 2 }}>
            <BrandCircle variant="wordmark" diameter="8.9cqw" invert={surface === "light"}>
              OIO
            </BrandCircle>
          </div>

          {/* corner label — bottom-right, box on the outer edge */}
          <div style={{ position: "absolute", right: "2.22cqw", bottom: "2.22cqw", zIndex: 2 }}>
            <CornerLabel
              fact={fact}
              name={name}
              anchor={anchor}
              surface={surface}
              fontSize="2.78cqw"
              maxPartWidth="36cqw"
            />
          </div>
        </div>
      </div>
    );
  },
);
SocialFrame.displayName = "SocialFrame";
