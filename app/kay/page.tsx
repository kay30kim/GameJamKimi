import type { Metadata } from "next";
import KayTheater from "@/components/kay/kay-theater";

export const metadata: Metadata = {
  title: "The Little Forest · Alicetales",
  description: "Play, speak, and choose with Alice and friends. Five interactive adventures for growing hearts.",
};

export default function KayPage() {
  return <KayTheater />;
}
