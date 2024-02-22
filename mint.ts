import { getKeypairFromFile } from "@solana-developers/helpers";
import { ExtensionType, LENGTH_SIZE, TOKEN_2022_PROGRAM_ID, TYPE_SIZE, createInitializeMetadataPointerInstruction, createInitializeMintInstruction, getMintLen, getTokenMetadata } from "@solana/spl-token";
import { TokenMetadata, createInitializeInstruction, createUpdateFieldInstruction, pack } from "@solana/spl-token-metadata";
import { Connection, Keypair, SystemProgram, Transaction, clusterApiUrl, sendAndConfirmTransaction } from "@solana/web3.js";

// connect to the solana blockchain (devnet for this demo)
const connection = new Connection(
    clusterApiUrl("devnet"), 
    { commitment: "confirmed" }
)

// load a keypair from the local filesystem with devnet SOL
const payer = await getKeypairFromFile("~/.config/solana/id.json")
console.log("payer:", payer.publicKey.toBase58())

// generate a new, random keypair to use as our mint
const mint = Keypair.generate();
console.log("mint:", mint.publicKey.toBase58())

// define our custom metadata for our token
const metadata : TokenMetadata = {
    mint: mint.publicKey,
    name: "Only Possible on Solana",
    symbol: "OPOS",
    uri: "https://raw.githubusercontent.com/solana-developers/opos-asset/main/assets/DeveloperPortal/metadata.json",
    additionalMetadata: [
        ["key", "value"],
        ["custom", "data"]
    ]
}

// calculate the space required for our onchain metadata
const metadataSpace = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length

// calculate the space required to allocate the mint account
const mintSpace = getMintLen([
    ExtensionType.MetadataPointer
])

// ask the blockchain how many lamports we need to pay
const lamports = await connection.getMinimumBalanceForRentExemption(
    mintSpace + metadataSpace
)

// allocate the mint's account state on chain
const createAccountIx = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: mint.publicKey,
    // note: the mint's space must be exact and should not 
    // include the variable length metadata space
    space: mintSpace, 
    lamports,
    programId: TOKEN_2022_PROGRAM_ID
})

// add the metadata pointer, setting our mint as our metadata account
const initializeMetadataPointerIx = createInitializeMetadataPointerInstruction(
    mint.publicKey,
    payer.publicKey,
    mint.publicKey,
    TOKEN_2022_PROGRAM_ID
)

// initialize the actual mint account
const initializeMintIx = createInitializeMintInstruction(
    mint.publicKey,
    2, // decimals
    payer.publicKey,
    null,
    TOKEN_2022_PROGRAM_ID
)

// initialize the actual metadata on the mint
const initializeMetadataIx = createInitializeInstruction({
    mint: mint.publicKey,
    metadata: mint.publicKey,
    mintAuthority: payer.publicKey,
    name: metadata.name,
    symbol: metadata.symbol,
    uri: metadata.uri,
    programId: TOKEN_2022_PROGRAM_ID,
    updateAuthority: payer.publicKey
})

// append each of our custom additional metadata fields
const updateMetadataFields = metadata.additionalMetadata.map((_, id) => 
    createUpdateFieldInstruction({
        metadata: mint.publicKey,
        programId: TOKEN_2022_PROGRAM_ID,
        updateAuthority: payer.publicKey,
        field: metadata.additionalMetadata[id][0],
        value: metadata.additionalMetadata[id][1]
    })
)

/**
 * note: each field requires a separate instruction 
 * (so we `map` over all of them to create an array)
*/

// build our transaction
const transaction = new Transaction().add(
    createAccountIx,
    initializeMetadataPointerIx,
    initializeMintIx,
    // these instructions are required to be after initializing the mint
    initializeMetadataIx,
    ...updateMetadataFields
)

console.log("\nSending transaction...");

// actually send the transaction to create our token
const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [payer, mint],
)


// get the metadata from the solana blockchain
const chainMetadata = await getTokenMetadata(
    connection,
    mint.publicKey
)

console.log("\nMetadata:", JSON.stringify(chainMetadata, null, 2));

// console.log(`https://explorer.solana.com/tx/${signature}?cluster=devnet`);
console.log(`https://solana.fm/tx/${signature}?cluster=devnet-alpha`);
console.log(`https://solana.fm/address/${mint.publicKey.toBase58()}?cluster=devnet-alpha`);
