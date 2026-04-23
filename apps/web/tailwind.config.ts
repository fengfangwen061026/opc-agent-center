import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        opc: {
          bg: "var(--opc-bg-0)",
          text: "var(--opc-text-0)",
          muted: "var(--opc-text-2)",
          sky: "var(--opc-sky)",
          lavender: "var(--opc-lavender)",
          mint: "var(--opc-mint)",
          rose: "var(--opc-rose)",
        },
      },
      borderRadius: {
        opc: "var(--opc-radius-lg)",
      },
      boxShadow: {
        opc: "var(--opc-shadow-card)",
      },
      fontFamily: {
        sans: "var(--opc-font-sans)",
      },
    },
  },
  plugins: [],
} satisfies Config;
