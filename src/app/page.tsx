import { Hero } from "@/components/landing/hero";
import { ProductShowcase } from "@/components/landing/product-showcase";
import { SiteHeader } from "@/components/landing/site-header";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <ProductShowcase />
      </main>
    </>
  );
}
