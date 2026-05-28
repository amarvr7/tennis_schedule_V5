type CoachAvatarProps = {
  fullName: string;
  initials: string | null;
  size?: "sm" | "lg";
};

const SIZE_CLASSES: Record<NonNullable<CoachAvatarProps["size"]>, string> = {
  sm: "h-10 w-10 text-xs",
  lg: "h-14 w-14 text-sm",
};

/** Square initials badge. Falls back to the first letters of the full name. */
export const CoachAvatar = ({ fullName, initials, size = "sm" }: CoachAvatarProps) => {
  const label =
    initials?.trim() ||
    fullName
      .split(" ")
      .map((part) => part.charAt(0))
      .join("")
      .slice(0, 3)
      .toUpperCase();

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-lg bg-gray-900 font-semibold tracking-wide text-white ${SIZE_CLASSES[size]}`}
    >
      {label}
    </span>
  );
};
