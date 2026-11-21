import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1280px" } },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        success: { DEFAULT: "hsl(var(--success))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        brand: {
          /**
           * Forest green scale — the primary brand color (#176B4D).
           * `brand-emerald-*` is the historical class name; values are forest.
           */
          emerald: {
            DEFAULT: "#176B4D",
            50: "#F3F8F5", 100: "#E7F1EA", 200: "#C2E0D1", 300: "#86C2A4",
            400: "#4CA278", 500: "#238653", 600: "#176B4D", 700: "#135A41",
            800: "#0E4733", 900: "#0A3526",
          },
          /** Ink scale (deep charcoal-green) for dark surfaces and overlays. */
          navy: {
            DEFAULT: "#1E2721",
            50: "#F2F5F3", 100: "#E4EAE6", 200: "#C9D4CD", 300: "#9DACA3",
            600: "#3B4740", 700: "#2C362F", 800: "#1E2721", 900: "#141B16",
          },
        },
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      fontFamily: { sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"], mono: ["var(--font-geist-mono)", "monospace"] },
      boxShadow: {
        soft: "0 1px 2px 0 rgb(20 32 25 / 0.05)",
        card: "0 1px 3px 0 rgb(20 32 25 / 0.05), 0 4px 12px -4px rgb(20 32 25 / 0.05)",
        raise: "0 12px 32px -8px rgb(20 32 25 / 0.16)",
      },
      transitionTimingFunction: { swift: "cubic-bezier(0.25, 0.1, 0.25, 1)" },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "pulse-soft": { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.55" } },
      },
      animation: { shimmer: "shimmer 1.6s infinite", "pulse-soft": "pulse-soft 2.2s ease-in-out infinite" },
    },
  },
  plugins: [animate],
} satisfies Config;
