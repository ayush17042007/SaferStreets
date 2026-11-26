import type { MetadataRoute } from "next";
import { sitemapPaths, site } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapPaths.map((p) => ({
    url: new URL(p, site.origin).toString(),
    changeFrequency: "monthly",
    priority: p === "/" ? 1 : 0.5,
  }));
}
