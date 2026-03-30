import type { HTMLAttributes, ReactNode } from "react";
import { lensCx, lensShellClasses } from "./shell";

type DivProps = HTMLAttributes<HTMLDivElement>;
type SectionProps = HTMLAttributes<HTMLElement>;

export function LensShell({
  children,
  className,
  ...props
}: DivProps & { children?: ReactNode }) {
  return (
    <div {...props} className={lensCx(lensShellClasses.app, className)}>
      {children}
    </div>
  );
}

export function LensHero({
  children,
  className,
  ...props
}: SectionProps & { children?: ReactNode }) {
  return (
    <header {...props} className={lensCx(lensShellClasses.hero, className)}>
      {children}
    </header>
  );
}

export function LensPanel({
  children,
  className,
  ...props
}: SectionProps & { children?: ReactNode }) {
  return (
    <section {...props} className={lensCx(lensShellClasses.panel, className)}>
      {children}
    </section>
  );
}

export function LensStatGrid({
  children,
  className,
  ...props
}: DivProps & { children?: ReactNode }) {
  return (
    <div {...props} className={lensCx(lensShellClasses.statGrid, className)}>
      {children}
    </div>
  );
}
