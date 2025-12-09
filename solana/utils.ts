import { Connection, PublicKey } from "@solana/web3.js";
import { getSolanaChainConfig } from "../common/chains";
import { Sha256 } from "@aws-crypto/sha256-js";

/**
 * Computes the Anchor instruction discriminator
 * Equivalent to:
 *   let preimage = format!("global:{}", method_name);
 *   let discriminator = &sha256(preimage.as_bytes())[0..8];
 *
 * @param methodName Anchor instruction name
 * @returns Promise<Buffer> exactly 8 bytes
 */
export async function anchorInstructionDiscriminator(
  methodName: string
): Promise<Buffer> {
  const preimage = `global:${methodName}`;
  const encoder = new TextEncoder();
  const sha = new Sha256();
  sha.update(encoder.encode(preimage));

  const digest = await sha.digest(); // returns Uint8Array (32 bytes)
  return Buffer.from(digest.slice(0, 8)); // first 8 bytes = discriminator
}

export async function getItsProgramId(): Promise<PublicKey> {
  const chainConfig = await getSolanaChainConfig();
  const itsAddr = (chainConfig.config as any)?.contracts?.InterchainTokenService
    ?.address as string | undefined;
  if (!itsAddr) {
    throw new Error(
      "InterchainTokenService address not found in Solana config"
    );
  }
  const fromConfig = new PublicKey(itsAddr);

  return fromConfig;
}

export async function getGatewayProgramId(): Promise<PublicKey> {
  const chainConfig = await getSolanaChainConfig();
  const gatewayAddr = (chainConfig.config as any)?.contracts?.AxelarGateway
    ?.address as string | undefined;
  if (!gatewayAddr) {
    throw new Error("AxelarGateway address not found in Solana config");
  }
  const fromConfig = new PublicKey(gatewayAddr);

  return fromConfig;
}

export async function getAxelarGasServiceProgramId(): Promise<PublicKey> {
  const chainConfig = await getSolanaChainConfig();
  const gasServiceAddr = (chainConfig.config as any)?.contracts
    ?.AxelarGasService?.address as string | undefined;
  if (!gasServiceAddr) {
    throw new Error("AxelarGasService address not found in config");
  }
  const fromConfig = new PublicKey(gasServiceAddr);

  return fromConfig;
}

export function ensureHex(input: string): string {
  return input.startsWith("0x") || input.startsWith("0X")
    ? input.slice(2)
    : input;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = ensureHex(hex);
  return Buffer.from(clean, "hex");
}

export function hexToBytes32(hex: string): number[] {
  const clean = ensureHex(hex);
  const normalized =
    clean.length > 64 ? clean.slice(0, 64) : clean.padStart(64, "0");
  return Array.from(Buffer.from(normalized, "hex"));
}

export function stringToBytes(input: string): Uint8Array {
  // If hex-like, parse as hex; else treat as utf8 bytes
  if (/^(0x)?[0-9a-fA-F]+$/.test(input)) {
    return hexToBytes(input);
  }
  return Buffer.from(input, "utf8");
}

// Borsh encoding helpers
export function encodeVariantU8(index: number): Buffer {
  if (index < 0 || index > 255) throw new Error("variant index out of range");
  return Buffer.from([index]);
}

export function encodeU32LE(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("encodeU32LE expects a non-negative integer");
  }
  const b = Buffer.alloc(4);
  b.writeUInt32LE(value, 0);
  return b;
}

export function encodeU64LE(value: bigint | number | string): Buffer {
  const big = typeof value === "bigint" ? value : BigInt(value);
  if (big < 0n) throw new Error("encodeU64LE expects non-negative");
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(big, 0);
  return b;
}

export function encodeStringBorsh(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([encodeU32LE(bytes.length), bytes]);
}
