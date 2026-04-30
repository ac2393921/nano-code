import { FunctionResponse, GoogleGenAI } from '@google/genai';
import type {
  GenerateParams,
  GenerateTextResult,
  LanguageModel,
  Provider,
  Message,
  ToolCall,
} from '../types';
import { LLMApiError } from '../types';
import { isFunctionDeclaration } from 'typescript';

export function createGoogle(config?: { apiKey?: string; }): Provider {
  const client = new GoogleGenAI({
    apiKey: config?.apiKey,
  });

  // Nano Code Message -> OpenAI形式へ変換
  function convertMessages(messages: Message[]) {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        if (m.role === 'tool') {
          return {
            role: 'user' as const,
            parts: [
              {
                functionResponse: {
                  name: m.name,
                  response: { result: m.content }
                },
              },
            ],
          };
        }
        if (m.role === 'assistant' && m.toolCalls) {
          const parts: any[] = [];
          if (m.content) {
            parts.push({ text: m.content });
          }
          for (const tc of m.toolCalls) {
            parts.push({
              functionCall: { name: tc.name, args: tc.args },
            });
          }
          return { role: 'model' as const, parts };
        }
        const role = m.role === 'assistant' ? 'model' : 'user';
        return { role: role as 'user' | 'model', parts: [{ text: m.content }] };
      });
  }

  // finishReasonマッピング
  function mapFinishReason(
    reason: string | undefined,
    hasFunctionCalls: boolean
  ): GenerateTextResult['finishReason'] {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
        return 'content_filter';
      default:
        return 'stop';
    }
  }

  return (modelId: string): LanguageModel => ({
    async doGenerate(params: GenerateParams): Promise<GenerateTextResult> {
      const systemMessages = params.messages.filter((m) => m.role === 'system');
      const systemInstruction = systemMessages.map((m) => m.content).join('\n');

      //　ツール定義をOpenAI形式に変換
      const tools = params.tools?.length
        ? [
          {
            functionDeclarations: params.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            })),
          },
        ]
        : undefined;

      try {
        const response = await client.models.generateContent({
          model: modelId,
          contents: convertMessages(params.messages),
          config: {
            systemInstruction,
            temperature: params.temperature,
            maxOutputTokens: params.maxTokens,
            ...(tools && { tools }),
          },
        });

        const canditdate = response.candidates?.[0];
        const parts = canditdate?.content?.parts ?? [];

        // partsからテキストとfunctionCallを抽出
        const textParts = parts.filter((p: any) => p.text);
        const text = textParts.map((p: any) => p.text).join('');

        const functionCallParts = parts.filter((p: any) => p.functionCall);
        const toolCalls: ToolCall[] | undefined =
          functionCallParts.length > 0
            ? functionCallParts.map((p: any, i: number) => ({
              toolCallId: p.functionCall.id,
              name: p.functionCall.name,
              args: p.functionCall.args,
            }))
            : undefined;

        return {
          text,
          finishReason: mapFinishReason(
            canditdate?.finishReason,
            functionCallParts.length > 0
          ),
          toolCalls: toolCalls,
          usage: {
            promptTokens: response.usageMetadata?.promptTokenCount,
            completionTokens: response.usageMetadata?.candidatesTokenCount,
            totalTokens: response.usageMetadata?.totalTokenCount,
          },
        };
      } catch (error: any) {
        throw new LLMApiError(
          error.status ?? 500,
          'google',
          error.code,
          error.message,
          error
        );
      }
    },
  });
}
