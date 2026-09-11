import { LogOut } from 'lucide-react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Header } from '../components';

function Logout() {
  const nav = useNavigate();
  return (
    <button
      className="button secondary"
      onClick={() => void api.adminLogout().finally(() => nav('/admin/login'))}
    >
      <LogOut size={16} /> Sair
    </button>
  );
}

/** Shell administrativo persistente: navegação entre visão geral e pedidos. */
export function AdminShell({
  section,
  title,
  children,
}: {
  section: 'overview' | 'orders';
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Header hidePrimaryAction />
      <div className="admin-shell">
        <nav aria-label="Administração" className="admin-nav">
          <NavLink to="/admin" end className={({ isActive }) => (isActive ? 'active' : undefined)}>
            Visão geral
          </NavLink>
          <NavLink
            to="/admin/pedidos"
            className={({ isActive }) => (isActive ? 'active' : undefined)}
          >
            Pedidos
          </NavLink>
          <span className="admin-env">Operação · dados sintéticos fora de produção</span>
        </nav>
        <main className="admin" aria-labelledby="admin-title">
          <div className="admin-head">
            <div>
              <p className="eyebrow">
                ADMINISTRAÇÃO · {section === 'overview' ? 'VISÃO GERAL' : 'PEDIDOS'}
              </p>
              <h1 id="admin-title">{title}</h1>
            </div>
            <Logout />
          </div>
          {children}
          <p>
            <Link to="/">← Voltar à página pública</Link>
          </p>
        </main>
      </div>
    </>
  );
}
