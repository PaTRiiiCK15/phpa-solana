const hre = require("hardhat");

async function main() {
  const PHPA_ADDRESS = "0x5F032911775d8A0304e57cA35ba659290749EaD3";
  const OPS_VAULT = "0x8ECf844D4Cf0a6F77033D552F8ee45F3FdF2DBbd";
  const ADMIN_VAULT = "0x9f2C68888aA7e453dA5aC6e40F5acd455306f00B";

  const phpa = await hre.ethers.getContractAt("PHPA", PHPA_ADDRESS);

  const DEFAULT_ADMIN_ROLE = await phpa.DEFAULT_ADMIN_ROLE();

  // Safety check: verify PHPA-ADMIN-MAINNET has DEFAULT_ADMIN_ROLE before revoking from OPS
  const adminHasRole = await phpa.hasRole(DEFAULT_ADMIN_ROLE, ADMIN_VAULT);
  console.log("PHPA-ADMIN-MAINNET has DEFAULT_ADMIN_ROLE:", adminHasRole);

  if (!adminHasRole) {
    console.error("STOP: PHPA-ADMIN-MAINNET does not have DEFAULT_ADMIN_ROLE. Run grantRole first.");
    process.exit(1);
  }

  console.log("Revoking DEFAULT_ADMIN_ROLE from PHPA-OPS-MAINNET...");
  const tx = await phpa.revokeRole(DEFAULT_ADMIN_ROLE, OPS_VAULT);
  await tx.wait();

  console.log("revokeRole transaction confirmed:", tx.hash);
  console.log("DEFAULT_ADMIN_ROLE successfully removed from PHPA-OPS-MAINNET:", OPS_VAULT);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
