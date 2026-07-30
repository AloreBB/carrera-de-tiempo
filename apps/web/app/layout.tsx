import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Figtree } from "next/font/google";
import "./globals.css";

const display = Chakra_Petch({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display-loaded",
  display: "swap",
});

const body = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Carrera de Tiempo",
  description: "Crea una sala, invita amigos y compite hasta el destino en tiempo real",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Carrera de Tiempo",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#07090d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${display.variable} ${body.variable}`}>
      <body
        style={
          {
            "--font-display": "var(--font-display-loaded), system-ui, sans-serif",
            "--font-body": "var(--font-body-loaded), system-ui, sans-serif",
          } as React.CSSProperties
        }
      >
        {children}
      </body>
    </html>
  );
}
