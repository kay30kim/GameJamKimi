import type { Metadata } from "next";
import KayTheater from "@/components/kay/kay-theater";

export const metadata: Metadata = {
  title: "마음이 자라는 숲 · KimiTales",
  description: "키미와 친구들이 들려주는 다섯 가지 마음 이야기. 보고, 말하고, 함께 선택하는 작은 애니메이션 극장.",
};

export default function KayPage() {
  return <KayTheater />;
}
