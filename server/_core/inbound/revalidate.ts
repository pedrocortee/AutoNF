/**
 * Re-validates a company's documents in review after routing changed (new company
 * registered, documents assigned). XML documents are exact, so when nothing is left
 * to fix they are approved; LLM-read documents stay for a human.
 */

import { listInReviewForCompany, transitionInbound, updateInboundDocument } from "../../inboundDb";
import { validateDocument } from "./validators";

export async function revalidateCompanyDocuments(userId: number, companyId: number, companyDocument: string): Promise<{ revalidated: number; approved: number }> {
  const docs = await listInReviewForCompany(userId, companyId);
  let approved = 0;
  for (const doc of docs) {
    if (!doc.extracted) continue;
    const carried = (doc.issues ?? []).filter((i) => i.code === "possible_duplicate");
    const issues = [...validateDocument(doc.extracted, { companyDocuments: [companyDocument], method: doc.method ?? "llm" }), ...carried];
    await updateInboundDocument(doc.id, { issues });
    if (issues.length === 0 && doc.method === "xml" && doc.reviewedBy === null) {
      await transitionInbound(doc.id, "aprovado", { note: "Aprovado automaticamente após cadastro da empresa" });
      approved++;
    }
  }
  return { revalidated: docs.length, approved };
}
