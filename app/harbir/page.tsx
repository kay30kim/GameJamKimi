import type { Metadata } from "next";
import HarbirStory from "@/components/harbir/harbir-story";

export const metadata: Metadata = {
  title: "KimiTales",
  description: "Short stories that teach kids kindness and new words in Korean or English.",
};

export default function HarbirPage() {
  return <HarbirStory />;
}
