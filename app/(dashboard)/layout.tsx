import { Sidebar } from "../../components/Sidebar";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { ApiAlertModal } from "../../components/ApiAlertModal";
import { AuthGuard } from "../../components/AuthGuard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-background" suppressHydrationWarning>
        <Sidebar />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto focus:outline-none">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
        {/* Global provider (Gemini/Firecrawl/Serper) error & quota modal */}
        <ApiAlertModal />
      </div>
    </AuthGuard>
  );
}
