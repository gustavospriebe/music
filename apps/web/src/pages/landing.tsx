import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Music } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Footer, Header } from '../components';
import { formatMoney } from '../types';

export function Landing() {
  const catalog = useQuery({ queryKey: ['products'], queryFn: api.products });
  const product = catalog.data?.find(({ type }) => type === 'friend_roast');
  useEffect(() => {
    api.sendBeacon('landing_view');
  }, []);
  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <p className="eyebrow">PRESENTE QUE VIRA MEMÓRIA</p>
          <h1>
            Sua história merece <em>virar refrão.</em>
          </h1>
          <p>
            Conte a resenha da turma, aprove a letra e receba duas versões privadas para celebrar.
          </p>
          <Link className="button primary" to="/criar">
            Criar minha música <ArrowRight size={17} />
          </Link>
          <div className="demo-player" aria-label="Áudio demonstrativo">
            <Music aria-hidden="true" />
            <div>
              <b>Uma resenha inesquecível</b>
              <small>Áudio demo local · não é uma história real</small>
            </div>
          </div>
        </section>
        <section className="section">
          <p className="eyebrow">COMO FUNCIONA</p>
          <h2>Da memória ao play em três passos.</h2>
          <ol className="steps">
            <li>
              <b>1. Conte a história</b>
              <span>Apelidos, fatos e o clima da celebração.</span>
            </li>
            <li>
              <b>2. Aprove a letra</b>
              <span>Edite cada verso antes do pagamento.</span>
            </li>
            <li>
              <b>3. Compartilhe</b>
              <span>Receba duas versões numa página privada.</span>
            </li>
          </ol>
        </section>
        <section className="section tinted">
          <h2>O que você recebe</h2>
          <div className="cards">
            <article className="card">
              <b>Letra personalizada</b>
              <p>Revisável antes de pagar.</p>
            </article>
            <article className="card">
              <b>2 versões</b>
              <p>Para ouvir e baixar depois da revisão.</p>
            </article>
            <article className="card">
              <b>{product ? formatMoney(product.priceCents) : 'Preço indisponível'}</b>
              <p>
                {catalog.isLoading
                  ? 'Consultando o valor do pacote.'
                  : product
                    ? 'Preço do pacote exibido no checkout.'
                    : 'Consulte o valor ao iniciar seu pedido.'}
              </p>
            </article>
          </div>
        </section>
        <section className="section faq">
          <h2>Perguntas frequentes</h2>
          <details>
            <summary>Posso ver a letra antes de pagar?</summary>
            <p>Sim, você revisa e aprova a letra primeiro.</p>
          </details>
          <details>
            <summary>Os áudios demo são reais?</summary>
            <p>Não. Demonstrações locais são identificadas como demo.</p>
          </details>
        </section>
      </main>
      <Footer />
    </>
  );
}
