"use client";

import { useState, useEffect } from "react";
import LandingClient from "./landing-client";

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        style={{
          background: "#0d0d0d",
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            color: "#333333",
            fontFamily: "Raleway, sans-serif",
            letterSpacing: "0.4em",
            fontSize: "1.5rem",
            fontWeight: 100,
            textTransform: "uppercase",
          }}
        >
          RAVN
        </span>
      </div>
    );
  }

  return <LandingClient />;
}
