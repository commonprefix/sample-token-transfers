import { PublicKey } from "@solana/web3.js";
import { arrayify, keccak256 } from "ethers/lib/utils";
import { getSolanaChainConfig } from "../common/chains";

// Seed prefixes - these must match the Rust implementation
const ITS_SEED = "interchain-token-service";
const TOKEN_MANAGER_SEED = "token-manager";
const INTERCHAIN_TOKEN_SEED = "interchain-token";
const PREFIX_INTERCHAIN_TOKEN_ID = "interchain-token-id";
const PREFIX_INTERCHAIN_TOKEN_SALT = "interchain-token-salt";
const PREFIX_CANONICAL_TOKEN_SALT = "canonical-token-salt";
const PREFIX_CUSTOM_TOKEN_SALT = "solana-custom-token-salt";
const FLOW_SLOT_SEED = "flow-slot";
const USER_ROLES_SEED = "user-roles";
const CALL_CONTRACT_SIGNING_SEED = "gtw-call-contract";
const GAS_TREASURY_SEED = "gas-service";
const EVENT_AUTHORITY_SEED = "__event_authority";

export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

export function findItsRootPda(itsProgramId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(ITS_SEED)],
    itsProgramId
  );
}

export function findTokenManagerPda(
  itsProgramId: PublicKey,
  itsRootPda: PublicKey,
  tokenId: Uint8Array
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(TOKEN_MANAGER_SEED), itsRootPda.toBuffer(), tokenId],
    itsProgramId
  );
}

export function findInterchainTokenPda( // couldn't find
  itsProgramId: PublicKey,
  itsRootPda: PublicKey,
  tokenId: Uint8Array
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(INTERCHAIN_TOKEN_SEED), itsRootPda.toBuffer(), tokenId],
    itsProgramId
  );
}

export function findFlowSlotPda( // this is no longer used! it is just a value in ITS and TokenManager accounts -> might change?
  itsProgramId: PublicKey,
  tokenManagerPda: PublicKey,
  epoch: number
): [PublicKey, number] {
  const epochBuffer = Buffer.alloc(8);
  epochBuffer.writeBigUInt64LE(BigInt(epoch));
  return PublicKey.findProgramAddressSync(
    [Buffer.from(FLOW_SLOT_SEED), tokenManagerPda.toBuffer(), epochBuffer],
    itsProgramId
  );
}

export function findUserRolesPda(
  itsProgramId: PublicKey,
  resource: PublicKey,
  user: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(USER_ROLES_SEED), resource.toBuffer(), user.toBuffer()],
    itsProgramId
  );
}


export function findMetadataPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
}

export function findCallContractSigningPda(
  itsProgramId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(CALL_CONTRACT_SIGNING_SEED)],
    itsProgramId
  );
}

export function findGatewayRootPda(
  gatewayProgramId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("gateway")],
    gatewayProgramId
  );
}

export function findEventAuthority(
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(EVENT_AUTHORITY_SEED)],
    programId
  );
}

export function findGasTreasuryPda(
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(GAS_TREASURY_SEED)],
    programId
  );
}

// Hash functions matching Rust implementation
export function canonicalInterchainTokenDeploySalt(
  mint: PublicKey
): Uint8Array {
  return arrayify(
    keccak256(
      new Uint8Array([
        ...Buffer.from(PREFIX_CANONICAL_TOKEN_SALT),
        ...mint.toBytes(),
      ])
    )
  );
}

export function interchainTokenDeployerSalt(
  deployer: PublicKey,
  salt: Uint8Array
): Uint8Array {
  return arrayify(
    keccak256(
      new Uint8Array([
        ...Buffer.from(PREFIX_INTERCHAIN_TOKEN_SALT),
        ...deployer.toBytes(),
        ...salt,
      ])
    )
  );
}

export function linkedTokenDeployerSalt(
  deployer: PublicKey,
  salt: Uint8Array
): Uint8Array {
  return arrayify(
    keccak256(
      new Uint8Array([
        ...Buffer.from(PREFIX_CUSTOM_TOKEN_SALT),
        ...deployer.toBytes(),
        ...salt,
      ])
    )
  );
}

export function gasConfigSalt(
): Uint8Array {
  return arrayify(
    keccak256(
      new Uint8Array([
        ...Buffer.from(GAS_CONFIG_SEED),
      ])
    )
  );
}

export function interchainTokenIdInternal(salt: Uint8Array): Uint8Array {
  return arrayify(
    keccak256(
      new Uint8Array([...Buffer.from(PREFIX_INTERCHAIN_TOKEN_ID), ...salt])
    )
  );
}

export function interchainTokenId(
  deployer: PublicKey,
  salt: Uint8Array
): Uint8Array {
  const deploySalt = interchainTokenDeployerSalt(deployer, salt);
  return interchainTokenIdInternal(deploySalt);
}

export function canonicalInterchainTokenId(mint: PublicKey): Uint8Array {
  const salt = canonicalInterchainTokenDeploySalt(mint);
  return interchainTokenIdInternal(salt);
}

export function linkedTokenId(
  deployer: PublicKey,
  salt: Uint8Array
): Uint8Array {
  const linkedTokenSalt = linkedTokenDeployerSalt(deployer, salt);
  return interchainTokenIdInternal(linkedTokenSalt);
}
