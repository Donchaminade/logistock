import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { DataProvider } from "@/components/DataProvider";
import { PwaRegister } from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "LogiStock — Préfinancement soja et cacao",
  description: "Maquette interactive LogiStock : besoins, contrats, remises d'argent, transports, pointage à Lomé, livraisons partielles et reliquats. Données fictives.",
  icons: { icon: "/logo.svg", apple: "/icons/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "LogiStock", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0b0d12", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <PwaRegister />
        <DataProvider>{children}</DataProvider>
      </body>
    </html>
  );
}
