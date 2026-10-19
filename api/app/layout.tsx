import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
// Titres en serif : ton plus chaleureux, adapté au bien-être.
const lora = Lora({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Moodly",
  description: "Le Miroir : le moral réel de l'équipe face à la perception du manager.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${inter.className} ${lora.variable}`}>
      <body>{children}</body>
    </html>
  );
}
