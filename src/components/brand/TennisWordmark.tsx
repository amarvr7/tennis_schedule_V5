import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

const TENNIS_WORDMARK = "/brand/img-academy-tennis-wordmark.png";

type TennisWordmarkProps = {
  className?: string;
  /** When true, wraps the wordmark in a link to the app home route. */
  linked?: boolean;
};

/** IMG Academy Tennis horizontal wordmark on a white panel (brand-accurate in dark mode). */
export const TennisWordmark = ({ className, linked = false }: TennisWordmarkProps) => {
  const wordmark = (
    <span
      className={cn(
        "inline-flex rounded-md bg-white px-4 py-3 shadow-sm ring-1 ring-black/5",
        className,
      )}
    >
      <Image
        src={TENNIS_WORDMARK}
        alt="IMG Academy Tennis"
        width={320}
        height={96}
        priority
        className="h-auto w-full max-w-[20rem]"
      />
    </span>
  );

  if (!linked) return wordmark;

  return (
    <Link href="/" aria-label="IMG Academy Tennis home" className="inline-flex">
      {wordmark}
    </Link>
  );
};
