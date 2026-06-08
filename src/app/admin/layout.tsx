import { requireAdminCoach } from "@/lib/auth/requireAdmin";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopBar } from "@/components/admin/AdminTopBar";

const AdminLayout = async ({ children }: { children: React.ReactNode }) => {
  const admin = await requireAdminCoach();

  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar />
      <div className="flex min-h-screen flex-col lg:pl-60">
        <AdminTopBar coachName={admin.full_name} coachTitle={admin.title} />
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
};

export default AdminLayout;
