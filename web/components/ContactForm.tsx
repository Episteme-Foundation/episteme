"use client";

import { useState } from "react";

// The /about contact form (issue #81). Name optional, email + message
// required; a hidden "website" honeypot field catches naive bots. Delivery
// happens in /api/contact; no email address appears in the page.

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

const field: React.CSSProperties = {
  width: "100%",
  font: "inherit",
  fontSize: "0.95rem",
  padding: "0.5rem 0.7rem",
  border: "1px solid var(--rule)",
  borderRadius: "3px",
  background: "var(--paper-card)",
  color: "var(--ink)",
};

const label: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--sans)",
  fontSize: "0.72rem",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--muted)",
  margin: "0.9rem 0 0.3rem",
};

export function ContactForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          message: data.get("message"),
          website: data.get("website"),
        }),
      });
      if (res.ok) {
        form.reset();
        setStatus({ kind: "sent" });
      } else {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setStatus({ kind: "error", message: body?.error ?? "The message could not be sent." });
      }
    } catch {
      setStatus({ kind: "error", message: "The message could not be sent. Please try again later." });
    }
  }

  if (status.kind === "sent") {
    return (
      <p style={{ fontFamily: "var(--sans)", fontSize: "0.9rem", color: "var(--st-verified)" }}>
        Message sent. Thank you; replies come from a real inbox.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ maxWidth: "30rem" }}>
      {/* honeypot: hidden from people, tempting to bots */}
      <div style={{ position: "absolute", left: "-9999px" }} aria-hidden>
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label style={label} htmlFor="contact-name">Name (optional)</label>
      <input style={field} id="contact-name" name="name" type="text" autoComplete="name" />

      <label style={label} htmlFor="contact-email">Email</label>
      <input style={field} id="contact-email" name="email" type="email" required autoComplete="email" />

      <label style={label} htmlFor="contact-message">Message</label>
      <textarea style={{ ...field, resize: "vertical" }} id="contact-message" name="message" rows={5} required />

      <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.9rem" }}>
        <button
          type="submit"
          disabled={status.kind === "sending"}
          style={{
            font: "inherit",
            fontFamily: "var(--sans)",
            fontSize: "0.8rem",
            fontWeight: 600,
            padding: "0.45rem 1rem",
            border: "1px solid var(--ink)",
            borderRadius: "3px",
            background: "var(--ink)",
            color: "var(--paper)",
            cursor: status.kind === "sending" ? "default" : "pointer",
            opacity: status.kind === "sending" ? 0.6 : 1,
          }}
        >
          {status.kind === "sending" ? "Sending…" : "Send"}
        </button>
        {status.kind === "error" && (
          <span style={{ fontFamily: "var(--sans)", fontSize: "0.8rem", color: "var(--st-contradicted)" }}>
            {status.message}
          </span>
        )}
      </div>
    </form>
  );
}
