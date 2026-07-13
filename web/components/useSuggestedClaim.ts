"use client";

import { useEffect, useState } from "react";

// Rotating claim suggestions for search placeholders (issues #116, #119):
// suggest real claims rather than bare topic words. Returns the first claim
// on the server so hydration matches, then cycles on the client.

const SUGGESTED_CLAIMS = [
  "Was COVID-19 created in a lab?",
  "Will CERN generate a black hole?",
  "Are eggs good for you?",
];

const ROTATION_MS = 4000;

export function useSuggestedClaim(): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % SUGGESTED_CLAIMS.length),
      ROTATION_MS,
    );
    return () => clearInterval(timer);
  }, []);

  return SUGGESTED_CLAIMS[index];
}
