import tailwind from "bun-plugin-tailwind";

const res = await Bun.build({
  entrypoints: ["./src/index.html"],
  outdir: "dist",
  sourcemap: "linked",
  target: "browser",
  minify: true,
  plugins: [tailwind],
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  env: "BUN_PUBLIC_*",
});

if (!res.success) {
  console.error("Build failed:", res.logs);
  process.exit(1);
}

console.log("Build successful!");
