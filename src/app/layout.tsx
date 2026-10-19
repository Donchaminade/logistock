import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { DataProvider } from "@/components/DataProvider";

export const metadata: Metadata = {
  title: "LogiStock — Préfinancement soja et cacao",
  description: "Maquette interactive LogiStock : besoins, contrats, remises d'argent, transports, pointage à Lomé, livraisons partielles et reliquats. Données fictives.",
  icons: { icon: "/logo.svg" },
};

export const viewport: Viewport = { themeColor: "#0b0d12", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <DataProvider>{children}</DataProvider>
      </body>
    </html>
  );
}
