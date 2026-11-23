import type { JSX } from 'react';
import clsx from 'clsx';
import { Tip } from '@/components/bits';
import type { Eval, Run } from '@/data/types';
import { outcomeWord } from '@/lib/evals';
import { formatInt } from '@/lib/format';
import { resultText, resultValue } from '@/lib/runResult';

/** The best value the run held; a filled or hollow dot says whether it reached the eval's target. */
export function ResultCell({ run, e }: { run: Run; e: Eval | undefined }): JSX.Element {
  const value = formatInt(resultValue(run));
  const text = resultText(run, e);
  const word = outcomeWord(run);
  return (
    <Tip content={[e && `${value} ${e.measure.toLowerCase()}`, word !== 'Scored' && word].filter(Boolean).join(', ')}>
      <span className="inline-flex items-center gap-1.5">
        {word !== 'Scored' && (
          <span
            aria-label={word}
            role="img"
            className={clsx(
              'size-2 shrink-0 rounded-full',
              word === 'Finished' ? 'bg-success' : 'border-2 border-danger'
            )}
          />
        )}
        {text}
      </span>
    </Tip>
  );
}
