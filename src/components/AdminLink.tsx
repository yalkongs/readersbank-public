const ARTICLE = /^\/a\/([^/]+)\/?$/;

/** 글을 읽는 중이면 그 글의 관리 화면으로, 아니면 관리 목록으로 간다. */
export function adminHref(pathname: string | null): string {
  const m = pathname ? ARTICLE.exec(pathname) : null;
  return m ? `/admin/a/${m[1]}` : "/admin";
}
