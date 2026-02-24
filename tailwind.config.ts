import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "hsl(0 0% 0%)",
        foreground: "hsl(0 0% 100%)",
        brand: "hsl(195 100% 60%)",
      },
      spacing: {
        '1': "4px",
        '2': "8px",
        '3': "12px",
        '4': "16px",
        '5': "20px",
        '6': "24px",
        '8': "32px",
      },
      borderRadius: {
        '0': "0.25rem",
        '0.5': "0.5rem",
        'base': "0.5rem",
        'full': "9999px",
      },
      boxShadow: {
        'glow': "0 0 20px -5px rgba(51, 214, 255, 0.4)",
      },
    },
  },
};

export default config;
