// 사이트 설정. 직접 배포할 때는 환경 변수(SITE_URL, SITE_AUTHOR)로 바꾸거나 이 파일을 고친다.

/** 사이트 주소. SITE_URL > Vercel 운영 주소 > 로컬 개발 주소 순으로 고른다. */
export const SITE_URL = (
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
).replace(/\/+$/, "");

/** 만든 사람 표기(소개 화면 서명, 미리보기 이미지의 @핸들). 빈 값이면 표시하지 않는다. */
export const SITE_AUTHOR = process.env.SITE_AUTHOR ?? "";
