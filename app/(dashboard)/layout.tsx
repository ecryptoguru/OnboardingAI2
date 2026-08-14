import { Sidebar } from "../../components/Sidebar";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { ApiAlertModal } from "../../components/ApiAlertModal";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background" suppressHydrationWarning>
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
      {/* Global provider (Gemini/Firecrawl/Serper) error & quota modal */}
      <ApiAlertModal />
    </div>
  );
}
