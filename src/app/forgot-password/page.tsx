import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { AuthBrandHeader } from "@/components/brand/AuthBrandHeader";

const ForgotPasswordPage = () => {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <AuthBrandHeader subtitle="Enter your email and we'll send you a reset link." />
      <ForgotPasswordForm />
    </main>
  );
};

export default ForgotPasswordPage;
