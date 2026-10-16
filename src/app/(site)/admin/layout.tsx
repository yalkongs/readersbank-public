import { redirect } from "next/navigation";
import { isOwner } from "@/lib/auth/session";

// proxy 외에 서버에서 한 번 더 소유자를 확인한다. 로그인 화면(src/app/admin/login)은 이 레이아웃 밖이라 순환하지 않는다.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isOwner())) redirect("/admin/login");
  return children;
}
