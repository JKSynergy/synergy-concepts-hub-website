import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sch: {
          orange: "#ED8C22",
          blue: "#1773B9",
        },
      },
    },
  },
  plugins: [],
};

export default config;
