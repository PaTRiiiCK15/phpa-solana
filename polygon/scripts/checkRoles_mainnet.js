const { ethers } = require("ethers");

async function main() {
  const PHPA_ADDRESS = "0x5F032911775d8A0304e57cA35ba659290749EaD3";
  const OPS = "0x8ECf844D4Cf0a6F77033D552F8ee45F3FdF2DBbd";
  const ADMIN = "0x9f2C68888aA7e453dA5aC6e40F5acd455306f00B";

  const provider = new ethers.JsonRpcProvider("https://polygon-mainnet.g.alchemy.com/v2/alch_oGoBFrHdRgj0vaLcujt9x");

  const abi = [
    "function FREEZER_ROLE() view returns (bytes32)",
    "function MINTER_ROLE() view returns (bytes32)",
    "function BURNER_ROLE() view returns (bytes32)",
    "function PAUSER_ROLE() view returns (bytes32)",
    "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
    "function hasRole(bytes32 role, address account) view returns (bool)"
  ];

  const phpa = new ethers.Contract(PHPA_ADDRESS, abi, provider);

  const FREEZER_ROLE = await phpa.FREEZER_ROLE();
  const MINTER_ROLE = await phpa.MINTER_ROLE();
  const BURNER_ROLE = await phpa.BURNER_ROLE();
  const PAUSER_ROLE = await phpa.PAUSER_ROLE();
  const DEFAULT_ADMIN_ROLE = await phpa.DEFAULT_ADMIN_ROLE();

  console.log("--- PHPA-OPS-MAINNET ---");
  console.log("MINTER_ROLE:", await phpa.hasRole(MINTER_ROLE, OPS));
  console.log("BURNER_ROLE:", await phpa.hasRole(BURNER_ROLE, OPS));
  console.log("PAUSER_ROLE:", await phpa.hasRole(PAUSER_ROLE, OPS));
  console.log("FREEZER_ROLE:", await phpa.hasRole(FREEZER_ROLE, OPS));
  console.log("DEFAULT_ADMIN_ROLE:", await phpa.hasRole(DEFAULT_ADMIN_ROLE, OPS));

  console.log("--- PHPA-ADMIN-MAINNET ---");
  console.log("MINTER_ROLE:", await phpa.hasRole(MINTER_ROLE, ADMIN));
  console.log("BURNER_ROLE:", await phpa.hasRole(BURNER_ROLE, ADMIN));
  console.log("PAUSER_ROLE:", await phpa.hasRole(PAUSER_ROLE, ADMIN));
  console.log("FREEZER_ROLE:", await phpa.hasRole(FREEZER_ROLE, ADMIN));
  console.log("DEFAULT_ADMIN_ROLE:", await phpa.hasRole(DEFAULT_ADMIN_ROLE, ADMIN));
}

main().catch(console.error);
