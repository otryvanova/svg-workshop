import { defineConfig } from "vite";

const base = process.env.SVG_WORKSHOP_PAGES === "1"
  ? "/svg-workshop/lesson-01/"
  : "/";

export default defineConfig({ base });
