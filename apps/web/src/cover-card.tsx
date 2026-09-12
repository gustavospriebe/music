import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageDown, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from './api';
import type { AlbumCover } from './types';

const isCreating = (cover: AlbumCover | null) =>
  cover?.status === 'pending' || cover?.status === 'processing';

function CoverArtwork({ cover, downloadUrl }: { cover: AlbumCover; downloadUrl: string }) {
  if (cover.status !== 'completed') return null;
  return (
    <div className="cover-artwork">
      <img src={downloadUrl} alt="Capa gerada por IA para sua música" />
      <a className="button secondary" href={downloadUrl} download>
        <ImageDown size={17} aria-hidden="true" /> Baixar capa
      </a>
    </div>
  );
}

function CoverDisclosure({ cover }: { cover: AlbumCover | null }) {
  return (
    <p className="cover-disclosure">
      <Sparkles size={16} aria-hidden="true" />
      {cover?.hasReference
        ? 'Gerada com inteligência artificial a partir da sua história, letra e foto autorizada.'
        : 'Gerada com inteligência artificial a partir da sua história e letra.'}
    </p>
  );
}

function CoverStatus({ cover }: { cover: AlbumCover | null }) {
  if (isCreating(cover))
    return <p role="status">Criando sua capa. Você pode sair e voltar depois.</p>;
  if (cover?.status === 'failed')
    return (
      <p className="error" role="alert">
        Não foi possível concluir esta capa. A foto enviada já foi descartada; fale com o suporte.
      </p>
    );
  return null;
}

function CompletedOwnerCover({
  cover,
  publicId,
  showRegeneration,
  onRegenerate,
}: {
  cover: AlbumCover | null;
  publicId: string;
  showRegeneration: boolean;
  onRegenerate: () => void;
}) {
  if (cover?.status !== 'completed') return null;
  return (
    <>
      <CoverArtwork cover={cover} downloadUrl={api.coverDownloadUrl(publicId)} />
      <p>{cover.canRegenerate ? '1 nova criação disponível.' : 'Criações incluídas usadas.'}</p>
      {cover.canRegenerate && !showRegeneration && (
        <button type="button" className="button secondary" onClick={onRegenerate}>
          Gerar uma nova capa
        </button>
      )}
    </>
  );
}

function CoverForm({
  visible,
  hasPreviousCover,
  reference,
  consent,
  policyAvailable,
  pending,
  error,
  onReference,
  onConsent,
  onSubmit,
}: {
  visible: boolean;
  hasPreviousCover: boolean;
  reference: File | undefined;
  consent: boolean;
  policyAvailable: boolean;
  pending: boolean;
  error: Error | null;
  onReference: (file: File | undefined) => void;
  onConsent: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!visible) return null;
  return (
    <form className="cover-form" onSubmit={onSubmit}>
      <p>
        A foto é opcional. Aceitamos JPEG, PNG ou WebP de até 8 MB e removemos a referência depois
        da tentativa.
      </p>
      <label>
        Foto de referência (opcional)
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => onReference(event.target.files?.[0])}
        />
      </label>
      {reference && (
        <label className="check">
          <input
            type="checkbox"
            checked={consent}
            disabled={!policyAvailable}
            onChange={(event) => onConsent(event.target.checked)}
          />
          Tenho permissão para usar as pessoas presentes nesta foto.
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error.message}
        </p>
      )}
      <button
        type="submit"
        className="button primary"
        disabled={pending || Boolean(reference && !consent)}
      >
        {pending ? 'Enviando contexto…' : hasPreviousCover ? 'Gerar nova capa' : 'Gerar minha capa'}
      </button>
    </form>
  );
}

export function OwnerCoverCard({ publicId }: { publicId: string }) {
  const queryClient = useQueryClient();
  const [reference, setReference] = useState<File>();
  const [acceptedPolicy, setAcceptedPolicy] = useState<string>();
  const configuration = useQuery({ queryKey: ['configuration'], queryFn: api.configuration });
  const policyVersion = configuration.data?.commercial.policyVersion ?? undefined;
  const consent = Boolean(acceptedPolicy && acceptedPolicy === policyVersion);
  const [showRegeneration, setShowRegeneration] = useState(false);
  const queryKey = ['cover', 'owner', publicId] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => api.cover(publicId),
    refetchInterval: ({ state }) => (isCreating(state.data?.cover ?? null) ? 2_000 : false),
  });
  const create = useMutation({
    mutationFn: () => api.createCover(publicId, reference, consent, acceptedPolicy),
    onSuccess: async (cover) => {
      queryClient.setQueryData(queryKey, { available: true, cover });
      setShowRegeneration(false);
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  if (query.isLoading) return <p role="status">Carregando opção de capa…</p>;
  if (query.isError || !query.data) return null;
  if (!query.data.available)
    return (
      <section className="cover-card" aria-labelledby="cover-title">
        <h2 id="cover-title">Capa da música</h2>
        <p>A criação de capa está indisponível neste ambiente.</p>
      </section>
    );
  const cover = query.data.cover;
  const showForm = !cover || showRegeneration;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate();
  };
  return (
    <section className="cover-card" aria-labelledby="cover-title">
      <div className="cover-card-heading">
        <p className="eyebrow">EXTRA CRIATIVO</p>
        <h2 id="cover-title">Uma capa para a sua música</h2>
      </div>
      <CoverDisclosure cover={cover} />
      <CoverStatus cover={cover} />
      <CompletedOwnerCover
        cover={cover}
        publicId={publicId}
        showRegeneration={showRegeneration}
        onRegenerate={() => setShowRegeneration(true)}
      />
      <CoverForm
        visible={showForm && !isCreating(cover) && cover?.status !== 'failed'}
        hasPreviousCover={Boolean(cover)}
        reference={reference}
        consent={consent}
        policyAvailable={Boolean(policyVersion)}
        pending={create.isPending}
        error={create.error}
        onReference={(file) => {
          setReference(file);
          setAcceptedPolicy(undefined);
        }}
        onConsent={(value) => setAcceptedPolicy(value ? policyVersion : undefined)}
        onSubmit={submit}
      />
    </section>
  );
}

export function DeliveryCoverCard({ token }: { token: string }) {
  const query = useQuery({
    queryKey: ['cover', 'delivery', token],
    queryFn: () => api.deliveryCover(token),
  });
  const cover = query.data?.cover;
  if (query.isLoading) return <p role="status">Carregando capa…</p>;
  if (!cover || cover.status !== 'completed') return null;
  return (
    <section className="cover-card" aria-labelledby="delivery-cover-title">
      <p className="eyebrow">CAPA DA MÚSICA</p>
      <h2 id="delivery-cover-title">Leve também a arte</h2>
      <CoverDisclosure cover={cover} />
      <CoverArtwork cover={cover} downloadUrl={api.deliveryCoverDownloadUrl(token)} />
    </section>
  );
}
