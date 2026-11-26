import type { Metadata } from "next";
import ContinuityQa from "@/components/harbir/continuity-qa";

export const metadata: Metadata = {
  title: "Continuity QA · Alicetales",
  robots: { index: false, follow: false },
};

export default function ContinuityQaPage() {
  return <ContinuityQa />;
}
