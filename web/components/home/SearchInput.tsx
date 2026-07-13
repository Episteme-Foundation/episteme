"use client";

import { useSuggestedClaim } from "@/components/useSuggestedClaim";

// The hero search input (issue #116): the placeholder suggests a real claim
// rather than bare topic words, rotating through a small set.

export function SearchInput() {
  const claim = useSuggestedClaim();

  return (
    <input
      type="search"
      name="q"
      placeholder={`Search the claim graph: try “${claim}”`}
      aria-label="Search the claim graph"
    />
  );
}
