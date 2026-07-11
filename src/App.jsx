import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate, useSearchParams } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const Index = lazy(() => import("./pages/Index"));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
        <div className="text-sm text-gray-500">加载中...</div>
      </div>
    </div>
  );
}

// ── 路由守卫：未登录重定向到 /login ─────────────────────────
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-500">加载中...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// ── 旧路由兼容重定向 ──────────────────────────────────────
// /tasks → /?tab=tasks, /memos → /?tab=memos, /reading → /?tab=reading
// /tasks/123 → /?tab=tasks&id=123, /memos/456 → /?tab=memos&id=456
function LegacyRedirect({ tab }) {
  const [params] = useSearchParams();
  const id = params.get('id');
  const target = id ? `/?tab=${tab}&id=${id}` : `/?tab=${tab}`;
  return <Navigate to={target} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <HashRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              {/* 主路由：所有功能都在 Index 内通过 ?tab= 和 ?id= 控制 */}
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              {/* 旧路由兼容 → 重定向到 /?tab=xxx */}
              <Route path="/dashboard" element={<Navigate to="/?tab=statistics" replace />} />
              <Route path="/tasks" element={<LegacyRedirect tab="tasks" />} />
              <Route path="/memos" element={<LegacyRedirect tab="memos" />} />
              <Route path="/reading" element={<LegacyRedirect tab="reading" />} />
            </Routes>
          </Suspense>
        </HashRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
