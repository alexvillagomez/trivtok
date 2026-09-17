import Home from "@/components/Home";
import Profile from "@/components/Profile";
import { listQuestions } from "@/lib/db/questions";
import { toPublicQuestion } from "@/lib/types";

export const dynamic = "force-dynamic";

// Server component: strips embeddings before anything reaches the browser.
// Only PublicQuestion (text/choices/answer/difficulty) crosses to the client.
// <Home/> gates the feed behind the first-visit interest picker; <Profile/>
// owns the top-right avatar → account/stats sheet (and auth).
export default async function Page() {
  const questions = (await listQuestions()).map(toPublicQuestion);
  // <Home/> first so <Profile/> (and the "Change interests" picker it opens)
  // paint above the feed — the picker overlay relies on later DOM order to stack.
  return (
    <>
      <Home questions={questions} />
      <Profile />
    </>
  );
}
