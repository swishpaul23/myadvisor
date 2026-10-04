import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { loadReferenceData } from "@/lib/data/source";

/**
 * Shows where loadReferenceData() got the reference data. Server component; the fallback
 * reason stays in the server log (it can name the Snowflake account).
 */
export async function DataSourceBadge() {
  await connection(); // render per request, never at build time
  const data = await loadReferenceData();
  if (data.source === "snowflake") {
    return <Badge variant="secondary">Data: Snowflake</Badge>;
  }
  if (data.fallbackReason !== null) {
    return <Badge variant="destructive">Data: JSON fallback</Badge>;
  }
  return <Badge variant="outline">Data: JSON</Badge>;
}
