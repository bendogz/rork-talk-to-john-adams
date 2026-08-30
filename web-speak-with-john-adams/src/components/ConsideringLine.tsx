/** Shown between the question and the reply, while Mr. Adams gathers his thoughts. */
export function ConsideringLine({ question }: { question: string }) {
  return (
    <div className="animate-rise-in mx-auto w-full max-w-4xl px-6 text-center">
      <p className="font-serif-voice text-[0.95rem] italic text-[hsl(41_40%_74%/0.85)]">
        &ldquo;{question}&rdquo;
      </p>
      <p className="mt-3 flex items-center justify-center gap-1.5 font-serif-voice text-[1.05rem] text-gold-bright">
        <span>He takes up his pen</span>
        <Dot delay="0ms" />
        <Dot delay="180ms" />
        <Dot delay="360ms" />
      </p>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-[5px] w-[5px] animate-quill-pulse rounded-full bg-gold-bright"
      style={{ animationDelay: delay }}
      aria-hidden="true"
    />
  );
}
