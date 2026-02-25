"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { base, baseSepolia } from "viem/chains";
import { createConfig, http } from "wagmi";

// Some parts of the demo (and certain libs) may stringify objects containing BigInt values.
// In Next dev, this can surface as a runtime overlay ("JSON.stringify cannot serialize BigInt").
// Patch once globally on the client to keep the UI stable.
if (typeof BigInt !== "undefined" && typeof (BigInt.prototype as any).toJSON !== "function") {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
}

const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http()
  }
});

const queryClient = new QueryClient();

export default function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  // Allow the app to build/render even before Privy is configured.
  if (!appId) return <>{children}</>;

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["wallet"],
        defaultChain: base,
        supportedChains: [base, baseSepolia],
        appearance: {
          theme: "dark",
          accentColor: "#35c2ff",
          logo: undefined
        }
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
