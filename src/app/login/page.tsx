import { LoginForm } from "./LoginForm";
import { AuthBrandHeader } from "@/components/brand/AuthBrandHeader";

type Props = {
  searchParams: { message?: string; error?: string };
};

const LoginPage = ({ searchParams }: Props) => {
  const successMessage =
    searchParams.message === "password_updated"
      ? "Password updated. Sign in with your new password."
      : null;

  const errorMessage =
    searchParams.error === "reset_link_invalid"
      ? "That reset link is invalid or has expired. Please request a new one."
      : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <AuthBrandHeader subtitle="Coach sign in" />

      {successMessage ? (
        <p
          role="status"
          className="w-full max-w-sm rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300"
        >
          {successMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p
          role="alert"
          className="w-full max-w-sm rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {errorMessage}
        </p>
      ) : null}

      <LoginForm />
    </main>
  );
};

export default LoginPage;
