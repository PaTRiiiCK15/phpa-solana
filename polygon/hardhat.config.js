require("@nomicfoundation/hardhat-toolbox");
require("@fireblocks/hardhat-fireblocks");
require("dotenv").config();

/** @type import("hardhat/config").HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  networks: {
    polygonMainnet: {
      url: "https://polygon-mainnet.g.alchemy.com/v2/alch_oGoBFrHdRgj0vaLcujt9x",
      chainId: 137,
    },
    fireblocksMainnet: {
      url: "https://polygon-mainnet.g.alchemy.com/v2/alch_oGoBFrHdRgj0vaLcujt9x",
      fireblocks: {
        apiBaseUrl: process.env.FIREBLOCKS_BASE_URL,
        privateKey: process.env.FIREBLOCKS_SECRET_KEY_PATH,
        apiKey: process.env.FIREBLOCKS_API_KEY,
        vaultAccountIds: process.env.FIREBLOCKS_VAULT_ACCOUNT_ID,
        assetId: "MATIC_POLYGON",
      },
      chainId: 137,
    },
    fireblocksAmoy: {
      url: "https://polygon-amoy.g.alchemy.com/v2/alch_5ckxOBI9tfkkTYKiexoRB",
      fireblocks: {
        apiBaseUrl: process.env.FIREBLOCKS_BASE_URL,
        privateKey: process.env.FIREBLOCKS_SECRET_KEY_PATH,
        apiKey: process.env.FIREBLOCKS_API_KEY,
        vaultAccountIds: process.env.FIREBLOCKS_VAULT_ACCOUNT_ID,
      },
      chainId: 80002,
    },
    polygonAmoy: {
      url: "https://polygon-amoy.g.alchemy.com/v2/alch_5ckxOBI9tfkkTYKiexoRB",
      chainId: 80002,
    },
  },
  etherscan: {
    apiKey: "M7VVA5T15IJKAUG78I1AIPZ8UQ24HAIMNR",
    customChains: [
      {
        network: "polygonAmoy",
        chainId: 80002,
        urls: {
          apiURL: "https://api-amoy.polygonscan.com/api",
          browserURL: "https://amoy.polygonscan.com"
        }
      }
    ]
  }
};
