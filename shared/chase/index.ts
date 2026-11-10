// La poursuite (§18.33) : un plan (le minutage, fonction de la fiche) et une
// image SVG pour chaque instant (ChaseFrame), sans DOM ni état. Joué par
// web/src/components/Chase.tsx, rendu en PNG par scripts/render-chase.ts.
export * from "./plan";
export { radioLines, type Radio } from "./radio";
export { PALETTES, type ChasePalette } from "./palette";
export { ChaseFrame, layoutOf, type ChaseFrameProps } from "./ChaseFrame";
