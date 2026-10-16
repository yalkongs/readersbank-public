import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["jsdom", "@napi-rs/canvas", "unpdf"],
  // 본문 편집은 글 전체를 한 번에 보낸다. 긴 글(한글 수십만 자)도 저장되게 기본 1MB에서 늘린다.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withWorkflow(nextConfig);
