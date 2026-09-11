import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Heart,
  Lightbulb,
  Music2,
  PartyPopper,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { api, visitorId } from '../api';
import { Footer, Header, JourneySteps } from '../components';
import { clearDraft, readDraft, useDraft } from '../hooks/use-draft';
import { rememberMyOrder } from '../my-orders';
import { clearCreationKey, creationKey } from '../submission-attempt';
import type { Story } from '../types';

const intentions = [
  {
    value: 'amizade',
    title: 'A nossa resenha',
    description: 'Amigos, apelidos e boas histórias.',
    icon: Users,
  },
  {
    value: 'amor',
    title: 'Uma história de amor',
    description: 'O que só vocês dois entendem.',
    icon: Heart,
  },
  {
    value: 'presente',
    title: 'Um presente diferente',
    description: 'Aniversário ou surpresa sem data.',
    icon: PartyPopper,
  },
  {
    value: 'homenagem',
    title: 'Uma homenagem',
    description: 'Gente que merece virar canção.',
    icon: Sparkles,
  },
  {
    value: 'livre',
    title: 'Uma ideia minha',
    description: 'Uma fase, uma viagem, um universo.',
    icon: Lightbulb,
  },
] as const;
const schema = z.object({
  intention: z.enum(['amizade', 'amor', 'presente', 'homenagem', 'livre']),
  subjectName: z.string().trim().min(1, 'Conte quem ou o que inspira a música').max(120),
  occasion: z.string().trim().max(240),
  brief: z
    .string()
    .trim()
    .min(10, 'Conte um pouco mais: escreva pelo menos 10 caracteres')
    .max(3000),
  genre: z.string().trim().min(2, 'Escolha ou escreva um estilo').max(80),
  mood: z.string().trim().min(2, 'Escolha ou escreva um clima').max(80),
  genreSelection: z.enum(['preset', 'other']),
  moodSelection: z.enum(['preset', 'other']),
  customGenre: z.string().max(80),
  customMood: z.string().max(80),
  voice: z.enum(['either', 'male', 'female', 'duet']),
  prohibitedTopics: z
    .string()
    .max(1600)
    .refine((value) => {
      const topics = value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      return topics.length <= 10 && topics.every((topic) => topic.length <= 160);
    }, 'Use até 10 assuntos, com até 160 caracteres em cada linha'),
  finalMessage: z.string().trim().max(500),
  buyerName: z.string().trim().min(2, 'Informe seu nome').max(120),
  buyerEmail: z.string().trim().email('Informe um e-mail válido').max(320),
  termsAccepted: z.boolean().refine(Boolean, 'Aceite os termos para continuar'),
  safetyConfirmed: z.boolean().refine(Boolean, 'Confirme que pode usar os detalhes compartilhados'),
  marketingAccepted: z.boolean(),
});
type StoryForm = z.infer<typeof schema>;
const defaults: StoryForm = {
  intention: 'livre',
  subjectName: '',
  occasion: '',
  brief: '',
  genre: 'Pop',
  mood: 'Animado',
  genreSelection: 'preset',
  moodSelection: 'preset',
  customGenre: '',
  customMood: '',
  voice: 'either',
  prohibitedTopics: '',
  finalMessage: '',
  buyerName: '',
  buyerEmail: '',
  termsAccepted: false,
  safetyConfirmed: false,
  marketingAccepted: false,
};
const stepFields: (keyof StoryForm)[][] = [
  ['subjectName', 'occasion'],
  ['brief', 'prohibitedTopics', 'finalMessage'],
  ['genre', 'mood', 'voice'],
  ['buyerName', 'buyerEmail', 'termsAccepted', 'safetyConfirmed'],
];
const stepNames = ['Sua ideia', 'A história', 'O som', 'Tudo pronto'];
const stepTitles = [
  'Toda música começa com alguma coisa.',
  'O detalhe é o que faz a música ser sua.',
  'Como essa história soa?',
  'Uma última olhada. E vamos criar.',
];
const stepDescriptions = [
  'Pode ser uma pessoa, uma turma ou uma ideia que não sai da cabeça.',
  'Não precisa rimar. Escreva do seu jeito e deixe a composição com a gente.',
  'Escolha uma direção. Você pode escrever um estilo ou clima que não esteja aqui.',
  'Confira sua direção criativa e diga onde podemos avisar sobre a entrega.',
];
function initialValues(intention: string | null): StoryForm {
  const stored = readDraft();
  const draft = Object.fromEntries(
    Object.entries(defaults).flatMap(([key, fallback]) =>
      typeof stored[key] === typeof fallback ? [[key, stored[key]]] : [],
    ),
  );
  if (!draft.brief && typeof stored.factsText === 'string') draft.brief = stored.factsText;
  const selected = intentions.find((item) => item.value === intention);
  return {
    ...defaults,
    ...draft,
    genreSelection:
      draft.genreSelection ??
      (typeof draft.genre === 'string' && !genrePresets.includes(draft.genre) ? 'other' : 'preset'),
    moodSelection:
      draft.moodSelection ??
      (typeof draft.mood === 'string' && !moodPresets.includes(draft.mood) ? 'other' : 'preset'),
    customGenre:
      draft.customGenre ??
      (typeof draft.genre === 'string' && !genrePresets.includes(draft.genre) ? draft.genre : ''),
    customMood:
      draft.customMood ??
      (typeof draft.mood === 'string' && !moodPresets.includes(draft.mood) ? draft.mood : ''),
    ...(selected ? { intention: selected.value } : {}),
  } as StoryForm;
}
function InputField({
  form,
  name,
  label,
  placeholder,
  type = 'text',
  autoComplete,
}: {
  form: UseFormReturn<StoryForm>;
  name: 'subjectName' | 'occasion' | 'buyerName' | 'buyerEmail' | 'genre' | 'mood';
  label: string;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
}) {
  const error = form.formState.errors[name];
  return (
    <label className="studio-field">
      {label}
      <input
        {...form.register(name)}
        aria-label={label}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={
          name === 'buyerEmail'
            ? 320
            : name === 'occasion'
              ? 240
              : name === 'genre' || name === 'mood'
                ? 80
                : 120
        }
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
      />
      {error && (
        <small className="error" id={`${name}-error`}>
          {error.message}
        </small>
      )}
    </label>
  );
}
function IdeaStep({ form }: { form: UseFormReturn<StoryForm> }) {
  const selected = useWatch({ control: form.control, name: 'intention' });
  return (
    <>
      <fieldset className="intention-picker">
        <legend>Qual é a sua ideia?</legend>
        <div className="intention-options">
          {intentions.map(({ value, title, description, icon: Icon }) => (
            <label className="intention-option" key={value} data-selected={selected === value}>
              <input type="radio" {...form.register('intention')} value={value} />
              <Icon size={22} aria-hidden="true" />
              <span>
                <b>{title}</b>
                <small>{description}</small>
              </span>
              <Check className="selection-check" size={17} aria-hidden="true" />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="studio-fields">
        <InputField
          form={form}
          name="subjectName"
          label="Quem ou o que inspira a música?"
          placeholder="Ex.: a Bia, nossa viagem, recomeçar…"
        />
        <InputField
          form={form}
          name="occasion"
          label="Qual é a ocasião? (opcional)"
          placeholder="Ex.: aniversário, reencontro… Pode deixar em branco."
        />
      </div>
    </>
  );
}
function StoryStep({ form }: { form: UseFormReturn<StoryForm> }) {
  const brief = useWatch({ control: form.control, name: 'brief' });
  const error = form.formState.errors.brief;
  return (
    <>
      <div className="writing-prompt">
        <Sparkles size={18} aria-hidden="true" />
        <p>
          O que não pode faltar? Pense em uma lembrança, um jeito de falar, um sentimento ou a
          mensagem que quer passar.
        </p>
      </div>
      <label className="studio-field">
        Conte sua história ou ideia
        <textarea
          aria-label="Conte sua história ou ideia"
          {...form.register('brief')}
          placeholder="A Bia transforma qualquer encontro em festa. Na nossa última viagem, ela errou o caminho e descobrimos a melhor praia… Quero uma música sobre essas pequenas aventuras."
          maxLength={3000}
          rows={7}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'brief-error' : 'brief-hint'}
        />
        <small id="brief-hint">
          Pode ser uma história real ou uma criação sua. {brief.length}/3000
        </small>
        {error && (
          <small className="error" id="brief-error">
            {error.message}
          </small>
        )}
      </label>
      <details
        className="creative-extras"
        open={form.formState.errors.prohibitedTopics ? true : undefined}
      >
        <summary>
          Quero acrescentar mais detalhes <span>opcional</span>
        </summary>
        <label className="studio-field">
          Uma frase para entrar na música
          <textarea
            {...form.register('finalMessage')}
            rows={2}
            maxLength={500}
            placeholder="Aquele bordão ou recado especial."
          />
        </label>
        <label className="studio-field">
          O que prefere deixar de fora?
          <textarea
            {...form.register('prohibitedTopics')}
            aria-invalid={form.formState.errors.prohibitedTopics ? 'true' : undefined}
            aria-describedby={
              form.formState.errors.prohibitedTopics ? 'prohibitedTopics-error' : undefined
            }
            rows={2}
            maxLength={1600}
            placeholder="Um assunto por linha, até 10 assuntos."
          />
          {form.formState.errors.prohibitedTopics && (
            <small className="error" id="prohibitedTopics-error">
              {form.formState.errors.prohibitedTopics.message}
            </small>
          )}
        </label>
      </details>
    </>
  );
}
const genrePresets = ['Pop', 'Pagode', 'Sertanejo', 'MPB', 'Funk', 'Rock', 'Rap', 'Forró'];
const moodPresets = ['Animado', 'Emocionante', 'Romântico', 'Engraçado', 'Nostálgico', 'Épico'];
function SoundChoice({
  form,
  name,
  legend,
  label,
  options,
  placeholder,
}: {
  form: UseFormReturn<StoryForm>;
  name: 'genre' | 'mood';
  legend: string;
  label: string;
  options: string[];
  placeholder: string;
}) {
  const selectionKey = name === 'genre' ? 'genreSelection' : 'moodSelection';
  const customKey = name === 'genre' ? 'customGenre' : 'customMood';
  const value = useWatch({ control: form.control, name });
  const selection = useWatch({ control: form.control, name: selectionKey });
  const error = form.formState.errors[name];
  const choose = (choice: string) => {
    form.setValue(selectionKey, choice === 'other' ? 'other' : 'preset', { shouldDirty: true });
    form.setValue(name, choice === 'other' ? form.getValues(customKey) : choice, {
      shouldDirty: true,
      shouldValidate: choice !== 'other',
    });
  };
  return (
    <fieldset className="sound-picker">
      <legend>{legend}</legend>
      <div className="sound-options">
        {[...options, 'other'].map((choice) => (
          <label
            className="sound-option"
            key={choice}
            data-selected={
              choice === 'other'
                ? selection === 'other'
                : selection === 'preset' && value === choice
            }
          >
            <input
              type="radio"
              name={`${name}-choice`}
              value={choice}
              checked={
                choice === 'other'
                  ? selection === 'other'
                  : selection === 'preset' && value === choice
              }
              onChange={() => choose(choice)}
            />
            <span>{choice === 'other' ? 'Outro' : choice}</span>
            <Check size={15} aria-hidden="true" />
          </label>
        ))}
      </div>
      {selection === 'other' && (
        <label className="studio-field custom-sound-field">
          {label}
          <input
            {...form.register(name, {
              onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                form.setValue(customKey, event.target.value, { shouldDirty: true }),
            })}
            aria-label={label}
            placeholder={placeholder}
            maxLength={80}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? `${name}-error` : undefined}
          />
          {error && (
            <small className="error" id={`${name}-error`}>
              {error.message}
            </small>
          )}
        </label>
      )}
    </fieldset>
  );
}
function SoundStep({ form }: { form: UseFormReturn<StoryForm> }) {
  return (
    <>
      <SoundChoice
        form={form}
        name="genre"
        legend="Estilo musical"
        label="Seu estilo"
        options={genrePresets}
        placeholder="Ex.: indie folk brasileiro"
      />
      <SoundChoice
        form={form}
        name="mood"
        legend="Clima da música"
        label="Seu clima"
        options={moodPresets}
        placeholder="Ex.: esperançoso e contemplativo"
      />
      <label className="studio-field">
        Preferência de voz
        <select {...form.register('voice')}>
          <option value="either">Pode me surpreender</option>
          <option value="female">Feminina</option>
          <option value="male">Masculina</option>
          <option value="duet">Dueto</option>
        </select>
      </label>
      <p className="studio-note">
        Estilo, clima e voz orientam a criação. Cada versão pode interpretar sua ideia de um jeito.
      </p>
    </>
  );
}
function ReviewStep({
  form,
  onEdit,
}: {
  form: UseFormReturn<StoryForm>;
  onEdit: (step: number) => void;
}) {
  const values = form.getValues();
  return (
    <>
      <div className="brief-review">
        <div>
          <span className="eyebrow">SUA DIREÇÃO CRIATIVA</span>
          <h2>{values.subjectName}</h2>
          <p>{intentions.find((item) => item.value === values.intention)?.title}</p>
          {values.occasion && <p>{values.occasion}</p>}
          <button type="button" className="link-button" onClick={() => onEdit(0)}>
            Editar ideia
          </button>
        </div>
        <div>
          <p className="brief-preview">{values.brief}</p>
          <button type="button" className="link-button" onClick={() => onEdit(1)}>
            Editar história
          </button>
        </div>
        <div className="review-sound">
          <Music2 size={20} aria-hidden="true" />
          <span>
            {values.genre} · {values.mood}
          </span>
          <button type="button" className="link-button" onClick={() => onEdit(2)}>
            Editar som
          </button>
        </div>
      </div>
      <div className="studio-fields">
        <InputField form={form} name="buyerName" label="Seu nome" autoComplete="name" />
        <InputField
          form={form}
          name="buyerEmail"
          label="Seu e-mail"
          type="email"
          autoComplete="email"
        />
      </div>
      <p className="studio-note">
        Sem criar senha. Guarde o acesso neste navegador para acompanhar sua música.
      </p>
      <div className="studio-consents">
        {(['termsAccepted', 'safetyConfirmed', 'marketingAccepted'] as const).map((name) => (
          <div key={name}>
            <label className="check">
              <input
                type="checkbox"
                {...form.register(name)}
                aria-invalid={form.formState.errors[name] ? 'true' : undefined}
                aria-describedby={form.formState.errors[name] ? `${name}-error` : undefined}
              />
              <span>
                {name === 'termsAccepted' ? (
                  <>
                    Li e aceito os{' '}
                    <Link to="/termos" target="_blank">
                      termos
                    </Link>{' '}
                    e a{' '}
                    <Link to="/privacidade" target="_blank">
                      privacidade
                    </Link>
                    .
                  </>
                ) : name === 'safetyConfirmed' ? (
                  'Posso usar os detalhes compartilhados e não quero conteúdo que humilhe ou exponha alguém.'
                ) : (
                  'Quero receber novidades (opcional).'
                )}
              </span>
            </label>
            {form.formState.errors[name] && (
              <small className="error" id={`${name}-error`}>
                {form.formState.errors[name]?.message}
              </small>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
function saveStory(data: StoryForm): Story {
  return {
    productType: 'custom_song',
    buyerName: data.buyerName,
    buyerEmail: data.buyerEmail,
    subjectName: data.subjectName,
    ...(data.occasion ? { occasion: data.occasion } : {}),
    intention: data.intention,
    brief: data.brief,
    genre: data.genre,
    mood: data.mood,
    voice: data.voice,
    facts: [],
    prohibitedTopics: data.prohibitedTopics
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    ...(data.finalMessage ? { finalMessage: data.finalMessage } : {}),
    safetyConfirmed: data.safetyConfirmed,
    termsAccepted: data.termsAccepted,
    marketingAccepted: data.marketingAccepted,
  };
}
function StudioSidebar({
  step,
  pending,
  goTo,
}: {
  step: number;
  pending: boolean;
  goTo: (step: number) => void;
}) {
  return (
    <aside className="studio-sidebar">
      <p className="eyebrow">SEU PEQUENO ESTÚDIO</p>
      <h2>
        Uma música.
        <br />
        <em>Do seu jeito.</em>
      </h2>
      <ol className="wizard-nav" aria-label="Preparação da história">
        {stepNames.map((name, index) => (
          <li key={name} aria-current={step === index ? 'step' : undefined}>
            <button type="button" disabled={index > step || pending} onClick={() => goTo(index)}>
              <span>{index < step ? <Check size={16} aria-hidden="true" /> : `0${index + 1}`}</span>
              {name}
            </button>
          </li>
        ))}
      </ol>
      <div className="studio-journey">
        <JourneySteps step={1} />
        <p>
          Aqui preparamos sua história. Depois você cria e revisa a letra antes de decidir pelo
          áudio.
        </p>
      </div>
    </aside>
  );
}
const draftLabels = {
  saving: 'Salvando rascunho…',
  saved: 'Rascunho salvo neste navegador',
  error: 'Não foi possível salvar o rascunho',
  idle: 'Seu espaço para começar',
};
function preparationActionLabel(pending: boolean, step: number) {
  if (pending) return 'Salvando…';
  return step === 3 ? 'Salvar história e continuar' : 'Continuar';
}
function CreationAvailability() {
  const configuration = useQuery({
    queryKey: ['configuration'],
    queryFn: api.configuration,
    staleTime: 60_000,
  });
  if (configuration.isLoading)
    return <p className="creation-availability">Verificando a disponibilidade da criação…</p>;
  if (configuration.data?.generation?.lyricsAvailable === true)
    return (
      <p className="creation-availability available">
        <Sparkles size={17} aria-hidden="true" /> Criação da letra disponível. Primeiro, vamos
        preparar sua história.
      </p>
    );
  return (
    <div className="creation-availability">
      <Sparkles size={18} aria-hidden="true" />
      <p>
        <strong>Criação da letra temporariamente indisponível.</strong> Você pode preparar e salvar
        sua história agora. A letra poderá ser criada quando o serviço estiver disponível.
      </p>
    </div>
  );
}
export function CreateStory() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [search] = useSearchParams();
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const form = useForm<StoryForm>({
    resolver: zodResolver(schema),
    shouldFocusError: false,
    defaultValues: initialValues(search.get('ideia')),
  });
  const values = useWatch({ control: form.control });
  const hasDraft = ['subjectName', 'brief', 'buyerEmail', 'buyerName', 'occasion'].some((field) =>
    Boolean(values[field as keyof StoryForm]),
  );
  const saveStatus = useDraft(values, hasDraft);
  useEffect(() => {
    api.sendBeacon('form_started');
  }, []);
  useLayoutEffect(() => {
    heading.current?.focus();
  }, [step]);
  const goTo = (next: number) => setStep(next);
  const submit = useMutation({
    mutationFn: async (data: StoryForm) => {
      const created = await api.createOrder('custom_song', creationKey(), visitorId());
      rememberMyOrder(created.publicId);
      try {
        sessionStorage.setItem('resenha:lastOrder', created.publicId);
      } catch {
        /* Cookie remains the authority. */
      }
      await api.saveStory(created.publicId, saveStory(data));
      return created.publicId;
    },
    onSuccess: (publicId) => {
      void client.invalidateQueries({ queryKey: ['order', publicId] });
      clearCreationKey();
      clearDraft();
      api.sendBeacon('form_completed');
      toast.success('História salva. Acompanhe a criação da letra.');
      navigate(`/criar/letra?pedido=${encodeURIComponent(publicId)}`);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a história.'),
  });
  const next = async () => {
    if (await form.trigger(stepFields[step], { shouldFocus: true })) goTo(step + 1);
  };
  return (
    <>
      <Header hidePrimaryAction />
      <main className="studio-page">
        <div className="studio-topline">
          <Link to="/" className="studio-back">
            <ArrowLeft size={16} aria-hidden="true" /> Voltar ao início
          </Link>
          <span>
            <ShieldCheck size={15} aria-hidden="true" /> A letra vem antes do pagamento
          </span>
        </div>
        <div className="studio-layout">
          <StudioSidebar step={step} pending={submit.isPending} goTo={goTo} />
          <section className="studio-panel">
            <p className="eyebrow">PREPARAÇÃO {step + 1} / 4</p>
            <h1 ref={heading} tabIndex={-1}>
              {stepTitles[step]}
            </h1>
            <p className="studio-intro">{stepDescriptions[step]}</p>
            <CreationAvailability />
            <form
              noValidate
              onSubmit={(event) => {
                if (step < 3) {
                  event.preventDefault();
                  void next();
                } else {
                  void form.handleSubmit(
                    (data) => submit.mutate(data),
                    (errors) => {
                      const first = stepFields.flat().find((field) => errors[field]);
                      if (first) form.setFocus(first);
                    },
                  )(event);
                }
              }}
            >
              {step === 0 && <IdeaStep form={form} />}
              {step === 1 && <StoryStep form={form} />}
              {step === 2 && <SoundStep form={form} />}
              {step === 3 && <ReviewStep form={form} onEdit={goTo} />}
              {submit.isError && (
                <p className="error" role="alert">
                  {submit.error.message}
                </p>
              )}
              <div className="wizard-actions">
                {step > 0 && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => goTo(step - 1)}
                    disabled={submit.isPending}
                  >
                    <ArrowLeft size={17} aria-hidden="true" /> Voltar
                  </button>
                )}
                <button type="submit" className="button primary" disabled={submit.isPending}>
                  {preparationActionLabel(submit.isPending, step)}
                  <ArrowRight size={17} aria-hidden="true" />
                </button>
              </div>
            </form>
            <div className="draft-controls">
              <span role="status">{draftLabels[saveStatus]}</span>
              <details>
                <summary>Sobre seu rascunho</summary>
                <p>
                  O rascunho fica salvo somente neste navegador e neste aparelho. Ele não é enviado
                  até você salvar a história.
                </p>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    form.reset(defaults);
                    clearDraft();
                    clearCreationKey();
                    goTo(0);
                  }}
                >
                  Apagar rascunho
                </button>
              </details>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
