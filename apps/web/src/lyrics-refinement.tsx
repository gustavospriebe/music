import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { api } from './api';

export function LyricsRefinement({
  baseVersion,
  remaining,
  dirty,
  pending,
  readOnly = false,
  onRefine,
}: {
  baseVersion: number;
  remaining: number;
  dirty: boolean;
  pending: boolean;
  readOnly?: boolean;
  onRefine: (instructions: string, baseVersion: number) => void;
}) {
  const [instructions, setInstructions] = useState('');
  const config = useQuery({
    queryKey: ['configuration'],
    queryFn: api.configuration,
    staleTime: 60_000,
  });
  const available = config.data?.generation?.lyricsAvailable === true;
  const disabled = dirty || pending || readOnly || remaining <= 0 || !available;
  return (
    <details className="lyrics-refinement">
      <summary>
        <Sparkles size={18} aria-hidden="true" />
        <span>Quer outra direção para a letra?</span>
      </summary>
      <p>
        Peça à IA uma mudança de tom, estrutura ou refrão usando sua última versão salva como ponto
        de partida.
      </p>
      {dirty && (
        <p className="refinement-notice" role="status">
          Salve ou descarte suas alterações antes de pedir outra direção.
        </p>
      )}
      {remaining <= 0 ? (
        <p className="refinement-notice">
          As criações de letra incluídas neste pedido já foram usadas.
        </p>
      ) : (
        <>
          <div className="refinement-suggestions">
            {[
              {
                label: 'Mais leve',
                text: 'Deixe a letra mais leve, mantendo os detalhes importantes da história.',
              },
              {
                label: 'Refrão marcante',
                text: 'Crie um refrão mais marcante e fácil de cantar, preservando a história.',
              },
              {
                label: 'Mais emoção',
                text: 'Traga mais emoção à letra, sem inventar novos fatos sobre a história.',
              },
            ].map(({ label, text }) => (
              <button
                type="button"
                key={label}
                disabled={disabled}
                onClick={() => setInstructions(text)}
              >
                {label}
              </button>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!disabled && instructions.trim().length >= 3)
                onRefine(instructions.trim(), baseVersion);
            }}
          >
            <label className="studio-field">
              O que você quer mudar?
              <textarea
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                rows={3}
                minLength={3}
                maxLength={1000}
                disabled={disabled}
                placeholder="Ex.: menos brincadeiras, mais emoção no refrão e versos mais curtos."
              />
            </label>
            <p className="studio-note">
              Cada nova criação usa uma tentativa de IA. Você tem {remaining}{' '}
              {remaining === 1 ? 'disponível' : 'disponíveis'}. As versões anteriores continuam no
              histórico.
            </p>
            {!available && (
              <p className="refinement-notice">
                Novas criações estão temporariamente indisponíveis.
              </p>
            )}
            <button
              type="submit"
              className="button secondary"
              disabled={disabled || instructions.trim().length < 3}
            >
              <Sparkles size={16} aria-hidden="true" />
              {pending ? 'Criando nova versão…' : 'Criar nova versão'}
            </button>
          </form>
        </>
      )}
    </details>
  );
}
