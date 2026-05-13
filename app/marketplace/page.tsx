// app/marketplace/page.tsx
// Server wrapper para exportar metadata. La UI vive en MarketplaceView
// (client component) porque ahora los chips de categoría filtran en
// cliente con useState.

import MarketplaceView from "./marketplace-view";

export const metadata = {
  title: "Marketplace — La Banda Los Del Sur",
};

export default function MarketplacePage() {
  return <MarketplaceView />;
}
