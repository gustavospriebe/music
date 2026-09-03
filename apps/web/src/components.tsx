import {
  ArrowRight,
  Check,
  CircleHelp,
  Menu,
  Music2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { useState } from 'react';
import type { ProductType } from './types';
import { products } from './types';

export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <Link className="brand" to="/">
        <Music2 aria-hidden="true" /> música da <strong>resenha</strong>
      </Link>
      <button className="menu-button" onClick={() => setOpen(!open)} aria-label="Abrir menu">
        {open ? <X /> : <Menu />}
      </button>
      <nav className={open ? 'open' : ''}>
        <NavLink to="/">Como funciona</NavLink>
        <NavLink to="/criar">Criar</NavLink>
        <NavLink to="/minhas-musicas">Minhas músicas</NavLink>
        <Link className="nav-cta" to="/criar">
          Criar minha música <ArrowRight size={16} />
        </Link>
      </nav>
    </header>
  );
}
export function Footer() {
  return (
    <footer>
      <div className="brand">
        <Music2 /> música da <strong>resenha</strong>
      </div>
      <p>Histórias reais viram música. Você revisa tudo antes de pagar.</p>
      <div>
        <Link to="/">Como funciona</Link>
        <Link to="/admin/login">Administração</Link>
      </div>
      <small>© {new Date().getFullYear()} Música da Resenha. Feito no Brasil.</small>
    </footer>
  );
}
export function ProductPill({ type }: { type: ProductType }) {
  return <span className={`product-pill ${products[type].accent}`}>{products[type].title}</span>;
}
export function TrustLine() {
  return (
    <div className="trust-line">
      <span>
        <ShieldCheck size={17} /> Você revisa a letra antes de pagar
      </span>
      <span>
        <Check size={17} /> Duas versões da sua música
      </span>
      <span>
        <CircleHelp size={17} /> Feito em poucos minutos
      </span>
    </div>
  );
}
export function Loading({ label = 'Preparando...' }: { label?: string }) {
  return (
    <div className="loading">
      <Sparkles /> {label}
    </div>
  );
}
