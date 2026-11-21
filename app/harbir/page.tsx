import type { Metadata } from "next";
import HarbirStory from "@/components/harbir/harbir-story";

export const metadata: Metadata = {
  title: "Sunny Meadow · KimiTales",
  description: "Live Kimi stories acted out in a 3D meadow.",
};

export default function HarbirPage() {
  return <HarbirStory />;
}
