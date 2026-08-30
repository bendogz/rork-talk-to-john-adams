import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-stage px-6">
      <div className="paper-grain relative w-full max-w-md rounded-[10px] border border-[hsl(40_38%_62%/0.7)] bg-[hsl(41_46%_89%/0.95)] px-8 py-10 text-center shadow-[0_20px_50px_hsl(34_45%_3%/0.6)]">
        <span className="pointer-events-none absolute inset-[7px] rounded-[6px] border border-[hsl(40_55%_45%/0.35)]" />

        <h1 className="relative z-[1] font-display text-3xl text-ink">Nothing here</h1>
        <p className="relative z-[1] mt-3 font-serif-voice text-[1.05rem] leading-snug text-[hsl(26_30%_26%)]">
          This page is not among Mr. Adams&rsquo; papers.
        </p>
        <a
          href="/"
          className="relative z-[1] mt-6 inline-flex min-h-[44px] items-center rounded-[5px] bg-wax px-5 py-2.5 font-serif-voice text-[1rem] text-[hsl(41_49%_94%)] transition-[filter,transform] duration-200 hover:brightness-110 active:scale-95"
        >
          Return to the parlour
        </a>
      </div>
    </main>
  );
};

export default NotFound;
