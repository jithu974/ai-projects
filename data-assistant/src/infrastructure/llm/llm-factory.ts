import type { ILlmProvider } from '../../domain/llm.js';
import type { AppConfig } from '../../shared/config.js';
import { GeminiLlmProvider } from './gemini.llm-provider.js';
import { GroqLlmProvider } from './groq.llm-provider.js';
import { MockLlmProvider } from './mock.llm-provider.js';

export function createLlmProvider(config: AppConfig): ILlmProvider {
  switch (config.LLM_PROVIDER) {
    case 'gemini': {
      if (!config.GEMINI_API_KEY) {
        throw new Error(
          'GEMINI_API_KEY is required when LLM_PROVIDER=gemini. ' +
            'Get a free key at https://aistudio.google.com/apikey or set LLM_PROVIDER=mock for offline testing.',
        );
      }
      return new GeminiLlmProvider(config.GEMINI_API_KEY, config.LLM_MODEL);
    }
    case 'groq': {
      if (!config.GROQ_API_KEY) {
        throw new Error(
          'GROQ_API_KEY is required when LLM_PROVIDER=groq. ' +
            'Get a free key at https://console.groq.com/keys or set LLM_PROVIDER=mock for offline testing.',
        );
      }
      return new GroqLlmProvider(config.GROQ_API_KEY, config.LLM_MODEL, config.LLM_TIMEOUT_MS);
    }
    case 'mock':
      return new MockLlmProvider(config.LLM_MODEL);
  }
}