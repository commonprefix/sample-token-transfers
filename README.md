# Interchain Transfer Example

This is an example of sending ITS token from Sui and XRPL to other chains.

## Preparation

1. Install dependencies:

```bash
bun install
```

2. Setup your `.env` file:

```bash
cp .env.example .env
```

For XRPL, you need to set `XRPL_SEED` in `.env` file. You can generate a wallet seed by running:

```bash
bun xrpl:wallet
```

For Sui, you need to set `SUI_PRIVATE_KEY` in `.env` file.

## Sui ITS Transfer

Send SQD token from Sui to other chain:

```bash
bun sui:start <destination-chain> <destination-address> <amount>
```

Example:

```bash
bun sui:start ethereum-sepolia 0x5eaF5407acc1be854644BE2Be20Ac23D07e491D6 1
```

> Note: the destination address and amount are optional.
> If the destination chain is xrpl, you've to setup the trust line using the recipient account first. See [setup-trust-line](#setup-trust-line)

## XRPL ITS Transfer

Send XRP or SQD from XRPL to other chain. The gas fee is hardcoded to 1 SQD for SQD token, but it'll be calculated automatically for XRP token.

The transfer token will be the same as the gas fee token and the recipient address will receive the deducted token.

```bash
bun xrpl:start <destination-address> <destination-chain> <token-symbol> <amount>
```

Example:

```bash
bun xrpl:start 0x5eaF5407acc1be854644BE2Be20Ac23D07e491D6 ethereum-sepolia SQD 10
```

> Note: the destination chain and amount are optional. destination-address is required.

## Setup Trust Line

Set up a trust line to allow your account to hold tokens issued by another account. The trust line establishes a limit on how many tokens you're willing to accept. You can run the following command to set up the trust line:

```bash
bun xrpl:trust-line <token-symbol> <amount>
```

Example:

```bash
bun xrpl:trust-line SQD 10000
```

## Solana ITS Transfer

Send example token (currently set to 2cc06aa67856613c2220b3321e4824fb6ab5f567ac2ef0b656c4eb5f8e857239) from Solana to other chain:

```bash
bun solana:start <token-id> <token-address> <destination-chain> <destination-address> <amount>
```

Example:

```bash
bun solana:start 2cc06aa67856613c2220b3321e4824fb6ab5f567ac2ef0b656c4eb5f8e857239 8KtHkTM1QbxixhT8UCAzYjh9zGaW7iWkbkS3QRJpTMqz eth-sepolia 0x5eaF5407acc1be854644BE2Be20Ac23D07e491D6 1
```

> Note: the destination address and amount are optional.
> On devnet (currently ITS is deployed only on devnet), Ethereum Sepolia is called "eth-sepolia"
> There is no "gas price" on Solana - transaction fees are fixed, and there is an optional priority fee. 
> The script will display the average prioritization fee as returned by the RPC