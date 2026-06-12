import type { Metadata } from "next";
import { TerminalScreen } from "./terminal-screen";

export const metadata: Metadata = {
  title: "RAVN — Terminal",
};

export default function TerminalPage() {
  return <TerminalScreen />;
}
