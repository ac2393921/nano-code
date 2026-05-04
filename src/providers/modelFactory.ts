import { createOpenAI } from './openai';
import { createAnthropic } from './anthropic';
import { createGoogle } from './google';
import type { LanguageModel } from '../types';

export function createModelFromEnv(): LanguageModel {
    const provider = process.env.LLM_PROVIDER;
    const modelName = process.env.LLM_MODEL;
    const apiKey = process.env.LLM_API_KEY;

    if (!provider) {
        throw new Error('LLM_PROVIDER 環境変数が設定されていません');
    }
    if (!modelName) {
        throw new Error('LLM_MODEL 環境変数が設定されていません');
    }

    switch (provider.toLowerCase()) {
        case 'openai': {
            if (apiKey && !process.env.OPENAI_API_KEY) {
                process.env.OPENAI_API_KEY = apiKey;
            }
            const openai = createOpenAI({ apiKey });
            return openai(modelName);
        }
        case 'anthropic': {
            if (apiKey && !process.env.ANTHROPIC_API_KEY) {
                process.env.ANTHROPIC_API_KEY = apiKey;
            }
            const anthropic = createAnthropic({ apiKey });
            return anthropic(modelName);
        }
        case 'google': {
            if (apiKey && !process.env.GOOGLE_API_KEY) {
                process.env.GOOGLE_API_KEY = apiKey;
            }
            const google = createGoogle({ apiKey });
            return google(modelName);
        }
        default:
            throw new Error(`未対応のプロバイダ: ${provider}. 対応プロバイダ: openai, anthropic, google`);
    }
}