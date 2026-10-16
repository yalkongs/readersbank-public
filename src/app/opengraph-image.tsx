import { OG_SIZE, renderSiteOg } from "@/lib/og-card";

export const runtime = "nodejs";
export const revalidate = 86400;
export const size = OG_SIZE.portrait;
export const contentType = "image/png";
export const alt = "ReadersBank — 읽을 만한 글을 한국어 웹진으로";

export default function Image() {
  return renderSiteOg("portrait");
}
