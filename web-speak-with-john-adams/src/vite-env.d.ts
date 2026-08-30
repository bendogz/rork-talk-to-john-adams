/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly EXPO_PUBLIC_TOOLKIT_URL?: string;
  readonly EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY?: string;
  readonly EXPO_PUBLIC_PROJECT_ID?: string;
  /** Built into the app: ElevenLabs account that gives Adams his voice. */
  readonly VITE_ELEVENLABS_API_KEY?: string;
  /** Built into the app: OpenAI account behind his mind and hearing. */
  readonly VITE_OPENAI_API_KEY?: string;
  /** Built into the app: D-ID account that renders the living portrait. */
  readonly VITE_DID_API_KEY?: string;
  /** Built into the app: Viggle account that animates his whole body. */
  readonly VITE_VIGGLE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
