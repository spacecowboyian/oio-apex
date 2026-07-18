export type AspectId = "square" | "portrait" | "landscape" | "landscapeGeneral" | "portraitGeneral";

export type AspectGroup = "instagram" | "general";

export type Aspect = {
  id: AspectId;
  label: string;
  group: AspectGroup;
  width: number;
  height: number;
};

// Two groups. "instagram" is the real IG feed-image spec (1080px min width):
// square 1:1, vertical 4:5 (the max portrait ratio IG will display without
// cropping), horizontal 1.91:1 (the max landscape ratio). Corrected
// 2026-07-18 per Ian — the prior 1080x810/1080x1440 pair wasn't an actual IG
// export size, so it was demoted to its own "general" group: a plain
// wide/tall crop pair for placements that aren't Instagram's feed (site,
// Facebook link preview, etc).
export const ASPECTS: Aspect[] = [
  { id: "square", label: "Square (1:1)", group: "instagram", width: 1080, height: 1080 },
  { id: "portrait", label: "Vertical (4:5)", group: "instagram", width: 1080, height: 1350 },
  { id: "landscape", label: "Horizontal (1.91:1)", group: "instagram", width: 1080, height: 566 },
  { id: "landscapeGeneral", label: "Horizontal (4:3)", group: "general", width: 1080, height: 810 },
  { id: "portraitGeneral", label: "Vertical (3:4)", group: "general", width: 1080, height: 1440 },
];

export const aspectById = (id: AspectId): Aspect => ASPECTS.find((a) => a.id === id) ?? ASPECTS[0];
