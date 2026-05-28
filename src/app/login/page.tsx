import { LoginForm } from "./LoginForm";

const LoginPage = () => {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-xl font-semibold">Academy Scheduling</h1>
        <p className="text-sm text-gray-500">Coach sign in</p>
      </div>
      <LoginForm />
    </main>
  );
};

export default LoginPage;
