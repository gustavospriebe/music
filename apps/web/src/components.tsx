import {
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  CircleDot,
  CircleHelp,
  Menu,
  Music2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import type { ProductType } from './types';
import { products } from './types';

export function Header({ hidePrimaryAction = false }: { hidePrimaryAction?: boolean }) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeMenu = () => setOpen(false);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      menuButton.current?.focus();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);
  return (
    <header className="site-header">
      <Link className="brand" to="/">
        <Music2 aria-hidden="true" /> música da <strong>resenha</strong>
      </Link>
      <button
        ref={menuButton}
        type="button"
        className="menu-button"
        onClick={() => setOpen(!open)}
        aria-controls="primary-navigation"
        aria-expanded={open}
        aria-label={open ? 'Fechar menu' : 'Abrir menu'}
      >
        {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </button>
      <nav id="primary-navigation" aria-label="Navegação principal" className={open ? 'open' : ''}>
        <NavLink to="/" onClick={closeMenu}>
          Como funciona
        </NavLink>
        <NavLink to="/criar" onClick={closeMenu}>
          Criar
        </NavLink>
        <NavLink to="/minhas-musicas" onClick={closeMenu}>
          Minhas músicas
        </NavLink>
        {!hidePrimaryAction && (
          <Link className="nav-cta" to="/criar" onClick={closeMenu}>
            Criar minha música <ArrowRight size={16} />
          </Link>
        )}
      </nav>
    </header>
  );
}

export function RouteFocus() {
  const { pathname } = useLocation();
  useEffect(() => {
    const main = document.querySelector<HTMLElement>('main');
    if (!main) return;
    main.tabIndex = -1;
    main.focus({ preventScroll: true });
    window.scrollTo({ left: 0, top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
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
    <div className="loading" role="status">
      <Sparkles aria-hidden="true" /> {label}
    </div>
  );
}

const productionSteps = ['História', 'Letra', 'Pagamento', 'Produção do áudio', 'Entrega'];
export function ProductionRail({ step, complete }: { step: number; complete: boolean }) {
  return (
    <ol className="steps production-rail" aria-label="Produção da música">
      {productionSteps.map((label, index) => {
        const number = index + 1;
        const state =
          complete || number < step ? 'Concluído' : number === step ? 'Etapa atual' : 'Aguardando';
        const Marker =
          state === 'Concluído' ? CheckCircle2 : state === 'Etapa atual' ? CircleDot : Circle;
        return (
          <li key={label} data-state={state.toLowerCase().replace(' ', '-')}>
            <Marker className="rail-marker" aria-hidden="true" />
            <b aria-current={!complete && number === step ? 'step' : undefined}>
              {number}. {label}
            </b>
            <span>{state}</span>
          </li>
        );
      })}
    </ol>
  );
}
