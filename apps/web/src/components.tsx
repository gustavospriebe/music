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
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';

export function Header({ hidePrimaryAction = false }: { hidePrimaryAction?: boolean }) {
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeMenu = () => setOpen(false);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const background = [...document.querySelectorAll('main, footer')];
    background.forEach((element) => {
      element.setAttribute('inert', '');
      element.setAttribute('aria-hidden', 'true');
    });
    const focusables = (): HTMLElement[] => [
      ...(headerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ??
        []),
    ];
    headerRef.current?.querySelector<HTMLElement>('#primary-navigation a[href]')?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        menuButton.current?.focus();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trapFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', trapFocus);
      background.forEach((element) => {
        element.removeAttribute('inert');
        element.removeAttribute('aria-hidden');
      });
    };
  }, [open]);
  return (
    <header className="site-header" ref={headerRef}>
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
      {open ? (
        <div role="dialog" aria-modal="true" aria-label="Menu" className="menu-dialog">
          <nav id="primary-navigation" aria-label="Navegação principal" className="open">
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
        </div>
      ) : (
        <nav id="primary-navigation" aria-label="Navegação principal">
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
      )}
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

const journeyLabels = ['História', 'Letra', 'Pagamento', 'Produção', 'Entrega'] as const;
export function JourneySteps({
  step,
  complete = false,
}: {
  step: 1 | 2 | 3 | 4 | 5;
  complete?: boolean;
}) {
  return (
    <ol className="journey-names" aria-label="Jornada da música">
      {journeyLabels.map((label, index) => (
        <li
          key={label}
          data-state={
            complete || index + 1 < step ? 'complete' : index + 1 === step ? 'current' : 'waiting'
          }
          aria-label={`${label}: ${complete || index + 1 < step ? 'Concluído' : index + 1 === step ? 'Etapa atual' : 'Aguardando'}`}
        >
          <span className="journey-dot" aria-hidden="true">
            {complete || index + 1 < step ? <Check size={12} /> : null}
          </span>
          <span aria-current={index + 1 === step ? 'step' : undefined}>{label}</span>
        </li>
      ))}
    </ol>
  );
}
export function CustomerWorkspace({
  step,
  complete = false,
  className,
  children,
}: {
  step: 1 | 2 | 3 | 4 | 5;
  complete?: boolean;
  className: string;
  children: React.ReactNode;
}) {
  const isDelivery = className.includes('delivery') || step === 5;
  return (
    <>
      <Header hidePrimaryAction />
      <main className={`studio-page customer-workspace ${isDelivery ? 'is-delivery-mode' : ''}`}>
        <div className="studio-topline">
          <Link to="/minhas-musicas" className="studio-back">
            ← Minhas músicas
          </Link>
          <span>
            <ShieldCheck size={15} aria-hidden="true" /> Seu espaço privado de criação
          </span>
        </div>
        <div className="studio-layout">
          <aside className="studio-sidebar">
            <p className="eyebrow">SEU PEQUENO ESTÚDIO</p>
            <h2>
              Uma música.
              <br />
              <em>Do seu jeito.</em>
            </h2>
            <JourneySteps step={step} complete={complete} />
            <p className="workspace-sidebar-note">
              Sua história continua aqui. Acompanhe cada parte da criação neste mesmo espaço.
            </p>
          </aside>
          <section className={`studio-panel ${className}`}>{children}</section>
        </div>
      </main>
      <Footer />
    </>
  );
}
