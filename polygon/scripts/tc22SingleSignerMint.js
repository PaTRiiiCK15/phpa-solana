const hre = require("hardhat");

async function main() {
  const PHPA_ADDRESS = "0xAB9b61022C0f8aC255F5E437Bb303A7E55504987";
  const RECIPIENT = "0x9A62A003Eb05247772Ab87437F6a5A9F3f77aE53";
  const AMOUNT = hre.ethers.parseUnits("1", 18);

  const phpa = await hre.ethers.getContractAt("PHPA", PHPA_ADDRESS);

  console.log("TC-22: Initiating mint of 1 PHPA to USER-TEST-001...");
  console.log("Recipient:", RECIPIENT);
  console.log("TAP requires 2-of-2 approval. Kengo must NOT approve.");

  const tx = await phpa.mint(RECIPIENT, AMOUNT);
  console.log("Transaction submitted. Hash:", tx.hash);
  console.log("Transaction is now pending TAP approval.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error.message);
    process.exit(1);
  });
