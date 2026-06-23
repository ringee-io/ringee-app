import { Geist, Geist_Mono, Inter } from "next/font/google";

import { cn } from "./utils";

// Only three families are actually rendered:
//   - Inter      → the active body font (theme.css maps --font-sans to it)
//   - Geist      → declares the --font-sans variable / base fallback
//   - Geist Mono → the `font-mono` utility and the "mono" theme
// Instrument Sans, Mulish and Noto Sans Mono were declared but never referenced
// anywhere, yet next/font still preloaded a woff2 for each on every page. They
// were removed to cut three render-competing font requests (~95 KB) site-wide.
const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const fontInter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const fontVariables = cn(
  fontSans.variable,
  fontMono.variable,
  fontInter.variable,
);
