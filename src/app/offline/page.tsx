import Link from "next/link";

export const metadata = { title: "오프라인" };

export default function OfflinePage() {
  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "4rem 1.25rem" }}>
      <p>오프라인입니다. 최근에 읽은 글은 다시 열 수 있습니다.</p>
      <p>
        <Link href="/">홈으로</Link>
      </p>
    </main>
  );
}
