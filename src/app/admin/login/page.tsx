import { login } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="mb-6 text-2xl font-bold">관리자 로그인</h1>
      <form action={login} className="flex flex-col gap-3">
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          placeholder="비밀번호"
          className="rounded-lg border px-3 py-2 text-base"
        />
        {error && (
          <p className="text-sm text-red-600">
            {error === "locked" ? "잠시 후 다시 시도해 주세요." : "비밀번호가 맞지 않습니다."}
          </p>
        )}
        <button type="submit" className="rounded-lg bg-neutral-900 px-3 py-2 text-white">
          로그인
        </button>
      </form>
    </main>
  );
}
