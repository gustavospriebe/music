import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Loading, RouteFocus } from './components';
import {
  Checkout,
  CreateStory,
  Delivery,
  Landing,
  Legal,
  LyricsReview,
  MyOrders,
  NotFound,
  OrderPlayer,
  OrderStatus,
} from './pages/public';
import './styles.css';

const AdminLogin = lazy(async () => ({ default: (await import('./admin/routes')).AdminLogin }));
const AdminDashboard = lazy(async () => ({
  default: (await import('./admin/routes')).AdminDashboard,
}));
const AdminOrders = lazy(async () => ({ default: (await import('./admin/routes')).AdminOrders }));
const AdminOrderDetail = lazy(async () => ({
  default: (await import('./admin/routes')).AdminOrderDetail,
}));
const client = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5_000 } } });
const Admin = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<Loading label="Abrindo administração…" />}>{children}</Suspense>
);
function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/criar" element={<CreateStory />} />
      <Route path="/criar/historia" element={<CreateStory />} />
      <Route path="/criar/letra" element={<LyricsReview />} />
      <Route path="/criar/checkout" element={<Checkout />} />
      <Route path="/minhas-musicas" element={<MyOrders />} />
      <Route path="/pedido/:publicOrderId" element={<OrderStatus />} />
      <Route path="/pedido/:publicOrderId/entrega" element={<OrderPlayer />} />
      <Route path="/entrega/:deliveryToken" element={<Delivery />} />
      <Route path="/privacidade" element={<Legal kind="privacidade" />} />
      <Route path="/termos" element={<Legal kind="termos" />} />
      <Route
        path="/admin/login"
        element={
          <Admin>
            <AdminLogin />
          </Admin>
        }
      />
      <Route
        path="/admin"
        element={
          <Admin>
            <AdminDashboard />
          </Admin>
        }
      />
      <Route
        path="/admin/pedidos"
        element={
          <Admin>
            <AdminOrders />
          </Admin>
        }
      />
      <Route
        path="/admin/pedidos/:orderId"
        element={
          <Admin>
            <AdminOrderDetail />
          </Admin>
        }
      />
      <Route path="/resenha" element={<Navigate to="/" replace />} />
      <Route path="/hino-da-pelada" element={<Navigate to="/" replace />} />
      <Route path="/homenagem" element={<Navigate to="/" replace />} />
      <Route path="/criar/:type" element={<Navigate to="/criar" replace />} />
      <Route path="/pedido/:publicId/letra" element={<Navigate to="/criar/letra" replace />} />
      <Route
        path="/pedido/:publicId/checkout"
        element={<Navigate to="/criar/checkout" replace />}
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <BrowserRouter>
      <RouteFocus />
      <App />
      <Toaster richColors position="top-center" />
    </BrowserRouter>
  </QueryClientProvider>,
);
