import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flux Video Studio",
  description: "Reference analysis and AI-assisted video creation workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
