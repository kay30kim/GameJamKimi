import type { Metadata } from "next";
import Tales from "@/components/tales/tales";

export const metadata: Metadata = {
  title: "KimiTales",
  description: "Kimi and friends act out a live story that teaches kindness and new words in Korean or English.",
};

export default function Home() {
  return <Tales />;
}
