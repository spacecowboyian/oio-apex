import React from "react";
import { SocialFrame } from "../social/SocialFrame";
import { ASPECTS, type Aspect } from "../social/aspects";
import { color, fontStack, type } from "../theme";

const PREVIEW_WIDTH = 380;

const SAMPLE_PHOTO = "/betty-datsun-521.png";

const Caption: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontFamily: fontStack("helvetica"),
      fontSize: type.scale.caption,
      color: color.base.muted,
      marginTop: 8,
      textAlign: "center",
    }}
  >
    {children}
  </div>
);

const GroupLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontFamily: fontStack("helvetica"),
      fontWeight: 700,
      fontSize: type.scale.body,
      color: color.base.white,
      marginBottom: 16,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
    }}
  >
    {children}
  </div>
);

const Row: React.FC<{ aspects: Aspect[] }> = ({ aspects }) => (
  <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-end" }}>
    {aspects.map((aspect) => (
      <div key={aspect.id}>
        <SocialFrame
          aspect={aspect}
          imageUrl={SAMPLE_PHOTO}
          fact="85 MR2"
          name="GOBLIN"
          anchor="right"
          surface="dark"
          cropX={50}
          cropY={50}
          zoom={1}
          scale={PREVIEW_WIDTH / aspect.width}
        />
        <Caption>
          {aspect.label}
          <br />
          {aspect.width}×{aspect.height}
        </Caption>
      </div>
    ))}
  </div>
);

/**
 * Real export sizes for social posts, grouped by where they're used. Each
 * frame is the real `SocialFrame` production component, not a mockup, so
 * this is exactly what the export pipeline produces. See `aspects.ts`.
 *
 * "Instagram" is IG's real feed-image spec — the three ratios it'll display
 * without cropping. "General crop" is a plain wide/tall pair for placements
 * that aren't Instagram's feed (site, Facebook link preview, etc).
 */
export const SocialLayouts: React.FC = () => (
  <div style={{ background: color.base.black, padding: 24, display: "flex", flexDirection: "column", gap: 40 }}>
    <div>
      <GroupLabel>Instagram</GroupLabel>
      <Row aspects={ASPECTS.filter((a) => a.group === "instagram")} />
    </div>
    <div>
      <GroupLabel>General crop</GroupLabel>
      <Row aspects={ASPECTS.filter((a) => a.group === "general")} />
    </div>
  </div>
);
