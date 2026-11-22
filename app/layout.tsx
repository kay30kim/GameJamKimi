import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Alicetales",
  applicationName: "Alicetales",
  metadataBase: new URL("https://alicetales.vercel.app"),
  description:
    "Interactive story adventures that teach little kids big lessons — in English and Korean.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={notoSansKR.variable}>
      <body>{children}</body>
    </html>
  );
}
