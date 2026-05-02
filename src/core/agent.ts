import type { Tool, LanguageModel, Message } from "../types";
import { requestApproval } from "./approval";
import { generateText } from "./generate-text";

// エージェントの設定
export interface AgentConfig {
    name: string; // エージェント名
    instructions: string; // エージェントの指示
    model: LanguageModel; // 使用する言語モデル
    tools: Record<string, any>; // 使用するツール
    maxSteps?: number; // 最大ステップ数
    verbose?: boolean; // 詳細ログ出力
    approvalFunc?: (toolName: string, args: any) => Promise<boolean>; // ツールの承認関数
}

async function executeTool(tool: Tool, args: any): Promise<string> {
    try {
        return await tool.execute(args);
    } catch (error) {
        return `エラーが発生しました: ${(error as Error).message}`;
    }
}

export class Agent {
    private name: string;
    private instructions: string;
    private model: LanguageModel;
    private tools: Tool[];
    private maxSteps: number;
    private verbose: boolean;
    private approvalFunc: (toolName: string, args: any) => Promise<boolean>;

    constructor(config: AgentConfig) {
        this.name = config.name;
        this.instructions = config.instructions;
        this.model = config.model;
        // オブジェクト形式から配列に変換
        this.tools = Object.values(config.tools);
        this.maxSteps = config.maxSteps ?? 10;
        this.verbose = config.verbose ?? false;
        // approvalFuncは承認関数が提供されていない場合はデフォルトの対話的承認を使用
        this.approvalFunc = config.approvalFunc ?? requestApproval;
    }

    async generate(userPrompt: string): Promise<{ text: string }> {
        // ステップ１: 会話ループの開始
        const messages: Message[] = [
            { role: 'system', content: this.instructions },
            { role: 'user', content: userPrompt },
        ];

        let currentStep = 0;
        let finalText = '';
        let toolCallCount = 0;

        while (currentStep < this.maxSteps) {
            currentStep++;

            if (this.verbose) { 
                console.log(`\n=== Step ${currentStep} / ${this.maxSteps} ==`);
            }

            const response = await generateText({
                model: this.model,
                messages,
                tools: this.tools,
            });

            // テキスト応答を保存
            if (response.text) {
                finalText = response.text;
                if (this.verbose) {
                    console.log(`[応答] ${finalText}`);
                }
            }

            // ステップ２：　ツール実行
            if (response.toolCalls && response.toolCalls.length > 0) {
                messages.push({
                    role: 'assistant',
                    content: response.text,
                    toolCalls: response.toolCalls,
                });

                for (const toolCall of response.toolCalls) {
                    const tool = this.tools.find((t) => t.name === toolCall.name);

                    if (!tool) {
                        // ツールが見つからない場合
                        messages.push({
                            role: 'tool',
                            toolCallId: toolCall.toolCallId,
                            name: toolCall.name,
                            content: 'エラー： ツール ${toolCall.name} が見つかりません',
                        })
                        continue;
                    }

                    if (this.verbose) {
                        console.log(`[ツール実行] ${toolCall.name}(${JSON.stringify(toolCall.args)})`);
                    }

                    // ステップ３: 承認チェック
                    if (tool.needsApproval) {
                        const approved = await this.approvalFunc(toolCall.name, toolCall.args);
                        if (!approved) {
                            messages.push({
                                role: 'tool',
                                toolCallId: toolCall.toolCallId,
                                name: toolCall.name,
                                content: 'ユーザーによってキャンセルされました。別の方法を検討してください。',
                            });
                            continue;
                        }
                    }

                    // ツールを実行
                    const result = await executeTool(tool, toolCall.args);
                    toolCallCount++;

                    if (this.verbose) {
                        console.log(`[結果] ${result.slice(0, 200)}${result.length > 200 ? '...' : ''}`);
                    }

                    messages.push({
                        role: 'tool',
                        toolCallId: toolCall.toolCallId,
                        name: toolCall.name,
                        content: result,
                    });
                }

                continue;
            }

            // ツール呼び出しがない場合は完了
            messages.push({
                role: 'assistant',
                content: finalText,
            });
            break;
        }

        if (currentStep >= this.maxSteps) {
            console.warn(`[警告] 最大ステップ数 ${this.maxSteps} に達しました。`);
        }

        // ツール未使用で終了した場合の警告
        if (toolCallCount === 0 && currentStep === 1) {
            console.warn('[警告] ツールを使用せずに終了しました。');
        }

        return { text: finalText };
    }
}