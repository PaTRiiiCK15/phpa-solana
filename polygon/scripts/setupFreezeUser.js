const { FireblocksWeb3Provider, ChainId } = require("@fireblocks/fireblocks-web3-provider");
const { ethers } = require("ethers");
const fs = require("fs");

async function main() {
  const PHPA_ADDRESS = "0xAB9b61022C0f8aC255F5E437Bb303A7E55504987";
  const TARGET = "0x9A62A003Eb05247772Ab87437F6a5A9F3f77aE53";

  const apiKey = process.env.FIREBLOCKS_API_KEY;
  const secretKeyPath = process.env.FIREBLOCKS_SECRET_KEY_PATH;
  const vaultAccountId = process.env.FIREBLOCKS_VAULT_ACCOUNT_ID;
  const privateKey = fs.readFileSync(secretKeyPath, "utf8");

  const fbProvider = new FireblocksWeb3Provider({
    apiKey,
    privateKey,
    vaultAccountIds: vaultAccountId,
    chainId: ChainId.POLYGON_AMOY,
    rpcUrl: "https://polygon-amoy.g.alchemy.com/v2/alch_5ckxOBI9tfkkTYKiexoRB",
  });

  const provider = new ethers.BrowserProvider(fbProvider);
  const signer = await provider.getSigner();

  const abi = [
    "function freeze(address account) external",
    "function isFrozen(address account) view returns (bool)"
  ];
  const phpa = new ethers.Contract(PHPA_ADDRESS, abi, signer);

  console.log("SETUP: Freezing USER-TEST-001 using PHPA-OPS-TESTNET (vault ID 1)...");
  console.log("Signer address:", await signer.getAddress());
  console.log("Target:", TARGET);

  const alreadyFrozen = await phpa.isFrozen(TARGET);
  if (alreadyFrozen) {
    console.log("Address is already frozen. No action needed. Ready for TC-05 and TC-13.");
    return;
  }

  const tx = await phpa.freeze(TARGET);
  console.log("Freeze tx submitted. Hash:", tx.hash);
  await tx.wait();
  console.log("SETUP COMPLETE: USER-TEST-001 is now frozen. Ready for TC-05 and TC-13.");
}

main().catch(console.error);
