import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

const ASCENDER_MARK = "/brand/ascender-mark.png";

type AscenderHomeLinkProps = {
  className?: string;
};

/** Brand book Ascender mark — top-left home navigation. */
export const AscenderHomeLink = ({ className }: AscenderHomeLinkProps) => (
  <Link
    href="/"
    aria-label="IMG Academy Tennis home"
    className={cn("inline-flex shrink-0 rounded-sm p-1 transition-opacity hover:opacity-80", className)}
  >
    <Image
      src={ASCENDER_MARK}
      alt=""
      width={28}
      height={56}
      priority
      className="h-7 w-auto"
    />
  </Link>
);
