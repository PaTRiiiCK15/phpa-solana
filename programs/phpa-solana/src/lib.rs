// ============================================================
//  PHPA — Philippine Peso Stablecoin (Solana / Anchor)
//  Issuer: Axelion | axelion.group | phpa.ph
//  Version: 1.0.0 (Solana devnet)
//  Chain: Solana (Token-2022)
//  Mirrors: polygon/contracts/PHPA.sol v1.1.2
//
//  Architecture:
//  - Token-2022 mint (SPL Token Extensions)
//  - This program (via a PDA) is the Token-2022 Mint Authority
//    and Freeze Authority — Solana has no native multi-role
//    AccessControl, so role separation is enforced in this
//    program's Config account, exactly mirroring Polygon's
//    MINTER_ROLE / BURNER_ROLE / PAUSER_ROLE / FREEZER_ROLE.
//  - Mintable:  minter role only
//  - Burnable:  burner role only (operator-initiated redemption,
//               no self-burn — same as Polygon v1.1.2)
//  - Pausable:  pauser role (custom Config flag — Token-2022 has
//               no native pause, so this is program-enforced)
//  - Freezable: freezer role, using Token-2022's NATIVE
//               freeze_account / thaw_account instructions
//               (AML/CFT + BSP regulatory compliance)
//  - Non-upgradeable by design (BSP white paper commitment) —
//    deploy without an upgrade authority once devnet testing
//    is complete.
//
//  IMPORTANT — Fireblocks SetAuthority restriction:
//  Fireblocks blocks the SetAuthority instruction on Solana by
//  default (confirmed by Jeffy, 2026-09-22). Since this program's
//  PDA — not a Fireblocks vault directly — holds Token-2022 mint
//  and freeze authority, SetAuthority is never called in normal
//  operation. Role changes happen by updating the Config account
//  (via update_role, admin-only), not by rotating Token-2022
//  authorities. This sidesteps the Fireblocks restriction entirely.
//
//  Roles (mirrors Polygon exactly):
//    admin    — role management, matches DEFAULT_ADMIN_ROLE
//    minter   — mint new PHPA after verified PHP receipt
//    burner   — burn PHPA after PHP disbursement confirmed
//    pauser   — emergency pause / unpause all mint/burn ops
//    freezer  — freeze / unfreeze individual token accounts
//
//  NOTE: Each role pubkey is expected to be a Fireblocks vault
//  address (PHPA-OPS-TESTNET-SOL, PHPA-ADMIN-TESTNET-SOL, etc).
//  Fireblocks TAP policy enforces multi-party approval BEFORE any
//  transaction reaches this program — same trust model as Polygon.
// ============================================================

use anchor_lang::prelude::*;
use anchor_spl::token_2022::{
    self, FreezeAccount, MintTo, ThawAccount, Token2022,
};
use anchor_spl::token_interface::{Burn, Mint, TokenAccount};

declare_id!("8PsEGMMHa76MzM2fXGFSt1x8fic5RcAza5cjLV6NCDd4");

// Amount precision: 6 decimals, matching Polygon (Hexens AXE1-1 fix).
// 1 PHPA = 1_000_000 units. mint 1_000_000 = 1.000000 PHPA = PHP 1.00
pub const PHPA_DECIMALS: u8 = 6;

pub const CONFIG_SEED: &[u8] = b"phpa-config";
pub const MINT_AUTHORITY_SEED: &[u8] = b"phpa-mint-authority";

#[program]
pub mod phpa {
    use super::*;

    // --------------------------------------------------------
    // INITIALIZE
    // --------------------------------------------------------

    /// Initializes the PHPA Config account, mirroring the Polygon
    /// constructor. All five roles are set at deploy time. In
    /// production, each role pubkey should be a distinct Fireblocks
    /// vault address (matching Polygon's fireblocksVault pattern),
    /// not a single shared key.
    pub fn initialize(
        ctx: Context<Initialize>,
        admin: Pubkey,
        minter: Pubkey,
        burner: Pubkey,
        pauser: Pubkey,
        freezer: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = admin;
        config.minter = minter;
        config.burner = burner;
        config.pauser = pauser;
        config.freezer = freezer;
        config.paused = false;
        config.mint = ctx.accounts.mint.key();
        config.bump = ctx.bumps.config;

        msg!("PHPA Config initialized. Mint: {}", config.mint);
        Ok(())
    }

    // --------------------------------------------------------
    // MINT
    // --------------------------------------------------------

    /// Mints new PHPA to a recipient token account.
    /// Mirrors Polygon's mint(): minter role only, called after
    /// PHP is received and confirmed in the reserve account, after
    /// Fireblocks 2-of-N policy approval has already happened
    /// off-chain before this instruction is even submitted.
    pub fn mint_phpa(ctx: Context<MintPhpa>, amount: u64) -> Result<()> {
        let config = &ctx.accounts.config;
        require_keys_eq!(
            ctx.accounts.minter.key(),
            config.minter,
            PhpaError::Unauthorized
        );
        require!(!config.paused, PhpaError::ContractPaused);
        require!(amount > 0, PhpaError::ZeroAmount);

        let seeds: &[&[u8]] = &[
            MINT_AUTHORITY_SEED,
            config.mint.as_ref(),
            &[ctx.bumps.mint_authority],
        ];
        let signer_seeds = &[seeds];

        let cpi_accounts = MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: ctx.accounts.mint_authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            cpi_accounts,
            signer_seeds,
        );
        token_2022::mint_to(cpi_ctx, amount)?;

        emit!(PhpaMinted {
            to: ctx.accounts.recipient_token_account.key(),
            amount,
            minted_by: ctx.accounts.minter.key(),
        });
        Ok(())
    }

    // --------------------------------------------------------
    // OPERATOR BURN (no self-burn, matches Polygon v1.1.2)
    // --------------------------------------------------------

    /// Burns PHPA from a holder's token account on redemption.
    /// Mirrors Polygon's operatorBurn(): burner role only, called
    /// after PHP has been disbursed to the user's bank account.
    /// This is the ONLY burn path — there is no self-burn
    /// instruction, matching Polygon v1.1.2 (self-burn removed).
    ///
    /// If the token account is currently frozen, this thaws it,
    /// burns, then re-freezes — atomically, within this single
    /// instruction — mirroring Polygon's _frozenBurnBypass flag,
    /// which lets the burner seize and burn a frozen balance
    /// without a separate unfreeze step.
    pub fn operator_burn(ctx: Context<OperatorBurn>, amount: u64) -> Result<()> {
        let config = &ctx.accounts.config;
        require_keys_eq!(
            ctx.accounts.burner.key(),
            config.burner,
            PhpaError::Unauthorized
        );
        require!(!config.paused, PhpaError::ContractPaused);
        require!(amount > 0, PhpaError::ZeroAmount);

        let was_frozen = ctx.accounts.source_token_account.is_frozen();

        let seeds: &[&[u8]] = &[
            MINT_AUTHORITY_SEED,
            config.mint.as_ref(),
            &[ctx.bumps.mint_authority],
        ];
        let signer_seeds = &[seeds];

        // Thaw first if frozen, so the burn CPI is permitted.
        if was_frozen {
            let thaw_accounts = ThawAccount {
                account: ctx.accounts.source_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            };
            token_2022::thaw_account(CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                thaw_accounts,
                signer_seeds,
            ))?;
        }

        let burn_accounts = Burn {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.source_token_account.to_account_info(),
            authority: ctx.accounts.mint_authority.to_account_info(),
        };
        token_2022::burn(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                burn_accounts,
                signer_seeds,
            ),
            amount,
        )?;

        // Re-freeze to restore prior state — the address remains
        // frozen after redemption, same end-state as Polygon where
        // _frozen[account] is untouched by operatorBurn.
        if was_frozen {
            let freeze_accounts = FreezeAccount {
                account: ctx.accounts.source_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            };
            token_2022::freeze_account(CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                freeze_accounts,
                signer_seeds,
            ))?;
        }

        emit!(PhpaBurned {
            from: ctx.accounts.source_token_account.key(),
            amount,
            burned_by: ctx.accounts.burner.key(),
        });
        Ok(())
    }

    // --------------------------------------------------------
    // PAUSE / UNPAUSE
    // --------------------------------------------------------

    /// Pauses all mint and burn operations. Mirrors Polygon's
    /// pause(): pauser role only, emergency use only (BSP
    /// directive, security incident, force majeure). Note: unlike
    /// Polygon, this does NOT block raw SPL token transfers between
    /// wallets, since those happen outside this program. It blocks
    /// mint_phpa and operator_burn only.
    pub fn pause(ctx: Context<SetPaused>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require_keys_eq!(
            ctx.accounts.pauser.key(),
            config.pauser,
            PhpaError::Unauthorized
        );
        config.paused = true;
        msg!("PHPA paused by {}", ctx.accounts.pauser.key());
        Ok(())
    }

    /// Unpauses mint and burn operations. Pauser role only.
    pub fn unpause(ctx: Context<SetPaused>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require_keys_eq!(
            ctx.accounts.pauser.key(),
            config.pauser,
            PhpaError::Unauthorized
        );
        config.paused = false;
        msg!("PHPA unpaused by {}", ctx.accounts.pauser.key());
        Ok(())
    }

    // --------------------------------------------------------
    // FREEZE / UNFREEZE
    // --------------------------------------------------------

    /// Freezes a token account, blocking all sends/receives on it.
    /// Mirrors Polygon's freeze(): freezer role only, AML/CFT
    /// compliance tool. Uses Token-2022's NATIVE freeze_account
    /// instruction rather than a custom mapping, since Solana
    /// enforces the freeze at the SPL Token program level — the
    /// account cannot transfer even to this program until thawed.
    pub fn freeze_address(ctx: Context<FreezeAddress>) -> Result<()> {
        let config = &ctx.accounts.config;
        require_keys_eq!(
            ctx.accounts.freezer.key(),
            config.freezer,
            PhpaError::Unauthorized
        );

        let seeds: &[&[u8]] = &[
            MINT_AUTHORITY_SEED,
            config.mint.as_ref(),
            &[ctx.bumps.mint_authority],
        ];
        let signer_seeds = &[seeds];

        let cpi_accounts = FreezeAccount {
            account: ctx.accounts.target_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.mint_authority.to_account_info(),
        };
        token_2022::freeze_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            cpi_accounts,
            signer_seeds,
        ))?;

        emit!(PhpaAddressFrozen {
            account: ctx.accounts.target_token_account.key(),
            frozen_by: ctx.accounts.freezer.key(),
        });
        Ok(())
    }

    /// Unfreezes a previously frozen token account. Freezer role only.
    pub fn unfreeze_address(ctx: Context<FreezeAddress>) -> Result<()> {
        let config = &ctx.accounts.config;
        require_keys_eq!(
            ctx.accounts.freezer.key(),
            config.freezer,
            PhpaError::Unauthorized
        );

        let seeds: &[&[u8]] = &[
            MINT_AUTHORITY_SEED,
            config.mint.as_ref(),
            &[ctx.bumps.mint_authority],
        ];
        let signer_seeds = &[seeds];

        let cpi_accounts = ThawAccount {
            account: ctx.accounts.target_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.mint_authority.to_account_info(),
        };
        token_2022::thaw_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            cpi_accounts,
            signer_seeds,
        ))?;

        emit!(PhpaAddressUnfrozen {
            account: ctx.accounts.target_token_account.key(),
            unfrozen_by: ctx.accounts.freezer.key(),
        });
        Ok(())
    }

    // --------------------------------------------------------
    // ROLE MANAGEMENT (admin only — mirrors DEFAULT_ADMIN_ROLE)
    // --------------------------------------------------------

    /// Updates a single role's pubkey. Admin only. This is how role
    /// rotation happens on Solana instead of Fireblocks SetAuthority
    /// (which is blocked). Changing a role here does NOT touch
    /// Token-2022 mint/freeze authority — the program PDA remains
    /// the on-chain authority permanently; only who is allowed to
    /// direct it changes.
    pub fn update_role(
        ctx: Context<UpdateRole>,
        role: PhpaRole,
        new_key: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require_keys_eq!(
            ctx.accounts.admin.key(),
            config.admin,
            PhpaError::Unauthorized
        );

        match role {
            PhpaRole::Admin => config.admin = new_key,
            PhpaRole::Minter => config.minter = new_key,
            PhpaRole::Burner => config.burner = new_key,
            PhpaRole::Pauser => config.pauser = new_key,
            PhpaRole::Freezer => config.freezer = new_key,
        }

        msg!("PHPA role {:?} updated to {}", role, new_key);
        Ok(())
    }
}

// ================================================================
// ACCOUNTS
// ================================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + PhpaConfig::INIT_SPACE,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump
    )]
    pub config: Account<'info, PhpaConfig>,

    /// CHECK: this PDA becomes the Token-2022 mint + freeze authority.
    /// Validated by seeds, never read as data.
    #[account(
        seeds = [MINT_AUTHORITY_SEED, mint.key().as_ref()],
        bump
    )]
    pub mint_authority: UncheckedAccount<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintPhpa<'info> {
    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, PhpaConfig>,

    /// CHECK: validated by seeds against config.mint
    #[account(
        seeds = [MINT_AUTHORITY_SEED, mint.key().as_ref()],
        bump
    )]
    pub mint_authority: UncheckedAccount<'info>,

    #[account(mut, address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    pub minter: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct OperatorBurn<'info> {
    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, PhpaConfig>,

    /// CHECK: validated by seeds against config.mint
    #[account(
        seeds = [MINT_AUTHORITY_SEED, mint.key().as_ref()],
        bump
    )]
    pub mint_authority: UncheckedAccount<'info>,

    #[account(mut, address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub source_token_account: InterfaceAccount<'info, TokenAccount>,

    pub burner: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct SetPaused<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, PhpaConfig>,

    pub pauser: Signer<'info>,
}

#[derive(Accounts)]
pub struct FreezeAddress<'info> {
    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, PhpaConfig>,

    /// CHECK: validated by seeds against config.mint
    #[account(
        seeds = [MINT_AUTHORITY_SEED, mint.key().as_ref()],
        bump
    )]
    pub mint_authority: UncheckedAccount<'info>,

    #[account(address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub target_token_account: InterfaceAccount<'info, TokenAccount>,

    pub freezer: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct UpdateRole<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, PhpaConfig>,

    pub admin: Signer<'info>,
}

// ================================================================
// STATE
// ================================================================

#[account]
#[derive(InitSpace)]
pub struct PhpaConfig {
    pub admin: Pubkey,
    pub minter: Pubkey,
    pub burner: Pubkey,
    pub pauser: Pubkey,
    pub freezer: Pubkey,
    pub mint: Pubkey,
    pub paused: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub enum PhpaRole {
    Admin,
    Minter,
    Burner,
    Pauser,
    Freezer,
}

// ================================================================
// EVENTS — mirrors Polygon's Minted / Burned / AddressFrozen /
// AddressUnfrozen events for a consistent audit trail across chains.
// ================================================================

#[event]
pub struct PhpaMinted {
    pub to: Pubkey,
    pub amount: u64,
    pub minted_by: Pubkey,
}

#[event]
pub struct PhpaBurned {
    pub from: Pubkey,
    pub amount: u64,
    pub burned_by: Pubkey,
}

#[event]
pub struct PhpaAddressFrozen {
    pub account: Pubkey,
    pub frozen_by: Pubkey,
}

#[event]
pub struct PhpaAddressUnfrozen {
    pub account: Pubkey,
    pub unfrozen_by: Pubkey,
}

// ================================================================
// ERRORS
// ================================================================

#[error_code]
pub enum PhpaError {
    #[msg("Caller does not hold the required PHPA role")]
    Unauthorized,
    #[msg("PHPA program is paused")]
    ContractPaused,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
}
