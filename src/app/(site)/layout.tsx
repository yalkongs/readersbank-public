import Link from "next/link";
import { AutoHideHeader } from "@/components/AutoHideHeader";
import { HeaderMenu } from "@/components/HeaderMenu";
import { isOwner } from "@/lib/auth/session";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const owner = await isOwner();
  return (
    <>
      <AutoHideHeader>
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <Link href="/" className="text-[19px] font-extrabold leading-none tracking-tight">
            ReadersBank
          </Link>
          <HeaderMenu owner={owner} />
        </div>
      </AutoHideHeader>
      {children}
    </>
  );
}
