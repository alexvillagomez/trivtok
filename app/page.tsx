import AuthPanel from "@/components/AuthPanel";
import Feed from "@/components/Feed";
import { listQuestions } from "@/lib/db/questions";
import { toPublicQuestion } from "@/lib/types";

export const dynamic = "force-dynamic";

// Server component: strips embeddings before anything reaches the browser.
// Only PublicQuestion (text/choices/answer/difficulty) crosses to <Feed/>.
export default async function Page() {
  const questions = (await listQuestions()).map(toPublicQuestion);
  return (
    <>
      <AuthPanel />
      <Feed questions={questions} />
    </>
  );
}
