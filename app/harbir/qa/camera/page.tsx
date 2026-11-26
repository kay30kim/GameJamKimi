import type { Metadata } from "next";
import CameraQa from "@/components/harbir/camera-qa";

export const metadata: Metadata = { title: "Camera QA · Alicetales" };

export default function CameraQaPage() {
  return <CameraQa />;
}
