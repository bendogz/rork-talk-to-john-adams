import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Feather } from "lucide-react";

import { WaxSeal } from "@/components/WaxSeal";
import {
  FOUNDATIONS_EPIGRAPH,
  FOUNDATIONS_INTRO,
  FOUNDATIONS_SECTIONS,
  FOUNDATIONS_SOURCES,
  FOUNDATIONS_SUBTITLE,
  FOUNDATIONS_TITLE,
} from "@/lib/foundations";

/** Puts the section's question to Mr. Adams in the live conversation. */
function askAdamsLive(navigate: ReturnType<typeof useNavigate>, question: string): void {
  navigate("/", { state: { pendingQuestion: question } });
}

/**
 * The Foundations essay: the true historical sources of the American order,
 * laid out section by section — each ending with a seal that puts that very
 * question to John Adams himself, live, in the conversation.
 */
export default function Foundations() {
  const navigate = useNavigate();

  const handleAsk = useCallback(
    (question: string): void => {
      askAdamsLive(navigate, question);
    },
    [navigate],
  );

  return (
    <div className="relative min-h-[100dvh] w-full bg-stage">
      {/* Candlelit atmosphere over the whole page */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] animate-candle-flicker bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,hsl(38_78%_55%/0.16),transparent_70%)]"
        aria-hidden="true"
      />

      <div className="relative z-[1] mx-auto w-full max-w-3xl px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-6">
        {/* Top bar: back to the live conversation */}
        <div className="flex justify-start pt-[max(0.9rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-2 rounded-full px-3 py-2 font-serif-voice text-[0.92rem] text-gold-bright/85 transition-colors hover:bg-[hsl(41_60%_50%/0.12)] hover:text-gold-bright"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            Return to Mr. Adams
          </button>
        </div>

        {/* Title block */}
        <header className="pt-8 text-center sm:pt-10">
          <p className="font-serif-voice text-[0.95rem] italic text-gold/80">{FOUNDATIONS_EPIGRAPH}</p>
          <h1 className="text-engraved mt-4 font-display text-[clamp(1.6rem,5vw,2.6rem)] leading-tight text-[hsl(41_58%_86%)]">
            {FOUNDATIONS_TITLE}
          </h1>
          <p className="mt-2 font-serif-voice text-[1rem] text-gold/90 sm:text-[1.08rem]">
            {FOUNDATIONS_SUBTITLE}
          </p>
          <div className="rule-flourish mx-auto mt-6 w-40" aria-hidden="true" />
        </header>

        {/* The essay's introduction */}
        <section className="paper-grain relative mt-9 overflow-hidden rounded-[10px] border border-[hsl(40_38%_62%/0.7)] bg-[hsl(41_46%_89%/0.95)] px-6 py-7 shadow-[0_20px_50px_hsl(34_45%_3%/0.6)] sm:px-9 sm:py-8">
          <span className="pointer-events-none absolute inset-[7px] rounded-[6px] border border-[hsl(40_55%_45%/0.35)]" />
          <div className="relative z-[1] space-y-4">
            {FOUNDATIONS_INTRO.map((paragraph) => (
              <p key={paragraph.slice(0, 40)} className="font-serif-voice text-[1.02rem] leading-relaxed text-ink sm:text-[1.08rem]">
                {paragraph}
              </p>
            ))}
          </div>
        </section>

        {/* The six sections, each with its live seal */}
        <div className="mt-9 space-y-9">
          {FOUNDATIONS_SECTIONS.map((section, index) => (
            <section
              key={section.numeral}
              className="paper-grain animate-rise-in relative overflow-hidden rounded-[10px] border border-[hsl(40_38%_62%/0.7)] bg-[hsl(41_46%_89%/0.95)] px-6 py-7 shadow-[0_20px_50px_hsl(34_45%_3%/0.6)] sm:px-9 sm:py-8"
              style={{ animationDelay: `${120 + index * 90}ms` }}
            >
              <span className="pointer-events-none absolute inset-[7px] rounded-[6px] border border-[hsl(40_55%_45%/0.35)]" />

              <div className="relative z-[1]">
                <div className="flex items-center gap-4">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[hsl(40_50%_40%/0.6)] bg-[hsl(41_40%_80%)] font-display text-[1.05rem] text-[hsl(26_41%_18%)] shadow-[inset_0_1px_2px_hsl(41_60%_92%/0.8),0_2px_6px_hsl(34_45%_3%/0.35)]"
                    aria-hidden="true"
                  >
                    {section.numeral}
                  </span>
                  <h2 className="font-display text-[clamp(1.15rem,3.4vw,1.5rem)] leading-snug text-[hsl(26_41%_16%)]">
                    {section.title}
                  </h2>
                </div>

                <div className="mt-5 space-y-4">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph.slice(0, 40)} className="font-serif-voice text-[1.02rem] leading-relaxed text-[hsl(26_36%_18%)] sm:text-[1.08rem]">
                      {paragraph}
                    </p>
                  ))}
                </div>

                {/* The seal: put this very question to him, live */}
                <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => handleAsk(section.question)}
                    className="group flex min-h-[48px] flex-1 items-center justify-center gap-3 rounded-[6px] border border-[hsl(11_60%_22%/0.8)] px-5 py-3 font-display text-[0.95rem] tracking-wide text-[hsl(41_49%_94%)] shadow-[0_8px_18px_hsl(34_45%_3%/0.5),inset_0_1px_2px_hsl(11_70%_52%/0.45)] transition-transform duration-150 hover:brightness-110 active:scale-[0.98] sm:flex-none sm:px-7"
                    style={{
                      background:
                        "radial-gradient(circle at 34% 28%, hsl(11 62% 44%), hsl(11 70% 27%) 68%, hsl(11 72% 20%))",
                    }}
                  >
                    <Feather
                      className="h-[18px] w-[18px] transition-transform duration-300 group-hover:-rotate-12"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                    Put this question to Mr. Adams — live
                  </button>
                  <p className="font-serif-voice text-[0.9rem] italic leading-snug text-[hsl(26_30%_30%)]">
                    He answers in person, in character.
                  </p>
                </div>
              </div>
            </section>
          ))}
        </div>

        {/* Colophon */}
        <footer className="mt-12 text-center">
          <WaxSeal size={44} className="mx-auto" />
          <p className="mx-auto mt-5 max-w-xl font-serif-voice text-[0.9rem] leading-relaxed text-gold/75">
            {FOUNDATIONS_SOURCES}
          </p>
          <div className="rule-flourish mx-auto mt-6 w-40" aria-hidden="true" />
        </footer>
      </div>
    </div>
  );
}
