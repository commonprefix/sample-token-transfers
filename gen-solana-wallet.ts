import { Keypair } from "@solana/web3.js";

const keypair = Keypair.generate();

console.log("Wallet Address:", keypair.publicKey.toBase58());
console.log("Secret key", JSON.stringify(Array.from(keypair.secretKey)));
