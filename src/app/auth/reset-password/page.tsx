import { ResetPasswordForm } from "./ResetPasswordForm";
import { AuthBrandHeader } from "@/components/brand/AuthBrandHeader";

const ResetPasswordPage = () => {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <AuthBrandHeader subtitle="Must be at least 8 characters." />
      <ResetPasswordForm />
    </main>
  );
};

export default ResetPasswordPage;
