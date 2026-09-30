const { ethers } = require("ethers");

async function main() {
  const PHPA_ADDRESS = "0xAB9b61022C0f8aC255F5E437Bb303A7E55504987";
  const OPS = "0x38d6030282DE5C10B3601117EaFE7106372f41C4";
  const ADMIN = "0xEE6ff5444b8ff9aEb2acB06388e9156E9b526503";

  const provider = new ethers.JsonRpcProvider("https://polygon-amoy.g.alchemy.com/v2/alch_5ckxOBI9tfkkTYKiexoRB");

  const abi = [
    "function FREEZER_ROLE() view returns (bytes32)",
    "function MINTER_ROLE() view returns (bytes32)",
    "function BURNER_ROLE() view returns (bytes32)",
    "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
    "function hasRole(bytes32 role, address account) view returns (bool)"
  ];

  const phpa = new ethers.Contract(PHPA_ADDRESS, abi, provider);

  const FREEZER_ROLE = await phpa.FREEZER_ROLE();
  const MINTER_ROLE = await phpa.MINTER_ROLE();
  const BURNER_ROLE = await phpa.BURNER_ROLE();
  const DEFAULT_ADMIN_ROLE = await phpa.DEFAULT_ADMIN_ROLE();

  console.log("--- OPS vault (vault ID 1) ---");
  console.log("FREEZER_ROLE:", await phpa.hasRole(FREEZER_ROLE, OPS));
  console.log("MINTER_ROLE:", await phpa.hasRole(MINTER_ROLE, OPS));
  console.log("BURNER_ROLE:", await phpa.hasRole(BURNER_ROLE, OPS));
  console.log("DEFAULT_ADMIN_ROLE:", await phpa.hasRole(DEFAULT_ADMIN_ROLE, OPS));

  console.log("--- ADMIN vault (vault ID 2) ---");
  console.log("FREEZER_ROLE:", await phpa.hasRole(FREEZER_ROLE, ADMIN));
  console.log("MINTER_ROLE:", await phpa.hasRole(MINTER_ROLE, ADMIN));
  console.log("BURNER_ROLE:", await phpa.hasRole(BURNER_ROLE, ADMIN));
  console.log("DEFAULT_ADMIN_ROLE:", await phpa.hasRole(DEFAULT_ADMIN_ROLE, ADMIN));
}

main().catch(console.error);
