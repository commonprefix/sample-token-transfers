import { Keypair, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";

export function getSolanaKeypair(): Keypair {
  if (!process.env.SOLANA_PRIVATE_KEY) {
    throw new Error("SOLANA_PRIVATE_KEY not set");
  }

  const decodedPrivateKey = Uint8Array.from(JSON.parse(process.env.SOLANA_PRIVATE_KEY));
  const keypair = Keypair.fromSecretKey(decodedPrivateKey);

  return keypair;
}

export async function fundWallet(connection: Connection, keypair: Keypair) {
  // Request an airdrop of 2 SOL
  const signature = await connection.requestAirdrop(
    keypair.publicKey,
    2 * LAMPORTS_PER_SOL
  );

  // Wait for confirmation
  await connection.confirmTransaction(signature, "confirmed"); // this is deprecated, but the docs for requestAirdrop specify this

  // Check balance
  const balance = await connection.getBalance(keypair.publicKey);
  return balance;
} 