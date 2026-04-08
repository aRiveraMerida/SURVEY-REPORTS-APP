import type { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Survey Reports",
  description: "Generación de informes de campañas telefónicas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        {/*
          Tailwind is pre-compiled to /public/tailwind.css by the
          `prebuild` script. We serve it via <link> instead of
          `import "./globals.css"` because Next.js ships with an older
          bundled PostCSS parser that crashes on Tailwind v4.2's modern
          CSS output (nested @supports, oklch(), relative color
          syntax — the infamous "Missed semicolon" error at line 2
          column 19028 of the compiled Tailwind output). Precompiling
          and serving as a static asset bypasses Next's CSS pipeline
          entirely.
        */}
        <link rel="stylesheet" href="/tailwind.css" />
      </head>
      <body className={`${inter.variable} font-sans antialiased bg-gray-50 text-gray-900`}>
        {children}
      </body>
    </html>
  );
}
