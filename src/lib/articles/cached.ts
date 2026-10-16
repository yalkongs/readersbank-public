// src/lib/articles/cached.ts
import { cache } from "react";
import { getBySlugForRead, getPublishedBySlug } from "@/lib/articles/repo";

export const getPublishedBySlugCached = cache(getPublishedBySlug);

/** 비공개 글 포함. 권한 확인 후에만 쓴다. OG 이미지·목록은 getPublishedBySlugCached만 쓴다. */
export const getBySlugForReadCached = cache(getBySlugForRead);
