import React from "react";
import { staticFile } from "remotion";
import { SocialFrame, SocialFrameFields } from "./SocialFrame";
import { aspectById, AspectId } from "./aspects";

export type SocialCardProps = SocialFrameFields & {
  /** path relative to public/, resolved via staticFile() for the headless render */
  imagePath: string;
  aspectId: AspectId;
};

/**
 * Remotion-registered wrapper around SocialFrame so a branded card can be
 * exported headlessly (renderStill, no browser interaction) via
 * scripts/render-social-still.mjs — same DOM/brand math as the interactive
 * Storybook generator, just driven by props instead of clicks.
 */
export const SocialCard: React.FC<SocialCardProps> = ({ imagePath, aspectId, ...fields }) => {
  const aspect = aspectById(aspectId);
  return <SocialFrame aspect={aspect} imageUrl={imagePath ? staticFile(imagePath) : null} {...fields} />;
};
