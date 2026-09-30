const { ethers } = require("ethers");

async function main() {
  const PHPA_ADDRESS = "0xAB9b61022C0f8aC255F5E437Bb303A7E55504987";
  const USER = "0x9A62A003Eb05247772Ab87437F6a5A9F3f77aE53";

  const provider = new ethers.JsonRpcProvider("https://polygon-amoy.g.alchemy.com/v2/alch_5ckxOBI9tfkkTYKiexoRB");
  const abi = ["function balanceOf(address account) view returns (uint256)"];
  const phpa = new ethers.Contract(PHPA_ADDRESS, abi, provider);

  const balance = await phpa.balanceOf(USER);
  console.log("USER-TEST-001 PHPA balance:", ethers.formatUnits(balance, 18), "PHPA");
}

main().catch(console.error);
