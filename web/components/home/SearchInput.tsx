"use client";

import { useEffect, useState } from "react";

// The hero search input (issue #116): the placeholder suggests a real claim
// rather than bare topic words, rotating through a small set. Rendered with
// the first claim on the server so hydration matches, then cycled on the
// client.

const SUGGESTED_CLAIMS = [
  "Was COVID-19 created in a lab?",
  "Will CERN generate a black hole?",
  "Are eggs good for you?",
];

const ROTATION_MS = 4000;

export function SearchInput() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % SUGGESTED_CLAIMS.length),
      ROTATION_MS,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <input
      type="search"
      name="q"
      placeholder={`Search the claim graph: try “${SUGGESTED_CLAIMS[index]}”`}
      aria-label="Search the claim graph"
    />
  );
}
