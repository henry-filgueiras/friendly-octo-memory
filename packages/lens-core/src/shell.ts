export const lensShellClasses = {
  app: "lens-shell",
  eyebrow: "lens-eyebrow",
  hero: "lens-hero",
  heroActions: "lens-hero__actions",
  heroBody: "lens-hero__body",
  panel: "lens-panel",
  panelHeader: "lens-panel__header",
  pill: "lens-pill",
  pillRow: "lens-pill-row",
  statCard: "lens-stat-card",
  statGrid: "lens-stat-grid",
  workspace: "lens-workspace",
} as const;

export function lensCx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}
