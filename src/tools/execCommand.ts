import { spawn } from 'child_process';
import * as path from 'path';
import { isArrayBindingElement } from 'typescript';

const WORKSPACE_ROOT = path.resolve(process.cwd(), './workspace');
const ALLOWED_COMMANDS = ['bun', 'ls', 'git', 'gh'];
const MAX_OUTPUT_LENGTH = 2048;

const dangerousChars = /[;&`$]/;

type Quote = '"' | "'" | null;

// 引用符付き引数をサポートする最小限のコマンドパーサ
export function parseCommand(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let quote: Quote = null;
    let escaped = false;

    for (let i = 0; i < input.length; i++) {
        const ch = input[i] as string;

        if (quote) {
            if (escaped) {
                current += ch;
                escaped = false;
                continue;
            }

            if (ch === '\\' && quote === '"') {
                escaped = true;
                continue;
            }

            if (ch === quote) {
                quote = null;
                continue;
            }

            current += ch;
            continue;
        }

        // 引用符のエスケープ以外ではバックスラッシュを保持（Windowsパス対応）
        if (ch === '\\') {
            const nextCh = input[i + 1];
            if (nextCh === '"' || nextCh === "'") {
                current += nextCh;
                i++;
                continue;
            }
            current += ch;
            continue;
        }

        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }

        if (/\s/.test(ch)) {
            if (current.length > 0) {
                tokens.push(current);
                current = '';
            }
            continue;
        }

        current += ch;
    }

    if (quote) {
        throw new Error(`閉じられていない引用符: ${quote}`);
    }

    if (current.length > 0) {
        tokens.push(current);
    }

    return tokens;
}

async function execCommandExecute(args: { command: string }): Promise<string> {
    // 1. 危険文字チェック
    if (dangerousChars.test(args.command)) {
        throw new Error(`コマンド連結・痴漢文字を含むコマンドは実行できません`);
    }

    // 2. コマンドの解析
    const parts = parseCommand(args.command);
    if (parts.length === 0) {
        throw new Error('コマンドが空です');
    }

    const commandName = parts[0] || '';
    const commandArgs = parts.slice(1);

    // 3. ホワイトリストチェック
    if (!ALLOWED_COMMANDS.includes(commandName)) {
        throw new Error(`コマンド ${commandName} は許可されていません。許可されているコマンド： ${ALLOWED_COMMANDS.join('. ')}`);
    }

    // 4. パス引数の検証（ワークスペース内かチェック）
    for (const arg of commandArgs) {
        if (arg.includes('/') || arg.includes('\\')) {
            const resolvedPath = path.resolve(WORKSPACE_ROOT, arg);
            if (!resolvedPath.startsWith(WORKSPACE_ROOT + path.sep) && resolvedPath !== WORKSPACE_ROOT) {
                throw new Error(`アクセス拒否: ${arg} はワークスペース外です`);
            }
        }
    }

    // 5. spawn()で実行（shell: falseでコマンドインジェクション対策）
    return new Promise((resolve, reject) => {
        const child = spawn(commandName, commandArgs, {
            cwd: WORKSPACE_ROOT,
            timeout: 30000,
            shell: false, // シェルを介さない
        });

        let stdout = '';
        let stderr = '';
        let stdoutTruncated = false;
        let stderrTruncated = false;

        child.stdout.on('data', (data: Buffer) => {
            if (stdout.length < MAX_OUTPUT_LENGTH) {
                stdout += data.toString();
                if (stdout.length >= MAX_OUTPUT_LENGTH) {
                    stdoutTruncated = true;
                }
            }
        });

        child.stderr.on('data', (data: Buffer) => {
            if (stderr.length < MAX_OUTPUT_LENGTH) {
                stderr += data.toString();
                if (stderr.length >= MAX_OUTPUT_LENGTH) {
                    stderrTruncated = true;
                }
            }
        });

        child.on('close', (code: number | null) => {
            if (stdoutTruncated) {
                stdout = stdout.slice(0, MAX_OUTPUT_LENGTH) + '\n... (出力が長いため省略されました)';
            }
            if (stderrTruncated) {
                stderr = stderr.slice(0, MAX_OUTPUT_LENGTH) + '\n... (出力が長いため省略されました)';
            }

            if (code === 0) {
                // stderrは必ずしもエラーではない（gitはブランチ切替等をstderrに出力する）
                resolve(stdout + (stderr ? `\n(stderr: ${stderr.trim()})` : ''));
            } else {
                reject(new Error(`コマンドが異常終了しました (exit code: ${code})\n${stderr}`));
            }
        });

        child.on('error', (error: Error) => {
            reject(new Error(`コマンド実行エラー: ${error.message}`));
        });
    });
};

export const execCommand = {
    name: 'execCommand',
    description:
        'ワークスペース内で許可された汎用コマンドを実行する。利用可能：bun、ls、cat、grep、find、pwd、mkdir、git、gh。',
    needsApproval: true,
    parameters: {
        type: 'object',
        properties: {
            command: {
                type: 'string',
                description: "実行するコマンド（例: 'bun test', 'ls -la'）",
            },
        },
        required: ['command'],
    },
    execute: execCommandExecute,
};