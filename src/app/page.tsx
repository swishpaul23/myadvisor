import { Hero } from "@/components/landing/hero";
import { ScrollReveal } from "@/components/landing/scroll-reveal";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
      </main>
      <SiteFooter />
      <ScrollReveal />
    </>
  );
}
