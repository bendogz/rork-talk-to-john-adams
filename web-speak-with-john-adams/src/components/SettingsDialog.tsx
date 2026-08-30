import { useEffect, useRef, useState } from "react";
import { Film, KeyRound, Loader2, Play, Shuffle, Trash2, Volume2, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ElevenLabsError,
  fetchElevenLabsVoices,
  speakWithElevenLabs,
  type ElevenLabsVoice,
} from "@/lib/elevenlabs";
import {
  hasBuiltInElevenLabsKey,
  hasBuiltInOpenAIKey,
  updateSettings,
  useAdamsSettings,
  type VoiceProvider,
} from "@/lib/settings";
import {
  fetchMotionOptions,
  isViggleEnabled,
  removeMotionClip,
  setActiveMotionClip,
  setMotionShuffle,
  startMotionRender,
  ViggleError,
  type MotionOption,
} from "@/lib/viggle";
import { cn } from "@/lib/utils";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const VOICE_CHOICES: { id: VoiceProvider; label: string; note: string }[] = [
  { id: "elevenlabs", label: "The Boston voice", note: "ElevenLabs — your own account" },
  { id: "openai", label: "The Capitol voice", note: "OpenAI — spare voice" },
];

const SAMPLE_LINE = "Good day. John Adams, of Braintree, Massachusetts, at your service.";

/**
 * The visitor's own keys, held only in this browser, which put Adams' mind,
 * voice, and hearing in the visitor's hands — ElevenLabs first, OpenAI second.
 */
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const settings = useAdamsSettings();
  const [draftOpenaiKey, setDraftOpenaiKey] = useState<string>("");
  const [draftElevenlabsKey, setDraftElevenlabsKey] = useState<string>("");
  const [saved, setSaved] = useState<boolean>(false);

  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState<boolean>(false);
  const [voicesNote, setVoicesNote] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  // The Motion Atelier: full-body clips rendered by Viggle from his portrait.
  const [motionOptions, setMotionOptions] = useState<MotionOption[]>([]);
  const [motionLoading, setMotionLoading] = useState<boolean>(false);
  const [motionBusy, setMotionBusy] = useState<string | null>(null);
  const [motionNote, setMotionNote] = useState<string | null>(null);
  const [customMotionUrl, setCustomMotionUrl] = useState<string>("");
  const [customMotionName, setCustomMotionName] = useState<string>("");

  const hasOpenaiKey = settings.openaiKey.length > 0;
  const hasElevenlabsKey = settings.elevenlabsKey.length > 0;

  // The account's own voices, ready for choosing whenever a key is entrusted.
  useEffect(() => {
    if (!open || !hasElevenlabsKey) return;
    const controller = new AbortController();
    setVoicesLoading(true);
    setVoicesNote(null);
    fetchElevenLabsVoices(settings.elevenlabsKey, controller.signal)
      .then((list) => setVoices(list))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setVoicesNote(
          error instanceof ElevenLabsError ? error.message : "The voice list could not be fetched.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setVoicesLoading(false);
      });
    return () => controller.abort();
  }, [open, hasElevenlabsKey, settings.elevenlabsKey]);

  // The repertoire, fetched whenever the atelier is opened.
  useEffect(() => {
    if (!open || !isViggleEnabled()) return;
    let cancelled = false;
    setMotionLoading(true);
    setMotionNote(null);
    fetchMotionOptions()
      .then((options) => {
        if (!cancelled) setMotionOptions(options);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMotionNote(
            error instanceof ViggleError ? error.message : "The motion repertoire could not be fetched.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setMotionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // A closed office silences any audition still playing.
  useEffect(() => {
    if (open) return;
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewLoading(false);
  }, [open]);

  const handleSave = (): void => {
    // Only the keys actually typed here are kept; empty fields fall back to
    // the keys built into the app's foundations.
    const patch: { openaiKey?: string; elevenlabsKey?: string } = {};
    if (draftOpenaiKey.trim().length > 0) patch.openaiKey = draftOpenaiKey.trim();
    if (draftElevenlabsKey.trim().length > 0) patch.elevenlabsKey = draftElevenlabsKey.trim();
    updateSettings(patch);
    setDraftOpenaiKey("");
    setDraftElevenlabsKey("");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2600);
  };

  const handleVoiceChange = (provider: VoiceProvider): void => {
    updateSettings({ ttsProvider: provider });
  };

  const handleChooseVoice = (voiceId: string): void => {
    updateSettings({ elevenlabsVoiceId: voiceId });
  };

  const handleAnimate = (option: MotionOption): void => {
    if (motionBusy !== null) return;
    setMotionBusy(option.id);
    setMotionNote(null);
    startMotionRender(option)
      .then(() => {
        setMotionNote(`He is learning “${option.name}” — the clip returns in a few minutes.`);
      })
      .catch((error: unknown) => {
        setMotionNote(error instanceof ViggleError ? error.message : "The motion studio refused the request.");
      })
      .finally(() => setMotionBusy(null));
  };

  const handleCustomMotion = (): void => {
    if (motionBusy !== null) return;
    const url = customMotionUrl.trim();
    if (!/^https?:\/\//.test(url)) {
      setMotionNote("That address does not look like a video the studio can fetch.");
      return;
    }
    const option: MotionOption = {
      id: "",
      name: customMotionName.trim().length > 0 ? customMotionName.trim() : "A gesture of his own",
      kind: "mine",
    };
    setMotionBusy("custom");
    setMotionNote(null);
    startMotionRender(option, url)
      .then(() => {
        setMotionNote(`He is learning “${option.name}” — the clip returns in a few minutes.`);
        setCustomMotionUrl("");
        setCustomMotionName("");
      })
      .catch((error: unknown) => {
        setMotionNote(error instanceof ViggleError ? error.message : "The motion studio refused the request.");
      })
      .finally(() => setMotionBusy(null));
  };

  const handlePreview = (): void => {
    if (previewLoading) return;
    previewAudioRef.current?.pause();
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewLoading(true);
    speakWithElevenLabs(SAMPLE_LINE, { voiceId: settings.elevenlabsVoiceId })
      .then((url) => {
        previewUrlRef.current = url;
        const audio = new Audio(url);
        previewAudioRef.current = audio;
        audio.onended = () => setPreviewLoading(false);
        audio.onerror = () => setPreviewLoading(false);
        void audio.play();
      })
      .catch((error: unknown) => {
        setPreviewLoading(false);
        setVoicesNote(
          error instanceof ElevenLabsError ? error.message : "The voice could not be raised.",
        );
      });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="paper-grain max-h-[85dvh] w-[calc(100%-2rem)] max-w-md gap-5 overflow-y-auto border-[hsl(40_45%_60%/0.5)] bg-[hsl(41_46%_90%)] p-6 text-foreground sm:max-w-md sm:rounded-[8px]">
        <DialogHeader className="text-left">
          <DialogTitle className="font-display text-xl tracking-wide text-ink">
            The Private Offices
          </DialogTitle>
          <DialogDescription className="font-serif-voice text-[0.95rem] leading-relaxed text-[hsl(26_25%_30%)]">
            Entrust your keys and Mr. Adams will think, speak, and hear by way of your own
            accounts. They are kept in this browser alone and sent nowhere but their houses.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="elevenlabs-key" className="flex items-center gap-2 font-sans text-xs font-semibold uppercase tracking-widest text-[hsl(26_25%_32%)]">
              <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
              ElevenLabs key — his voice
            </Label>
            <Input
              id="elevenlabs-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={hasElevenlabsKey ? "A key is already entrusted — enter a new one to replace it" : "Your ElevenLabs API key…"}
              value={draftElevenlabsKey}
              onChange={(event) => setDraftElevenlabsKey(event.target.value)}
              className="font-mono text-[0.85rem]"
            />

            {hasElevenlabsKey ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="voice-choice" className="font-sans text-[0.72rem] uppercase tracking-widest text-[hsl(26_25%_32%)]">
                  Voice from your account
                </Label>
                <div className="flex gap-2">
                  <select
                    id="voice-choice"
                    value={settings.elevenlabsVoiceId}
                    onChange={(event) => handleChooseVoice(event.target.value)}
                    className="min-h-[44px] w-full rounded-[5px] border border-[hsl(40_35%_65%)] bg-[hsl(41_40%_84%/0.6)] px-3 font-sans text-[0.9rem] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(11_55%_35%)]"
                  >
                    {voices.length === 0 ? (
                      <option value="">{voicesLoading ? "Fetching the voices…" : "His standing voice"}</option>
                    ) : (
                      voices.map((voice) => (
                        <option key={voice.voice_id} value={voice.voice_id}>
                          {voice.name}
                        </option>
                      ))
                    )}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePreview}
                    disabled={previewLoading}
                    className="min-h-[44px] shrink-0 border-[hsl(40_35%_65%)] bg-[hsl(41_40%_84%/0.6)] px-3 text-ink hover:bg-[hsl(41_40%_78%)]"
                    aria-label="Hear this voice"
                  >
                    {previewLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Play className="h-4 w-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>
                {voicesNote !== null ? (
                  <p className="font-serif-voice text-[0.82rem] italic text-[hsl(11_50%_32%)]">{voicesNote}</p>
                ) : null}
              </div>
            ) : (
              <p className="font-serif-voice text-[0.85rem] italic text-[hsl(26_22%_38%)]">
                {hasBuiltInElevenLabsKey
                  ? "The house holds a voice key of its own. Keep one here and yours takes precedence."
                  : "Keep your key above and he will speak through your own ElevenLabs account — every voice it holds, yours to choose."}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="openai-key" className="flex items-center gap-2 font-sans text-xs font-semibold uppercase tracking-widest text-[hsl(26_25%_32%)]">
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              OpenAI key — his mind and hearing
            </Label>
            <Input
              id="openai-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={hasOpenaiKey ? "A key is already entrusted — enter a new one to replace it" : "sk-…"}
              value={draftOpenaiKey}
              onChange={(event) => setDraftOpenaiKey(event.target.value)}
              className="font-mono text-[0.85rem]"
            />
            <p className="font-serif-voice text-[0.85rem] italic text-[hsl(26_22%_38%)]">
              {hasOpenaiKey
                ? "A key is in his keeping. Your questions and his answers now run through your account."
                : hasBuiltInOpenAIKey
                  ? "The house holds a mind key of its own. Keep one here and yours takes precedence."
                  : "Without a key, he still answers by the post of this house."}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="flex items-center gap-2 font-sans text-xs font-semibold uppercase tracking-widest text-[hsl(26_25%_32%)]">
              <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
              His voice
            </Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {VOICE_CHOICES.map((choice) => {
                const isSelected = settings.ttsProvider === choice.id;
                const needsKey = choice.id === "openai" && !hasOpenaiKey;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    disabled={needsKey}
                    onClick={() => handleVoiceChange(choice.id)}
                    className={cn(
                      "rounded-[5px] border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                      isSelected
                        ? "border-[hsl(11_55%_35%)] bg-[hsl(11_45%_30%/0.12)]"
                        : "border-[hsl(40_35%_65%)] bg-[hsl(41_40%_84%/0.6)] hover:bg-[hsl(41_40%_80%)]",
                    )}
                  >
                    <span className="block font-display text-[0.95rem] text-ink">{choice.label}</span>
                    <span className="block font-sans text-[0.72rem] text-[hsl(26_20%_38%)]">{choice.note}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="flex items-center gap-2 font-sans text-xs font-semibold uppercase tracking-widest text-[hsl(26_25%_32%)]">
              <Film className="h-3.5 w-3.5" aria-hidden="true" />
              The Motion Atelier — his body
            </Label>

            {!isViggleEnabled() ? (
              <p className="font-serif-voice text-[0.85rem] italic text-[hsl(26_22%_38%)]">
                The motion studio awaits its Viggle key. With one, he learns to pace, sit, and gesture within his own
                picture.
              </p>
            ) : (
              <>
                <p className="font-serif-voice text-[0.85rem] italic text-[hsl(26_22%_38%)]">
                  Choose a motion and he rehearses it in his own portrait — a few minutes in the making, one Viggle
                  credit for each second he moves.
                </p>

                {motionLoading ? (
                  <p className="flex items-center gap-2 font-serif-voice text-[0.85rem] italic text-[hsl(26_22%_38%)]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Fetching the repertoire…
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {motionOptions.map((option) => (
                      <Button
                        key={option.id}
                        type="button"
                        variant="outline"
                        disabled={motionBusy !== null}
                        onClick={() => handleAnimate(option)}
                        className="min-h-[40px] border-[hsl(40_35%_65%)] bg-[hsl(41_40%_84%/0.6)] px-3 text-[0.85rem] text-ink hover:bg-[hsl(41_40%_78%)]"
                      >
                        {motionBusy === option.id ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Wand2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {option.name}
                      </Button>
                    ))}
                    {motionOptions.length === 0 ? (
                      <p className="font-serif-voice text-[0.85rem] italic text-[hsl(26_22%_38%)]">
                        The repertoire is empty for now — lend him a motion below.
                      </p>
                    ) : null}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="motion-url"
                    className="font-sans text-[0.72rem] uppercase tracking-widest text-[hsl(26_25%_32%)]"
                  >
                    Or lend a motion — a public video URL
                  </Label>
                  <Input
                    id="motion-url"
                    type="url"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="https://… a film of the movement itself"
                    value={customMotionUrl}
                    onChange={(event) => setCustomMotionUrl(event.target.value)}
                    className="text-[0.85rem]"
                  />
                  <Input
                    type="text"
                    autoComplete="off"
                    placeholder="What shall he do? (e.g. Paces the floor)"
                    value={customMotionName}
                    onChange={(event) => setCustomMotionName(event.target.value)}
                    className="text-[0.85rem]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={motionBusy !== null || customMotionUrl.trim().length === 0}
                    onClick={handleCustomMotion}
                    className="min-h-[44px] border-[hsl(40_35%_65%)] bg-[hsl(41_40%_84%/0.6)] text-ink hover:bg-[hsl(41_40%_78%)]"
                  >
                    {motionBusy === "custom" ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Wand2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Set him in motion
                  </Button>
                </div>

                {settings.motionClips.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {settings.motionClips.map((clip) => (
                      <div
                        key={clip.id}
                        className="flex items-center justify-between gap-2 rounded-[5px] border border-[hsl(40_35%_65%)] bg-[hsl(41_40%_84%/0.6)] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <span className="block truncate font-display text-[0.9rem] text-ink">{clip.name}</span>
                          <span className="block font-sans text-[0.7rem] text-[hsl(26_20%_38%)]">
                            {clip.status === "rendering"
                              ? "In the studio — a few minutes…"
                              : clip.status === "ready"
                                ? "Ready"
                                : "The studio could not finish it"}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {clip.status === "ready" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setActiveMotionClip(clip.id)}
                              className={cn(
                                "min-h-[36px] px-2 text-[0.75rem]",
                                settings.activeMotionClipId === clip.id
                                  ? "border-[hsl(11_55%_35%)] bg-[hsl(11_45%_30%/0.12)] text-ink"
                                  : "border-[hsl(40_35%_65%)] bg-[hsl(41_40%_84%/0.6)] text-ink hover:bg-[hsl(41_40%_78%)]",
                              )}
                            >
                              {settings.activeMotionClipId === clip.id ? "On stage" : "Stage it"}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeMotionClip(clip.id)}
                            aria-label={`Discard ${clip.name}`}
                            className="min-h-[36px] px-2 text-[hsl(26_20%_38%)] hover:bg-[hsl(41_40%_78%)]"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => setMotionShuffle(!settings.motionShuffle)}
                      className={cn(
                        "flex min-h-[40px] items-center gap-2 rounded-[5px] border px-3 text-left font-sans text-[0.8rem] transition-colors",
                        settings.motionShuffle
                          ? "border-[hsl(11_55%_35%)] bg-[hsl(11_45%_30%/0.12)] text-ink"
                          : "border-[hsl(40_35%_65%)] bg-[hsl(41_40%_84%/0.6)] text-[hsl(26_20%_38%)] hover:bg-[hsl(41_40%_78%)]",
                      )}
                    >
                      <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
                      {settings.motionShuffle
                        ? "He wanders between his motions as he listens"
                        : "He keeps to the chosen motion"}
                    </button>
                  </div>
                ) : null}

                {motionNote !== null ? (
                  <p className="font-serif-voice text-[0.82rem] italic text-[hsl(11_50%_32%)]">{motionNote}</p>
                ) : null}
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p aria-live="polite" className="font-serif-voice text-[0.85rem] italic text-[hsl(11_50%_32%)]">
              {saved ? "Entered into the record." : ""}
            </p>
            <Button
              type="button"
              onClick={handleSave}
              disabled={draftOpenaiKey.trim().length === 0 && draftElevenlabsKey.trim().length === 0}
              className="bg-[hsl(11_68%_33%)] font-display tracking-wide text-[hsl(41_49%_94%)] hover:bg-[hsl(11_60%_29%)]"
            >
              Keep the keys
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
