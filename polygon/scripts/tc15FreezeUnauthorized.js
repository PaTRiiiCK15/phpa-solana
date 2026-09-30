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

  const abi = ["function freeze(address account) external"];
  const phpa = new ethers.Contract(PHPA_ADDRESS, abi, signer);

  console.log("TC-15: Attempting freeze() from PHPA-ADMIN-TESTNET (vault ID 2)...");
  console.log("Signer address:", await signer.getAddress());
  console.log("Expected: AccessControl error. PHPA-ADMIN-TESTNET does not hold FREEZER_ROLE.");

  const tx = await phpa.freeze(TARGET);
  await tx.wait();
  console.log("FAIL: Freeze went through. Hash:", tx.hash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("TC-15 Result:", error.message);
    console.log("PASS if error contains AccessControl or unknown custom error.");
    process.exit(1);
  });
