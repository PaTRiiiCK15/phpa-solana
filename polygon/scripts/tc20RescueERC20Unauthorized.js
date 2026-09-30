const { FireblocksWeb3Provider, ChainId } = require("@fireblocks/fireblocks-web3-provider");
const { ethers } = require("ethers");
const fs = require("fs");

async function main() {
  const PHPA_ADDRESS = "0xAB9b61022C0f8aC255F5E437Bb303A7E55504987";
  const RECIPIENT = "0x9A62A003Eb05247772Ab87437F6a5A9F3f77aE53";
  const AMOUNT = ethers.parseUnits("1", 18);

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

  const abi = ["function rescueERC20(address token, address to, uint256 amount) external"];
  const phpa = new ethers.Contract(PHPA_ADDRESS, abi, signer);

  console.log("TC-20: Attempting rescueERC20() from PHPA-OPS-TESTNET (vault ID 1)...");
  console.log("Signer address:", await signer.getAddress());
  console.log("Expected: AccessControl error. PHPA-OPS-TESTNET does not hold DEFAULT_ADMIN_ROLE.");

  const tx = await phpa.rescueERC20(PHPA_ADDRESS, RECIPIENT, AMOUNT);
  await tx.wait();
  console.log("FAIL: rescueERC20 went through. Hash:", tx.hash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("TC-20 Result:", error.message);
    console.log("PASS if error contains AccessControl or unknown custom error.");
    process.exit(1);
  });
