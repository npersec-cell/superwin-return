import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import AdminPanel from "@/components/AdminPanel";

export default async function AdminPage() {
  try {
    const user = await requireAdmin();
    return <AdminPanel adminEmail={user.email} />;
  } catch {
    return (
      <main className="page">
        <div className="app">
          <header className="topbar">
            <div className="brand-text">
              <h1>SUPERWIN RETURN</h1>
              <span>Admin</span>
            </div>
            <Link className="button gold" href="/">Back</Link>
          </header>
          <section className="panel">
            <div className="modal-body">
              <div className="info-block">
                <h4>Access denied</h4>
                <p>This page is available only for admin users.</p>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }
}
