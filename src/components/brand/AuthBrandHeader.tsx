import { TennisWordmark } from "./TennisWordmark";

type AuthBrandHeaderProps = {
  subtitle: string;
};

/** Shared branding block for unauthenticated auth flows. */
export const AuthBrandHeader = ({ subtitle }: AuthBrandHeaderProps) => (
  <div className="flex flex-col items-center gap-4 text-center">
    <TennisWordmark linked />
    <p className="text-sm text-muted-foreground">{subtitle}</p>
  </div>
);
