import { Signer } from "@linera/client";

/**
 * A composite signer that tries multiple signers in order.
 * It mimics the user's requested architecture.
 */
export class Composite implements Signer {
    private signers: Signer[];

    constructor(...signers: Signer[]) {
        this.signers = signers;
        console.log("🔧 Composite Signer created with", signers.length, "signers");
    }

    async address(): Promise<string> {
        if (this.signers.length > 0) {
            const addr = await this.signers[0].address();
            console.log("🔧 Composite.address() returning:", addr, "(first signer)");
            return addr;
        }
        throw new Error("Composite signer is empty");
    }

    async sign(owner: string, value: Uint8Array): Promise<string> {
        console.log("🔐 Composite.sign called for owner:", owner);

        for (let i = 0; i < this.signers.length; i++) {
            const signer = this.signers[i];
            const signerName = signer.constructor.name;

            try {
                const hasKey = await signer.containsKey(owner);
                console.log(`  ├─ Signer[${i}] (${signerName}) has key for ${owner}:`, hasKey);

                if (hasKey) {
                    console.log(`  └─ ✅ Using ${signerName} for signing`);
                    return await signer.sign(owner, value);
                }
            } catch (e) {
                console.log(`  ├─ ⚠️ Error checking ${signerName}:`, e);
                continue;
            }
        }

        console.error("  └─ ❌ No signer found for address:", owner);
        throw new Error(`No signer found for address: ${owner}`);
    }

    async containsKey(owner: string): Promise<boolean> {
        console.log("🔍 Composite.containsKey called for:", owner);

        for (const signer of this.signers) {
            try {
                const hasKey = await signer.containsKey(owner);
                if (hasKey) {
                    console.log("  └─ Found key in", signer.constructor.name);
                    return true;
                }
            } catch (e) {
                continue;
            }
        }

        console.log("  └─ No key found");
        return false;
    }
}
