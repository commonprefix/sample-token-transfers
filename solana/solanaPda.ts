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
const GAS_CONFIG_SEED = "gas-service";

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

export function findInterchainTokenPda(
  itsProgramId: PublicKey,
  itsRootPda: PublicKey,
  tokenId: Uint8Array
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(INTERCHAIN_TOKEN_SEED), itsRootPda.toBuffer(), tokenId],
    itsProgramId
  );
}

export function findFlowSlotPda(
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

export async function findGasConfigPda(
  gasServiceProgramId: PublicKey
): Promise<[PublicKey, number]> {
  // for now, hardcode the expected value
  // likely there will be changes how the gas config pda is derived in the future:
  // c.f. https://github.com/eigerco/axelar-amplifier-solana/commit/f4da7b6a586f77ce47958e176da39f3ff1595371
  //  but https://github.com/axelarnetwork/axelar-contract-deployments/blob/062efa082fcfcfca593107fbfb90f814c9405dcd/solana/src/gas_service.rs#L83 
  return [new PublicKey("GQ3Yde4evoph1qnogmb8VASZgqzXUxbVKx4oxnNbcZK9"), 0];

  const chainConfig = await getSolanaChainConfig();
  const gasServiceOperator = (chainConfig.config as any)?.contracts?.AxelarGasService?.operator as string | undefined;
  if (!gasServiceOperator) {
    throw new Error("Gas Service Operator address not found in Solana config");
  }
  const gasServiceOperatorPK = new PublicKey(gasServiceOperator);

  console.log("Deriving gas config pda from", GAS_CONFIG_SEED, gasServiceOperatorPK.toBase58());
  console.log("GAS CONFIG SEED: ", gasConfigSalt());
  return PublicKey.findProgramAddressSync(
    [gasConfigSalt(), gasServiceOperatorPK.toBytes()],
    gasServiceProgramId
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
