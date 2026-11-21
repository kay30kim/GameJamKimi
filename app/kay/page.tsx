import type { Metadata } from "next";
import KayTheater from "@/components/kay/kay-theater";

export const metadata: Metadata = {
  title: "The Little Forest · KimiTales",
  description: "Play, speak, and choose with Kimi and friends. Five interactive adventures for growing hearts.",
};

export default function KayPage() {
  return <KayTheater />;
}
