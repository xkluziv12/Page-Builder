import type { Brand } from "@workspace/api-client-react";

export const BRAND_OPTIONS: { value: Brand; label: string }[] = [
  { value: "sts", label: "STS" },
  { value: "dcd", label: "DCD" },
  { value: "technocycle", label: "Technocycle" },
];

export function brandLabel(brand: Brand): string {
  return BRAND_OPTIONS.find((b) => b.value === brand)?.label ?? brand;
}
