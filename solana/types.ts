export type InterchainTransferInput = {
  caller: string;
  tokenId: string;
  tokenAddress: string;
  destinationChain: string;
  destinationAddress: string;
  amount: string;
  gasValue: string;
  priorityFee: number;
  payload: Uint8Array;
};

export type GMPCallInput = {
  caller: string;
  destinationChain: string;
  destinationAddress: string;
  gasValue: string;
  priorityFee: number;
  payload: Uint8Array;
};