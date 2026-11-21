import type { Metadata } from "next";
import CollisionQa from "@/components/harbir/collision-qa-loader";

export const metadata: Metadata = { title: "Collision QA · KimiTales" };

export default function QaPage() {
  return <CollisionQa />;
}
