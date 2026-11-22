import { DomainFinder } from "@/components/domain-finder";
import { readyProviders } from "@/lib/ai";
import { providers } from "@/lib/availability";

export const dynamic = "force-dynamic"; // read env at request time

export default function Page() {
  return (
    <DomainFinder
      aiProviders={readyProviders()}
      checkers={{ ir: providers.ir(), other: providers.other() }}
    />
  );
}
