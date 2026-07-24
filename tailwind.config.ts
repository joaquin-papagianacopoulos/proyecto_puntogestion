import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1a2e22",
        paper: "#f3f6f3",
        line: "#d8e1d9",
        brand: "#1f8a4c",
        accent: "#14532d",
      },
      boxShadow: {
        subtle: "0 1px 2px rgba(26,46,34,0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
