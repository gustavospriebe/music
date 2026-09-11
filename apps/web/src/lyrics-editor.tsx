import { CheckCircle2, PencilLine, RotateCcw, Save } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { LyricsRefinement } from './lyrics-refinement';
import type { Lyrics, LyricsContent } from './types';
function readingBlocks(text: string) {
  const occurrences = new Map<string, number>();
  return text
    .split(/\n\s*\n/)
    .filter((block) => block.trim())
    .map((block) => {
      const occurrence = (occurrences.get(block) ?? 0) + 1;
      occurrences.set(block, occurrence);
      const match = block.match(/^\s*\[([^\]]+)\]\s*\n/);
      return {
        key: `${block}:${occurrence}`,
        label: match?.[1],
        text: match ? block.slice(match[0].length) : block,
      };
    });
}
export function LyricsReading({ text }: { text: string }) {
  return (
    <div className="lyrics-reading">
      {readingBlocks(text).map((block) => (
        <div className="lyric-stanza" key={block.key}>
          {block.label && <h3>{block.label}</h3>}
          <p>{block.text}</p>
        </div>
      ))}
    </div>
  );
}
function LyricsHistory({
  versions,
  current,
  selected,
  onSelect,
}: {
  versions: Lyrics[];
  current: number;
  selected: number | null;
  onSelect: (number: number | null) => void;
}) {
  if (versions.length < 2) return null;
  return (
    <details className="lyrics-history">
      <summary>Versões anteriores da letra</summary>
      <p>
        O histórico é somente para leitura. Suas alterações na versão atual continuam preservadas.
      </p>
      <div className="history-versions">
        {[...versions]
          .sort((a, b) => b.number - a.number)
          .map((version) => (
            <button
              type="button"
              className="button secondary"
              key={version.number}
              aria-pressed={selected === version.number}
              onClick={() => onSelect(version.number === current ? null : version.number)}
            >
              Versão {version.number}
              {version.number === current ? ' · atual' : ''}
            </button>
          ))}
      </div>
    </details>
  );
}
function LyricsEditFields({
  form,
  busy,
}: {
  form: UseFormReturn<{ title: string; fullLyrics: string }>;
  busy: boolean;
}) {
  return (
    <>
      <label className="studio-field lyric-edit-label">
        Título da música
        <input
          {...form.register('title')}
          maxLength={160}
          disabled={busy}
          aria-label="Título da música"
          aria-invalid={form.formState.errors.title ? 'true' : undefined}
        />
      </label>
      <label className="studio-field lyric-edit-label">
        Edite com suas palavras
        <textarea
          className="lyrics-editor"
          aria-label="Letra da música"
          aria-invalid={form.formState.errors.fullLyrics ? 'true' : undefined}
          aria-describedby={
            form.formState.errors.fullLyrics ? 'fullLyrics-error' : 'lyric-edit-hint'
          }
          {...form.register('fullLyrics')}
          disabled={busy}
        />
      </label>
      <p id="lyric-edit-hint" className="studio-note">
        Troque palavras, escreva novos versos ou remova trechos. Salvar mantém as versões anteriores
        no histórico.
      </p>
    </>
  );
}
function LyricsSheet({
  lyric,
  historical,
  editingVersion,
  form,
  busy,
  onCurrent,
  onEdit,
}: {
  lyric: Lyrics;
  historical: Lyrics | undefined;
  editingVersion: Lyrics | null;
  form: UseFormReturn<{ title: string; fullLyrics: string }>;
  busy: boolean;
  onCurrent: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="lyric-sheet">
      <div className="lyric-sheet-toolbar">
        <span className="eyebrow">
          {historical
            ? 'HISTÓRICO · SOMENTE LEITURA'
            : editingVersion
              ? 'EDITANDO SUA LETRA'
              : 'LETRA PARA REVISÃO'}{' '}
          · VERSÃO {historical?.number ?? editingVersion?.number ?? lyric.number}
        </span>
        {historical ? (
          <button type="button" className="button secondary" onClick={onCurrent}>
            Voltar à versão atual
          </button>
        ) : (
          !editingVersion && (
            <button type="button" className="button secondary" onClick={onEdit} disabled={busy}>
              <PencilLine size={16} aria-hidden="true" />
              Editar letra
            </button>
          )
        )}
      </div>
      {historical ? (
        <>
          <h2 className="history-title">{historical.content.title}</h2>
          <LyricsReading text={historical.content.fullLyrics} />
        </>
      ) : editingVersion ? (
        <LyricsEditFields form={form} busy={busy} />
      ) : (
        <LyricsReading text={lyric.content.fullLyrics} />
      )}
    </div>
  );
}
function LyricsSaveState({
  stale,
  dirty,
  saved,
}: {
  stale: boolean;
  dirty: boolean;
  saved: boolean;
}) {
  return (
    <div className="lyric-save-state" role="status">
      {stale
        ? 'Uma nova versão chegou. Suas alterações continuam aqui; descarte para abrir a versão recente.'
        : dirty
          ? 'Alterações ainda não salvas'
          : saved
            ? 'Nova versão salva.'
            : 'Leia com calma. O áudio será criado com a letra que você aprovar.'}
    </div>
  );
}
const saveActionLabels = {
  saving: 'Salvando versão',
  approving: 'Aprovação em andamento',
  idle: 'Salvar alterações',
};
const approveActionLabels = {
  saving: 'Salvamento em andamento',
  approving: 'Aprovando letra',
  idle: 'Aprovar letra',
};
function LyricsEditorActions({
  stale,
  dirty,
  saved,
  historical,
  editing,
  busy,
  operation,
  onDiscard,
  onApprove,
}: {
  stale: boolean;
  dirty: boolean;
  saved: boolean;
  historical: boolean;
  editing: boolean;
  busy: boolean;
  operation: 'saving' | 'approving' | null;
  onDiscard: () => void;
  onApprove: () => void;
}) {
  return (
    <>
      <LyricsSaveState stale={stale} dirty={dirty} saved={saved} />
      {!historical && (
        <div className="lyric-actions">
          {editing && (
            <>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={onDiscard}
              >
                <RotateCcw size={16} aria-hidden="true" />
                Descartar alterações
              </button>
              <button type="submit" className="button secondary" disabled={busy || !dirty || stale}>
                <Save size={16} aria-hidden="true" />
                {saveActionLabels[operation ?? 'idle']}
              </button>
            </>
          )}
          <button
            type="button"
            className="button primary"
            disabled={busy || dirty || stale}
            onClick={onApprove}
          >
            {approveActionLabels[operation ?? 'idle']}
            <CheckCircle2 size={17} aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}
export function LyricEditor({
  lyric,
  versions,
  onSave,
  onApprove,
  operation,
  saved,
  generating,
  remainingGenerations,
  onRefine,
}: {
  lyric: Lyrics;
  versions: Lyrics[];
  onSave: (number: number, content: LyricsContent) => Promise<void>;
  onApprove: (number: number, content?: LyricsContent) => void;
  operation: 'saving' | 'approving' | null;
  saved: boolean;
  generating: boolean;
  remainingGenerations: number;
  onRefine: (instructions: string, baseVersion: number) => void;
}) {
  const [editingVersion, setEditingVersion] = useState<Lyrics | null>(null);
  const [history, setHistory] = useState<number | null>(null);
  const form = useForm<{ title: string; fullLyrics: string }>({
    defaultValues: { title: lyric.content.title, fullLyrics: lyric.content.fullLyrics },
  });
  const values = useWatch({ control: form.control });
  const draftTitle = values.title ?? '';
  const draftLyrics = values.fullLyrics ?? '';
  const dirty = Boolean(
    editingVersion &&
    (draftTitle !== editingVersion.content.title ||
      draftLyrics !== editingVersion.content.fullLyrics),
  );
  const stale = Boolean(editingVersion && editingVersion.number !== lyric.number);
  const busy = operation !== null || generating;
  const historical = versions.find((version) => version.number === history);
  const startEditing = () => {
    form.reset({ title: lyric.content.title, fullLyrics: lyric.content.fullLyrics });
    setEditingVersion(lyric);
    setHistory(null);
  };
  const discard = () => {
    form.reset({ title: lyric.content.title, fullLyrics: lyric.content.fullLyrics });
    setEditingVersion(null);
  };
  const save = async () => {
    if (!draftTitle.trim()) {
      form.setError('title', { message: 'O título não pode estar vazio.' });
      return;
    }
    if (!draftLyrics.trim()) {
      form.setError('fullLyrics', { message: 'A letra não pode estar vazia.' });
      return;
    }
    if (!editingVersion || stale) return;
    try {
      await onSave(editingVersion.number, {
        ...editingVersion.content,
        title: draftTitle,
        fullLyrics: draftLyrics,
      });
      setEditingVersion(null);
    } catch {
      /* Mutation error stays visible in the workspace; the draft remains intact. */
    }
  };
  return (
    <section className="lyric-workbench">
      <div className="lyric-guidance">
        <PencilLine size={22} aria-hidden="true" />
        <div>
          <h2>Esse é o começo. Seu toque faz a diferença.</h2>
          <p>
            Confira nomes, lembranças e o refrão. Você pode mudar o título e qualquer verso até
            sentir que a letra é sua.
          </p>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <LyricsSheet
          lyric={lyric}
          historical={historical}
          editingVersion={editingVersion}
          form={form}
          busy={busy}
          onCurrent={() => setHistory(null)}
          onEdit={startEditing}
        />
        {form.formState.errors.title && (
          <p className="error" role="alert">
            {form.formState.errors.title.message}
          </p>
        )}
        {form.formState.errors.fullLyrics && (
          <p id="fullLyrics-error" className="error" role="alert">
            {form.formState.errors.fullLyrics.message}
          </p>
        )}
        <LyricsEditorActions
          stale={stale}
          dirty={dirty}
          saved={saved}
          historical={Boolean(historical)}
          editing={Boolean(editingVersion)}
          busy={busy}
          operation={operation}
          onDiscard={discard}
          onApprove={() => onApprove(lyric.number)}
        />
        <p className="approval-hint">
          {dirty
            ? 'Salve ou descarte suas alterações antes de aprovar a letra.'
            : 'Gostou do resultado? Aprovar leva você ao resumo e às condições de pagamento.'}
        </p>
      </form>
      <LyricsHistory
        versions={versions}
        current={lyric.number}
        selected={history}
        onSelect={setHistory}
      />
      <LyricsRefinement
        baseVersion={lyric.number}
        remaining={remainingGenerations}
        dirty={dirty || stale}
        pending={generating}
        readOnly={operation !== null || Boolean(historical)}
        onRefine={onRefine}
      />
    </section>
  );
}
