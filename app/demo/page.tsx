import type { Metadata } from "next";
import DemoExperience from "@/components/demo/demo-experience";
import audioManifest from "@/public/demo/audio/manifest.json";
export const metadata: Metadata = { title: "Kimi’s little woodland — 3D story demo", description: "Choose, speak, and explore a little woodland with Kimi." };
export default function DemoPage() { return <DemoExperience audioManifest={audioManifest} />; }
