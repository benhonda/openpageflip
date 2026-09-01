import type { PageDensity } from "@openpageflip/core";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";

export type PageProps = HTMLAttributes<HTMLDivElement> & {
  /** `hard` pages turn as a rigid sheet. @default "soft" */
  density?: PageDensity;
  children?: ReactNode;
};

/**
 * One page of a `FlipBook`. Any child of `FlipBook` becomes a page; `Page` is the way to say
 * which are hard and to put a class or style on the page element itself.
 */
export function Page({ density, children, ...rest }: PageProps): ReactElement {
  return (
    <div data-density={density} {...rest}>
      {children}
    </div>
  );
}
