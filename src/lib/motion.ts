/** 동작 줄이기를 켠 기기에서는 부드러운 스크롤 대신 바로 이동한다. */
export function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
