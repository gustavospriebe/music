import {
  ArrowDown,
  ArrowRight,
  Check,
  Heart,
  Lightbulb,
  Music2,
  PartyPopper,
  PenLine,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Footer, Header } from '../components';

const ideas = [
  {
    key: 'amizade',
    title: 'A resenha da turma',
    text: 'As histórias que só vocês entendem.',
    icon: Users,
  },
  {
    key: 'amor',
    title: 'O amor de vocês',
    text: 'Do primeiro encontro ao próximo capítulo.',
    icon: Heart,
  },
  {
    key: 'presente',
    title: 'Um presente único',
    text: 'Para surpreender em qualquer ocasião.',
    icon: PartyPopper,
  },
  {
    key: 'homenagem',
    title: 'Uma pessoa especial',
    text: 'O carinho que merece um refrão.',
    icon: Sparkles,
  },
  {
    key: 'livre',
    title: 'Algo só seu',
    text: 'Uma ideia, uma viagem, um recomeço.',
    icon: Lightbulb,
  },
];
export function Landing() {
  useEffect(() => {
    api.sendBeacon('landing_view');
  }, []);
  return (
    <>
      <Header />
      <main className="landing-page">
        <section className="hero-home">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="live-dot" /> HISTÓRIAS REAIS. MÚSICAS ÚNICAS.
            </p>
            <h1>
              Tem coisa que
              <br />
              só uma música
              <br />
              <em>consegue dizer.</em>
            </h1>
            <p>
              Uma piada entre amigos. Um amor. Uma ideia sua. Transforme o que importa em uma música
              com a sua cara.
            </p>
            <Link className="button primary" to="/criar">
              Criar minha música <ArrowRight size={19} aria-hidden="true" />
            </Link>
            <span className="hero-assurance">
              <Check size={16} aria-hidden="true" /> Revise a letra antes de decidir pelo áudio
            </span>
          </div>
          <figure className="hero-moment">
            <img
              src="/images/story-moment.webp"
              alt="Amigos reunidos em casa, compartilhando um momento de música"
              width={1200}
              height={900}
              fetchPriority="high"
            />
            <figcaption>
              <span className="moment-icon">
                <Music2 size={25} aria-hidden="true" />
              </span>
              <span>
                <small>A SUA HISTÓRIA, EM OUTRO RITMO</small>
                <b>Feita para sentir. E dar replay.</b>
              </span>
            </figcaption>
            <span className="image-disclosure">Imagem ilustrativa criada com IA</span>
          </figure>
        </section>
        <div className="promise-strip">
          <span>
            <PenLine size={18} aria-hidden="true" /> Sua história, sua letra
          </span>
          <span>
            <Music2 size={18} aria-hidden="true" /> Duas versões para ouvir
          </span>
          <span>
            <ShieldCheck size={18} aria-hidden="true" /> Entrega em uma página privada
          </span>
          <a href="#como-funciona">
            Como funciona <ArrowDown size={16} aria-hidden="true" />
          </a>
        </div>
        <section className="section ideas-section" id="ideias">
          <div className="section-heading">
            <div>
              <p className="eyebrow">O QUE TE TROUXE AQUI?</p>
              <h2>
                Tem música para
                <br />
                esse momento também.
              </h2>
            </div>
            <p>
              Comece por uma ideia.
              <br />O resto pode ser do seu jeito.
            </p>
          </div>
          <div className="idea-grid">
            {ideas.map(({ key, title, text, icon: Icon }) => (
              <Link className={`idea-card idea-${key}`} to={`/criar?ideia=${key}`} key={key}>
                <Icon size={27} strokeWidth={1.7} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{text}</p>
                <span>
                  Criar a minha <ArrowRight size={16} aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        </section>
        <section className="section process-section" id="como-funciona">
          <div className="section-heading">
            <div>
              <p className="eyebrow">DA IDEIA AO PRIMEIRO PLAY</p>
              <h2>
                Você conta.
                <br />A história ganha voz.
              </h2>
            </div>
            <p>
              Sem precisar saber compor.
              <br />
              Com espaço para deixar tudo com a sua cara.
            </p>
          </div>
          <ol className="process-list">
            <li>
              <span>01</span>
              <h3>Solte a ideia</h3>
              <p>Conte o que inspira sua música e escolha um estilo e um clima.</p>
            </li>
            <li>
              <span>02</span>
              <h3>Encontre as palavras</h3>
              <p>Crie a letra com IA, leia com calma e edite cada verso antes de aprovar.</p>
            </li>
            <li>
              <span>03</span>
              <h3>Decida pelo áudio</h3>
              <p>Confira o valor e as condições. Depois do pagamento, produzimos duas versões.</p>
            </li>
            <li>
              <span>04</span>
              <h3>Guarde esse momento</h3>
              <p>
                Acompanhe a produção e receba as versões para ouvir e baixar na sua página privada.
              </p>
            </li>
          </ol>
        </section>
        <section className="section faq home-faq">
          <div>
            <p className="eyebrow">ANTES DE COMEÇAR</p>
            <h2>
              Ficou alguma
              <br />
              nota no ar?
            </h2>
          </div>
          <div>
            <details>
              <summary>Preciso saber escrever uma música?</summary>
              <p>
                Não. Conte sua ideia com suas palavras. A inteligência artificial ajuda na
                composição e você pode revisar e editar a letra.
              </p>
            </details>
            <details>
              <summary>Só vale música para amigos?</summary>
              <p>
                Vale uma homenagem, uma história de amor, um presente ou uma ideia original. Você
                escolhe o assunto, o estilo e o clima.
              </p>
            </details>
            <details>
              <summary>Como funciona o pagamento?</summary>
              <p>
                Você revisa a letra primeiro. O preço e as condições aparecem antes do pagamento.
                Enquanto o valor do produto estiver em definição, o checkout fica indisponível.
              </p>
            </details>
            <details>
              <summary>Minha música fica pública?</summary>
              <p>
                A entrega acontece em uma página privada. Guarde o link com cuidado e compartilhe
                somente com quem você quiser.
              </p>
            </details>
            <details>
              <summary>O que posso personalizar?</summary>
              <p>
                A história, a letra, o estilo, o clima, a preferência de voz e os assuntos que devem
                ficar de fora. Cada versão de áudio pode interpretar a direção criativa de um jeito.
              </p>
            </details>
          </div>
        </section>
        <section className="closing-note">
          <p className="eyebrow">A PRÓXIMA MÚSICA TEM A SUA HISTÓRIA</p>
          <h2>O refrão começa com você.</h2>
          <Link className="button primary" to="/criar?ideia=livre">
            Começar uma ideia <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
