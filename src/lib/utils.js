import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names using clsx and tailwind-merge
 * This is a utility function commonly used in shadcn/ui components
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
} 