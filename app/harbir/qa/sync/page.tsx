import type { Metadata } from "next";
import SyncQa from "@/components/harbir/sync-qa";

export const metadata: Metadata = { title: "Speech sync QA · Alicetales" };

export default function SyncQaPage() {
  return <SyncQa />;
}
