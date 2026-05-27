#!/usr/bin/env node
// Gera hash PBKDF2-SHA256 compatível com src/auth/password.ts.
// Formato de saída: pbkdf2$<iterations>$<salt-b64url>$<hash-b64url>
//
// Uso:
//   node scripts/hash-password.mjs <senha>   # arg direto (cuidado com history)
//   node scripts/hash-password.mjs            # prompt interativo
//   npm run hash:password                     # via npm script

import crypto from 'node:crypto';
import readline from 'node:readline';

const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function b64urlEncode(buffer) {
    return Buffer.from(buffer)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function deriveBits(password, salt, iterations) {
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, iterations, HASH_BYTES, 'sha256', (err, derived) => {
            if (err) reject(err);
            else resolve(derived);
        });
    });
}

async function hashPassword(password, iterations = ITERATIONS) {
    if (!password) throw new Error('password vazia');
    const salt = crypto.randomBytes(SALT_BYTES);
    const hash = await deriveBits(password, salt, iterations);
    return `pbkdf2$${iterations}$${b64urlEncode(salt)}$${b64urlEncode(hash)}`;
}

async function readPasswordInteractive() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
    });
    return new Promise((resolve) => {
        // Disable echo enquanto digita.
        if (process.stdin.isTTY) {
            process.stdout.write('Senha: ');
            // Echo off simples — não 100% portátil, mas suficiente.
            const stdin = process.openStdin();
            let pw = '';
            stdin.setRawMode(true);
            stdin.resume();
            stdin.on('data', (b) => {
                const ch = b.toString('utf8');
                if (ch === '\r' || ch === '\n') {
                    stdin.setRawMode(false);
                    stdin.pause();
                    process.stdout.write('\n');
                    rl.close();
                    resolve(pw);
                } else if (ch === '') {
                    process.exit(1);
                } else if (ch === '' || ch === '\b') {
                    pw = pw.slice(0, -1);
                } else {
                    pw += ch;
                }
            });
        } else {
            rl.question('Senha: ', (answer) => {
                rl.close();
                resolve(answer);
            });
        }
    });
}

async function main() {
    let password = process.argv[2];
    if (!password) {
        password = await readPasswordInteractive();
    }
    if (!password) {
        console.error('Erro: senha vazia.');
        process.exit(1);
    }
    const hash = await hashPassword(password);
    console.log(hash);
}

main().catch((err) => {
    console.error('Erro:', err.message);
    process.exit(1);
});
